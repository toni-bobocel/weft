import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { type Op, Replica } from '../src/index.js'

// The claim the whole project rests on, checked on thousands of generated
// histories: whatever each replica did, and however badly the network
// delivered it (reordered, duplicated, partially dropped and resent), once
// every replica has seen every op they hold identical state.

const SITES = ['ana', 'bo', 'cy'] as const

// Long runs (WEFT_RUNS) take a while on a CI runner; the default 5 s is for unit tests.
const LONG = 180_000

const edit = fc.oneof(
  fc.record({
    kind: fc.constant('set' as const),
    entity: fc.constantFrom('task-a', 'task-b'),
    field: fc.constantFrom('title', 'status'),
    value: fc.oneof(fc.string({ maxLength: 4 }), fc.integer({ min: 0, max: 3 })),
  }),
  fc.record({
    kind: fc.constant('ins' as const),
    at: fc.double({ min: 0, max: 1, noNaN: true }),
    text: fc.string({ minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('del' as const),
    at: fc.double({ min: 0, max: 1, noNaN: true }),
    length: fc.integer({ min: 1, max: 3 }),
  }),
)

const step = fc.oneof(
  { weight: 3, arbitrary: fc.record({ type: fc.constant('edit' as const), on: fc.nat(2), edit }) },
  {
    weight: 2,
    arbitrary: fc.record({
      type: fc.constant('deliver' as const),
      from: fc.nat(2),
      to: fc.nat(2),
      // Network damage: which of the outstanding ops get through, twice or in a new order.
      keep: fc.array(fc.boolean(), { maxLength: 40 }),
      twice: fc.boolean(),
      order: fc.array(fc.nat(1000), { maxLength: 40 }),
    }),
  },
  // Wall clocks are allowed to disagree and to jump backwards.
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant('tick' as const),
      on: fc.nat(2),
      by: fc.integer({ min: -50, max: 500 }),
    }),
  },
)

function world() {
  const time = [1_000, 1_000, 1_000]
  const replicas = SITES.map((site, i) => new Replica(site, { now: () => time[i] ?? 0 }))
  return { time, replicas }
}

function shuffle<T>(items: T[], keys: number[]) {
  return items
    .map((item, i) => ({ item, key: keys[i] ?? i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item)
}

function settle(replicas: Replica[]) {
  for (let round = 0; round < 4; round++) {
    for (const from of replicas)
      for (const to of replicas) if (from !== to) to.receive(from.missingFrom(to.versionVector))
  }
}

describe('convergence', () => {
  it(
    'reaches one state whatever the edits and however they are delivered',
    () => {
      fc.assert(
        fc.property(fc.array(step, { maxLength: 80, size: 'max' }), (steps) => {
          const { time, replicas } = world()
          for (const s of steps) {
            if (s.type === 'tick') {
              time[s.on] = (time[s.on] ?? 0) + s.by
            } else if (s.type === 'edit') {
              const r = replicas[s.on] as Replica
              const e = s.edit
              const len = r.text('note').length
              if (e.kind === 'set') r.set(e.entity, e.field, e.value)
              else if (e.kind === 'ins')
                r.insertText('note', Math.min(Math.floor(e.at * (len + 1)), len), e.text)
              else if (len > 0) r.deleteText('note', Math.floor(e.at * len), e.length)
            } else if (s.from !== s.to) {
              const from = replicas[s.from] as Replica
              const to = replicas[s.to] as Replica
              const outstanding = from.missingFrom(to.versionVector)
              let batch: Op[] = outstanding.filter((_, i) => s.keep[i] ?? true)
              if (s.twice) batch = [...batch, ...batch]
              to.receive(shuffle(batch, s.order))
            }
          }

          settle(replicas)
          const [a, ...rest] = replicas as [Replica, ...Replica[]]
          for (const r of rest) {
            expect(r.digest()).toBe(a.digest())
            expect(r.text('note')).toBe(a.text('note'))
            expect(r.pendingCount).toBe(0)
          }
        }),
        { numRuns: Number(process.env.WEFT_RUNS ?? 1500) },
      )
    },
    LONG,
  )

  it(
    'behaves exactly like a string when there is only one writer',
    () => {
      fc.assert(
        fc.property(fc.array(edit, { maxLength: 120, size: 'max' }), (edits) => {
          const r = new Replica('solo', { now: () => 1 })
          let model = ''
          for (const e of edits) {
            if (e.kind === 'ins') {
              const at = Math.min(Math.floor(e.at * (model.length + 1)), model.length)
              r.insertText('note', at, e.text)
              model = model.slice(0, at) + e.text + model.slice(at)
            } else if (e.kind === 'del' && model.length) {
              const at = Math.floor(e.at * model.length)
              r.deleteText('note', at, e.length)
              model = model.slice(0, at) + model.slice(at + e.length)
            }
          }
          expect(r.text('note')).toBe(model)
        }),
        { numRuns: 800 },
      )
    },
    LONG,
  )
})

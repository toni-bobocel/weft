import { Clock, encode } from './hlc.js'
import { Records, type Superseded } from './lww.js'
import type { DeleteOp, InsertOp, Json, Op, SetOp, VersionVector } from './ops.js'
import { type Outcome, Sequence } from './rga.js'

export interface Received {
  applied: Op[]
  /** Waiting for an earlier op from the same site, or for the character they anchor to. */
  pending: number
  superseded: Superseded[]
}

type Listener = (ops: Op[], origin: 'local' | 'remote') => void

interface Options {
  now?: () => number
  maxDriftMs?: number
}

export class Replica {
  readonly clock: Clock
  readonly records = new Records()
  readonly #docs = new Map<string, Sequence>()
  readonly #log = new Map<string, Op[]>()
  readonly #vv: VersionVector = {}
  #pending: Op[] = []
  readonly #listeners = new Set<Listener>()

  constructor(
    readonly site: string,
    opts: Options = {},
  ) {
    this.clock = new Clock(site, opts.now, opts.maxDriftMs)
  }

  // ── local edits ──

  set(entity: string, field: string, value: Json) {
    const op = this.#local<SetOp>((base) => ({ ...base, kind: 'set', entity, field, value }))
    this.#emit([op], 'local')
    return op
  }

  insertText(doc: string, index: number, text: string) {
    let after = this.doc(doc).idBefore(index)
    const ops: InsertOp[] = []
    for (const ch of text) {
      const op = this.#local<InsertOp>((base) => ({ ...base, kind: 'ins', doc, after, ch }))
      ops.push(op)
      after = encode(op.ts)
    }
    if (ops.length) this.#emit(ops, 'local')
    return ops
  }

  deleteText(doc: string, index: number, length: number) {
    const ops = this.doc(doc)
      .visibleIds(index, length)
      .map((target) => this.#local<DeleteOp>((base) => ({ ...base, kind: 'del', doc, target })))
    if (ops.length) this.#emit(ops, 'local')
    return ops
  }

  // ── sync ──

  get versionVector(): Readonly<VersionVector> {
    return this.#vv
  }

  /** Everything this replica holds that a peer with `theirs` has not seen, in causal order per site. */
  missingFrom(theirs: Readonly<VersionVector>): Op[] {
    const out: Op[] = []
    for (const [site, ops] of this.#log) out.push(...ops.slice(theirs[site] ?? 0))
    return out
  }

  /**
   * Accepts ops in any order, any number of times. Duplicates are dropped,
   * gaps and missing anchors are parked until what they depend on arrives.
   */
  receive(ops: readonly Op[]): Received {
    const applied: Op[] = []
    const superseded: Superseded[] = []
    let queue = [...this.#pending, ...ops]
    let progress = true
    while (progress) {
      progress = false
      const parked: Op[] = []
      for (const op of queue) {
        const have = this.#vv[op.site] ?? 0
        if (op.seq <= have) continue
        if (op.seq > have + 1) {
          parked.push(op)
          continue
        }
        const outcome = this.#apply(op)
        if (outcome === 'missing') {
          parked.push(op)
          continue
        }
        this.clock.observe(op.ts)
        this.#append(op)
        applied.push(op)
        if (outcome && typeof outcome === 'object') superseded.push(outcome)
        progress = true
      }
      queue = parked
    }
    this.#pending = dedupe(queue)
    if (applied.length) this.#emit(applied, 'remote')
    return { applied, pending: this.#pending.length, superseded }
  }

  // ── reading ──

  doc(id: string) {
    let seq = this.#docs.get(id)
    if (!seq) {
      seq = new Sequence()
      this.#docs.set(id, seq)
    }
    return seq
  }

  // Reading never creates a document: an empty one would change the digest.
  text(id: string) {
    return this.#docs.get(id)?.toString() ?? ''
  }

  get opCount() {
    let n = 0
    for (const ops of this.#log.values()) n += ops.length
    return n
  }

  get pendingCount() {
    return this.#pending.length
  }

  /** Two replicas with equal digests hold identical state, tombstones and timestamps included. */
  digest() {
    const docs = [...this.#docs]
      .filter(([, seq]) => seq.size > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, seq]) => [k, seq.canonical()])
    return fnv1a(JSON.stringify([this.records.canonical(), docs]))
  }

  subscribe(listener: Listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  // ── internals ──

  #local<T extends Op>(make: (base: Pick<Op, 'site' | 'seq' | 'ts'>) => T): T {
    const op = make({ site: this.site, seq: (this.#vv[this.site] ?? 0) + 1, ts: this.clock.now() })
    this.#apply(op)
    this.#append(op)
    return op
  }

  #apply(op: Op): Outcome | Superseded | undefined {
    switch (op.kind) {
      case 'set':
        return this.records.apply(op)
      case 'ins':
        return this.doc(op.doc).insert(op)
      case 'del':
        return this.doc(op.doc).delete(op)
    }
  }

  #append(op: Op) {
    let ops = this.#log.get(op.site)
    if (!ops) {
      ops = []
      this.#log.set(op.site, ops)
    }
    ops.push(op)
    this.#vv[op.site] = op.seq
  }

  #emit(ops: Op[], origin: 'local' | 'remote') {
    for (const l of this.#listeners) l(ops, origin)
  }
}

function dedupe(ops: Op[]) {
  const seen = new Set<string>()
  return ops.filter((op) => {
    const key = `${op.site}:${op.seq}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** 64-bit FNV-1a, as hex. Not cryptographic: only answers "same state or not". */
function fnv1a(s: string) {
  let h = 0xcbf29ce484222325n
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i))
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return h.toString(16).padStart(16, '0')
}

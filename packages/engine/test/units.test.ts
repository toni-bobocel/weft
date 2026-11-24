import { describe, expect, it } from 'vitest'
import {
  Clock,
  ClockDriftError,
  compare,
  decode,
  encode,
  type Message,
  peer,
  Replica,
} from '../src/index.js'

const fixed = (t: number) => () => t

describe('hybrid logical clock', () => {
  it('keeps moving forward when the wall clock jumps back', () => {
    let wall = 1_000
    const clock = new Clock('a', () => wall)
    const first = clock.now()
    wall = 400
    const second = clock.now()
    expect(compare(second, first)).toBeGreaterThan(0)
    expect(second.wall).toBe(1_000)
  })

  it('orders an event after anything it has observed, whatever the local time', () => {
    const behind = new Clock('b', fixed(100))
    behind.observe({ wall: 5_000, count: 3, node: 'a' })
    const next = behind.now()
    expect(compare(next, { wall: 5_000, count: 3, node: 'a' })).toBeGreaterThan(0)
  })

  it('refuses a peer whose clock is too far ahead', () => {
    const clock = new Clock('a', fixed(0), 60_000)
    expect(() => clock.observe({ wall: 3_600_000, count: 0, node: 'z' })).toThrow(ClockDriftError)
  })

  it('encodes to strings that sort like timestamps', () => {
    const ts = [
      { wall: 9, count: 0, node: 'b' },
      { wall: 10, count: 0, node: 'a' },
      { wall: 10, count: 2, node: 'a' },
      { wall: 10, count: 2, node: 'b' },
    ]
    const encoded = ts.map(encode)
    expect([...encoded].sort()).toEqual(encoded)
    expect(encoded.map(decode)).toEqual(ts)
  })
})

describe('last-writer-wins records', () => {
  it('lands on the same value whichever write arrives first', () => {
    const a = new Replica('a', { now: fixed(100) })
    const b = new Replica('b', { now: fixed(200) })
    const early = a.set('issue', 'title', 'Fix login')
    const late = b.set('issue', 'title', 'Fix auth')

    const x = new Replica('x', { now: fixed(300) })
    const y = new Replica('y', { now: fixed(300) })
    x.receive([early, late])
    y.receive([late, early])
    expect(x.records.get('issue')).toEqual({ title: 'Fix auth' })
    expect(y.records.get('issue')).toEqual({ title: 'Fix auth' })
    expect(x.digest()).toBe(y.digest())
  })

  it('reports what a concurrent write lost to', () => {
    const a = new Replica('a', { now: fixed(100) })
    const b = new Replica('b', { now: fixed(200) })
    a.set('issue', 'status', 'todo')
    const winner = b.set('issue', 'status', 'done')
    const { superseded } = a.receive([winner])
    expect(superseded).toEqual([
      expect.objectContaining({
        field: 'status',
        kept: expect.objectContaining({ value: 'done' }),
      }),
    ])
  })
})

describe('sequence', () => {
  it('does not interleave two words typed at the same spot', () => {
    const a = new Replica('a', { now: fixed(10) })
    const b = new Replica('b', { now: fixed(10) })
    const base = a.insertText('note', 0, '[]')
    b.receive(base)
    const fromA = a.insertText('note', 1, 'merge')
    const fromB = b.insertText('note', 1, 'sync')
    a.receive(fromB)
    b.receive(fromA)
    expect(a.text('note')).toBe(b.text('note'))
    expect(['[mergesync]', '[syncmerge]']).toContain(a.text('note'))
  })

  it('keeps a character typed after one that was deleted concurrently', () => {
    const a = new Replica('a', { now: fixed(10) })
    const b = new Replica('b', { now: fixed(20) })
    b.receive(a.insertText('note', 0, 'cat'))
    const del = a.deleteText('note', 1, 1)
    const ins = b.insertText('note', 2, 'r')
    a.receive(ins)
    b.receive(del)
    expect(a.text('note')).toBe('crt')
    expect(b.text('note')).toBe('crt')
  })
})

describe('replica delivery', () => {
  it('parks ops that arrive before their dependencies and applies them once they can', () => {
    const a = new Replica('a', { now: fixed(10) })
    const ops = a.insertText('note', 0, 'abc')
    const b = new Replica('b', { now: fixed(10) })
    expect(b.receive([ops[2], ops[1]].filter((o) => o !== undefined)).pending).toBe(2)
    expect(b.text('note')).toBe('')
    expect(b.receive([ops[0]].filter((o) => o !== undefined)).pending).toBe(0)
    expect(b.text('note')).toBe('abc')
  })

  it('ignores ops it already has', () => {
    const a = new Replica('a', { now: fixed(10) })
    const ops = a.insertText('note', 0, 'hi')
    const b = new Replica('b', { now: fixed(10) })
    b.receive(ops)
    expect(b.receive([...ops, ...ops]).applied).toEqual([])
    expect(b.text('note')).toBe('hi')
  })

  it('sends a peer only what its version vector lacks', () => {
    const a = new Replica('a', { now: fixed(10) })
    a.insertText('note', 0, 'abcd')
    expect(a.missingFrom({ a: 3 }).map((o) => o.seq)).toEqual([4])
  })
})

describe('protocol', () => {
  it('reconciles two replicas that edited while disconnected', () => {
    const a = new Replica('a', { now: fixed(10) })
    const b = new Replica('b', { now: fixed(20) })
    a.insertText('note', 0, 'offline on a. ')
    b.set('issue', 'title', 'written on b')
    b.insertText('note', 0, 'and on b.')

    const toA: Message[] = []
    const toB: Message[] = []
    const pa = peer(a, (m) => toB.push(m))
    const pb = peer(b, (m) => toA.push(m))
    pa.open()
    pb.open()
    while (toA.length || toB.length) {
      for (const m of toA.splice(0)) pa.receive(m)
      for (const m of toB.splice(0)) pb.receive(m)
    }
    expect(a.digest()).toBe(b.digest())
    expect(a.records.get('issue')).toEqual({ title: 'written on b' })
    expect(a.text('note')).toBe(b.text('note'))

    b.insertText('note', 0, '>')
    for (const m of toA.splice(0)) pa.receive(m)
    expect(a.text('note').startsWith('>')).toBe(true)
  })
})

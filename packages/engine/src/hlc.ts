// Hybrid logical clock (Kulkarni et al., 2014). Physical time when the
// machines agree, a logical counter when they don't, and a node id to break
// the last tie. The property everything else relies on: if A happened
// before B, then ts(A) < ts(B) — even when wall clocks disagree.

export interface Timestamp {
  readonly wall: number
  readonly count: number
  readonly node: string
}

export class ClockDriftError extends Error {
  constructor(readonly driftMs: number) {
    super(`remote clock is ${driftMs}ms ahead of ours`)
  }
}

export function compare(a: Timestamp, b: Timestamp) {
  if (a.wall !== b.wall) return a.wall - b.wall
  if (a.count !== b.count) return a.count - b.count
  return a.node < b.node ? -1 : a.node > b.node ? 1 : 0
}

// Fixed-width base 36 so that string order equals timestamp order; ids made
// from it can be compared, sorted and used as map keys without parsing.
export function encode(t: Timestamp) {
  return `${t.wall.toString(36).padStart(9, '0')}.${t.count.toString(36).padStart(4, '0')}.${t.node}`
}

export function decode(s: string): Timestamp {
  const [wall, count, ...node] = s.split('.')
  return {
    wall: Number.parseInt(wall ?? '0', 36),
    count: Number.parseInt(count ?? '0', 36),
    node: node.join('.'),
  }
}

export class Clock {
  #last: Timestamp

  constructor(
    readonly node: string,
    private readonly physical: () => number = Date.now,
    // A peer whose clock runs far ahead would drag every timestamp forward
    // with it, and its writes would win every conflict for that long.
    private readonly maxDriftMs = 60_000,
  ) {
    this.#last = { wall: 0, count: 0, node }
  }

  now(): Timestamp {
    const pt = this.physical()
    const wall = Math.max(this.#last.wall, pt)
    const count = wall === this.#last.wall ? this.#last.count + 1 : 0
    this.#last = { wall, count, node: this.node }
    return this.#last
  }

  observe(remote: Timestamp) {
    const pt = this.physical()
    if (remote.wall - pt > this.maxDriftMs) throw new ClockDriftError(remote.wall - pt)
    const last = this.#last
    const wall = Math.max(last.wall, remote.wall, pt)
    let count = 0
    if (wall === last.wall && wall === remote.wall) count = Math.max(last.count, remote.count) + 1
    else if (wall === last.wall) count = last.count + 1
    else if (wall === remote.wall) count = remote.count + 1
    this.#last = { wall, count, node: this.node }
  }

  get last() {
    return this.#last
  }
}

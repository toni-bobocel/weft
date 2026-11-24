import { encode } from './hlc.js'
import type { DeleteOp, InsertOp } from './ops.js'

// Replicated Growable Array (Roh et al., 2011). Every character keeps the id
// of the character it was typed after. Concurrent inserts after the same
// character are ordered by id, newest first; because hybrid logical clocks
// respect causality, everything typed after a newer sibling is newer still,
// so "skip while the id is greater than mine" also skips its whole subtree.
// Deletes leave tombstones, so a late insert can always find its anchor.

interface Atom {
  id: string
  ch: string
  deleted: boolean
}

export type Outcome = 'applied' | 'duplicate' | 'missing'

export class Sequence {
  readonly #atoms: Atom[] = []
  readonly #index = new Map<string, Atom>()

  insert(op: InsertOp): Outcome {
    const id = encode(op.ts)
    if (this.#index.has(id)) return 'duplicate'
    let at = 0
    if (op.after !== null) {
      const anchor = this.#index.get(op.after)
      if (!anchor) return 'missing'
      at = this.#atoms.indexOf(anchor) + 1
    }
    while (at < this.#atoms.length && (this.#atoms[at] as Atom).id > id) at++
    const atom = { id, ch: op.ch, deleted: false }
    this.#atoms.splice(at, 0, atom)
    this.#index.set(id, atom)
    return 'applied'
  }

  delete(op: DeleteOp): Outcome {
    const atom = this.#index.get(op.target)
    if (!atom) return 'missing'
    if (atom.deleted) return 'duplicate'
    atom.deleted = true
    return 'applied'
  }

  /** Id of the visible character at `index`, or null before the first one. */
  idBefore(index: number): string | null {
    if (index <= 0) return null
    let seen = 0
    for (const a of this.#atoms) {
      if (a.deleted) continue
      seen++
      if (seen === index) return a.id
    }
    throw new RangeError(`index ${index} past the end`)
  }

  visibleIds(from: number, count: number) {
    return this.#atoms
      .filter((a) => !a.deleted)
      .slice(from, from + count)
      .map((a) => a.id)
  }

  /** Visible index of an id, for keeping a caret in place across remote edits. */
  indexOf(id: string) {
    let i = 0
    for (const a of this.#atoms) {
      if (a.id === id) return a.deleted ? -1 : i
      if (!a.deleted) i++
    }
    return -1
  }

  toString() {
    let out = ''
    for (const a of this.#atoms) if (!a.deleted) out += a.ch
    return out
  }

  get size() {
    return this.#atoms.length
  }

  canonical() {
    return this.#atoms.map((a) => [a.id, a.ch, a.deleted])
  }
}

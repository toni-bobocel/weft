import { compare, type Timestamp } from './hlc.js'
import type { Json, SetOp } from './ops.js'

interface Cell {
  value: Json
  ts: Timestamp
}

/** What a concurrent write lost to, so the UI can say so instead of guessing. */
export interface Superseded {
  entity: string
  field: string
  kept: Cell
  dropped: Cell
}

export class Records {
  readonly #entities = new Map<string, Map<string, Cell>>()

  apply(op: SetOp): Superseded | undefined {
    let fields = this.#entities.get(op.entity)
    if (!fields) {
      fields = new Map()
      this.#entities.set(op.entity, fields)
    }
    const current = fields.get(op.field)
    const incoming = { value: op.value, ts: op.ts }
    if (!current) {
      fields.set(op.field, incoming)
      return undefined
    }
    if (compare(op.ts, current.ts) > 0) {
      fields.set(op.field, incoming)
      return current.ts.node === op.ts.node
        ? undefined
        : { entity: op.entity, field: op.field, kept: incoming, dropped: current }
    }
    return { entity: op.entity, field: op.field, kept: current, dropped: incoming }
  }

  get(entity: string): Record<string, Json> | undefined {
    const fields = this.#entities.get(entity)
    if (!fields) return undefined
    return Object.fromEntries([...fields].map(([k, c]) => [k, c.value]))
  }

  entities() {
    return [...this.#entities.keys()].sort()
  }

  /** Field timestamps included: two replicas agreeing on values but not on why are not converged. */
  canonical() {
    return this.entities().map((id) => {
      const fields = this.#entities.get(id) as Map<string, Cell>
      return [id, [...fields].sort(([a], [b]) => (a < b ? -1 : 1))]
    })
  }
}

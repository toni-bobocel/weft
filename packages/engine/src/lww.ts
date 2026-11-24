import { compare, type Timestamp } from './hlc.js'
import type { Json, SetOp } from './ops.js'

interface Cell {
  value: Json
  ts: Timestamp
}

/**
 * A write from another node met an existing value. `replaced`: the incoming
 * write was newer and took over. `ignored`: it arrived older than what is
 * already here, which only happens when two writes were concurrent.
 */
export interface Superseded {
  entity: string
  field: string
  outcome: 'replaced' | 'ignored'
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
        : {
            entity: op.entity,
            field: op.field,
            outcome: 'replaced',
            kept: incoming,
            dropped: current,
          }
    }
    return {
      entity: op.entity,
      field: op.field,
      outcome: 'ignored',
      kept: current,
      dropped: incoming,
    }
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

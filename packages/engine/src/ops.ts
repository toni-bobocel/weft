import type { Timestamp } from './hlc.js'

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

interface Base {
  /** The replica that created the op. */
  site: string
  /** 1-based, gapless per site: what makes version vectors work. */
  seq: number
  ts: Timestamp
}

/** Last-writer-wins on one field of one entity. */
export interface SetOp extends Base {
  kind: 'set'
  entity: string
  field: string
  value: Json
}

/** One character, placed right after `after` (null: at the start). */
export interface InsertOp extends Base {
  kind: 'ins'
  doc: string
  after: string | null
  ch: string
}

/** Tombstones the character whose id is `target`. */
export interface DeleteOp extends Base {
  kind: 'del'
  doc: string
  target: string
}

export type Op = SetOp | InsertOp | DeleteOp

/** For every site, the highest seq this replica has applied. */
export type VersionVector = Record<string, number>

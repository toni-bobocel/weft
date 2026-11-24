import { DatabaseSync } from 'node:sqlite'
import type { Op } from '@weft/engine'

// The relay keeps the op log, not a snapshot: state is a pure function of
// the log, and a log can always answer "what does this peer lack".

export class OpStore {
  readonly #db: DatabaseSync
  readonly #insert

  constructor(path: string) {
    this.#db = new DatabaseSync(path)
    this.#db.exec(`
      pragma journal_mode = wal;
      create table if not exists ops (
        site text not null,
        seq integer not null,
        body text not null,
        primary key (site, seq)
      ) strict, without rowid;
    `)
    this.#insert = this.#db.prepare('insert or ignore into ops (site, seq, body) values (?, ?, ?)')
  }

  load(): Op[] {
    return this.#db
      .prepare('select body from ops order by site, seq')
      .all()
      .map((row) => JSON.parse((row as { body: string }).body) as Op)
  }

  append(ops: readonly Op[]) {
    if (!ops.length) return
    this.#db.exec('begin')
    try {
      for (const op of ops) this.#insert.run(op.site, op.seq, JSON.stringify(op))
      this.#db.exec('commit')
    } catch (err) {
      this.#db.exec('rollback')
      throw err
    }
  }

  close() {
    this.#db.close()
  }
}

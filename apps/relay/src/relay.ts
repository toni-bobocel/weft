import { ClockDriftError, type Message, Replica } from '@weft/engine'
import type { OpStore } from './store.js'

export interface Connection {
  send(msg: Message): void
  close(code: number, reason: string): void
}

/**
 * A replica that never edits. It answers every hello with what the peer
 * lacks plus its own version vector (so the peer can send what the relay
 * lacks), persists what it learns, and forwards it to everyone else.
 */
export function createRelay(store: OpStore) {
  const replica = new Replica('relay')
  replica.receive(store.load())
  const peers = new Set<Connection>()

  return {
    replica,
    get peers() {
      return peers.size
    },

    join(conn: Connection) {
      peers.add(conn)
      conn.send({ t: 'hello', site: replica.site, vv: { ...replica.versionVector } })
      return {
        receive(msg: Message) {
          if (msg.t === 'hello') {
            const missing = replica.missingFrom(msg.vv)
            if (missing.length) conn.send({ t: 'ops', ops: missing })
            return
          }
          let applied: Message & { t: 'ops' }
          try {
            applied = { t: 'ops', ops: replica.receive(msg.ops).applied }
          } catch (err) {
            // A peer from the future would push every timestamp forward.
            if (err instanceof ClockDriftError) return conn.close(4400, err.message)
            throw err
          }
          if (!applied.ops.length) return
          store.append(applied.ops)
          for (const other of peers) if (other !== conn) other.send(applied)
        },
        leave() {
          peers.delete(conn)
        },
      }
    },
  }
}

import type { Op, VersionVector } from './ops.js'
import type { Received, Replica } from './replica.js'

// The whole wire protocol. On connect both sides say what they have; each
// answers with what the other lacks. After that, ops are pushed as they
// happen. Nothing here assumes ordering, single delivery, or a server:
// the replica copes with all three, so any transport will do.

export type Message = { t: 'hello'; site: string; vv: VersionVector } | { t: 'ops'; ops: Op[] }

export interface Peer {
  /** Feed every message received from the other side. */
  receive(msg: Message): Received | undefined
  /** Call once the transport is open. */
  open(): void
  close(): void
}

export function peer(replica: Replica, send: (msg: Message) => void): Peer {
  let open = false
  const unsubscribe = replica.subscribe((ops, origin) => {
    if (open && origin === 'local') send({ t: 'ops', ops })
  })

  return {
    open() {
      open = true
      send({ t: 'hello', site: replica.site, vv: { ...replica.versionVector } })
    },
    receive(msg) {
      if (msg.t === 'hello') {
        const ops = replica.missingFrom(msg.vv)
        if (ops.length) send({ t: 'ops', ops })
        return undefined
      }
      return replica.receive(msg.ops)
    },
    close() {
      open = false
      unsubscribe()
    },
  }
}

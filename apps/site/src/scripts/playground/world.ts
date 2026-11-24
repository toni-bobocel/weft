import { type Message, type Peer, peer, Replica, type Superseded } from '@weft/engine'
// The demo runs the relay's own code over an in-memory log, not a mock.
import { createRelay } from '../../../../relay/src/relay'

export interface Device {
  name: string
  replica: Replica
  online: boolean
  skewMs: number
  rejected: string | null
  sent: number
  received: number
}

export interface Packet {
  from: string
  to: string
  msg: Message
  latencyMs: number
}

interface Link {
  peer: Peer
  session: ReturnType<ReturnType<typeof createRelay>['join']>
  generation: number
}

export interface Hooks {
  /** Animate the packet, then call `deliver` when it lands. */
  ship(packet: Packet, deliver: () => void): void
  superseded(device: string, event: Superseded): void
  note(text: string): void
}

const SEED: [string, string, string][] = [
  ['ship-offline', 'title', 'Ship offline mode'],
  ['ship-offline', 'status', 'doing'],
  ['safari-login', 'title', 'Fix login on Safari'],
  ['safari-login', 'status', 'todo'],
  ['release-notes', 'title', 'Write the release notes'],
  ['release-notes', 'status', 'todo'],
]

export const TASKS = ['ship-offline', 'safari-login', 'release-notes']

export class World {
  readonly relay = createRelay({ load: () => [], append: () => {} })
  readonly devices: Device[]
  latencyMs = 520
  duplicate = false
  readonly #links = new Map<string, Link>()
  #generation = 0

  constructor(
    names: string[],
    readonly hooks: Hooks,
  ) {
    const seed = new Replica('seed', { now: () => Date.now() - 60_000 })
    for (const [entity, field, value] of SEED) seed.set(entity, field, value)
    seed.insertText('note', 0, 'Launch checklist: ')
    const history = seed.missingFrom({})
    this.relay.replica.receive(history)

    this.devices = names.map((name) => {
      const device = {
        name,
        online: false,
        skewMs: 0,
        rejected: null,
        sent: 0,
        received: 0,
      } as Device
      // Each device reads its own, possibly wrong, wall clock.
      device.replica = new Replica(name, { now: () => Date.now() + device.skewMs })
      device.replica.receive(history)
      return device
    })
  }

  device(name: string) {
    return this.devices.find((d) => d.name === name) as Device
  }

  setOnline(device: Device, online: boolean) {
    if (device.online === online) return
    device.online = online
    if (online) this.#connect(device)
    else this.#disconnect(device)
  }

  converged() {
    const digests = new Set([
      ...this.devices.map((d) => d.replica.digest()),
      this.relay.replica.digest(),
    ])
    return digests.size === 1
  }

  #connect(device: Device) {
    device.rejected = null
    const generation = ++this.#generation
    const alive = () => this.#links.get(device.name)?.generation === generation

    const session = this.relay.join({
      send: (msg) =>
        this.#ship(
          { from: 'relay', to: device.name, msg, latencyMs: this.latencyMs },
          alive,
          () => {
            const result = link.peer.receive(msg)
            if (msg.t === 'ops') device.received += result?.applied.length ?? 0
            for (const s of result?.superseded ?? []) this.hooks.superseded(device.name, s)
          },
        ),
      close: (code, reason) => {
        device.rejected = `${code} · ${reason}`
        this.hooks.note(`relay closed ${device.name}: ${reason}`)
        this.setOnline(device, false)
      },
    })
    const link: Link = {
      generation,
      session,
      peer: peer(device.replica, (msg) => {
        if (msg.t === 'ops') device.sent += msg.ops.length
        this.#ship({ from: device.name, to: 'relay', msg, latencyMs: this.latencyMs }, alive, () =>
          session.receive(msg),
        )
      }),
    }
    this.#links.set(device.name, link)
    link.peer.open()
  }

  #disconnect(device: Device) {
    const link = this.#links.get(device.name)
    if (!link) return
    link.peer.close()
    link.session.leave()
    this.#links.delete(device.name)
  }

  // Packets already in the air when a device drops are lost with the link,
  // exactly like a socket closing mid-flight.
  #ship(packet: Packet, alive: () => boolean, deliver: () => void) {
    const land = () => {
      if (alive()) deliver()
    }
    this.hooks.ship(packet, land)
    if (this.duplicate && packet.msg.t === 'ops')
      this.hooks.ship({ ...packet, latencyMs: packet.latencyMs * 1.6 }, land)
  }
}

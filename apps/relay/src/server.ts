import type { Message } from '@weft/engine'
import { WebSocketServer } from 'ws'
import { createRelay } from './relay.js'
import { OpStore } from './store.js'

export function listen(port: number, dbPath: string) {
  const store = new OpStore(dbPath)
  const relay = createRelay(store)
  // A full resync of a busy document is a few MB; anything bigger is abuse.
  const wss = new WebSocketServer({ port, maxPayload: 8 * 1024 * 1024 })

  wss.on('connection', (socket) => {
    const session = relay.join({
      send: (msg) => socket.send(JSON.stringify(msg)),
      close: (code, reason) => socket.close(code, reason),
    })
    socket.on('message', (data) => {
      let msg: Message
      try {
        msg = JSON.parse(String(data))
      } catch {
        return socket.close(4400, 'not json')
      }
      if (msg?.t !== 'hello' && msg?.t !== 'ops') return socket.close(4400, 'unknown message')
      session.receive(msg)
    })
    socket.on('close', () => session.leave())
  })

  return {
    wss,
    relay,
    async close() {
      for (const client of wss.clients) client.terminate()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
      store.close()
    },
  }
}

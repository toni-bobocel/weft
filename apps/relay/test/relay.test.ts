import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Message, peer, Replica } from '@weft/engine'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { listen } from '../src/server.js'

const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})

function start(dir = mkdtempSync(join(tmpdir(), 'weft-'))) {
  const server = listen(0, join(dir, 'ops.db'))
  const port = (server.wss.address() as { port: number }).port
  return { server, port, dir }
}

/** A real client: a replica speaking the engine's protocol over a real socket. */
function connect(port: number, replica: Replica) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`)
  const p = peer(replica, (msg) => ws.send(JSON.stringify(msg)))
  ws.on('open', () => p.open())
  ws.on('message', (data) => p.receive(JSON.parse(String(data)) as Message))
  const opened = new Promise((resolve) => ws.once('open', resolve))
  cleanup.push(() => {
    p.close()
    ws.terminate()
  })
  return { ws, opened }
}

async function until(check: () => boolean, ms = 3000) {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for convergence')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('relay', () => {
  it('reconciles two clients that edited before connecting, then keeps them live', async () => {
    const { server, port, dir } = start()
    cleanup.push(
      () => rmSync(dir, { recursive: true, force: true }),
      () => server.close(),
    )

    const laptop = new Replica('laptop')
    const phone = new Replica('phone')
    laptop.insertText('note', 0, 'written on a train. ')
    phone.set('task', 'status', 'done')
    phone.insertText('note', 0, 'and on a plane.')

    await Promise.all([connect(port, laptop).opened, connect(port, phone).opened])
    await until(() => laptop.digest() === phone.digest() && laptop.opCount === 36)
    expect(laptop.records.get('task')).toEqual({ status: 'done' })

    laptop.insertText('note', 0, '> ')
    await until(() => phone.text('note').startsWith('> '))
    expect(phone.digest()).toBe(laptop.digest())
  })

  it('serves history to a client that joins after a restart', async () => {
    const first = start()
    const writer = new Replica('writer')
    await connect(first.port, writer).opened
    writer.insertText('note', 0, 'persisted')
    await until(() => first.server.relay.replica.opCount === 9)
    await first.server.close()

    const second = start(first.dir)
    cleanup.push(
      () => rmSync(first.dir, { recursive: true, force: true }),
      () => second.server.close(),
    )
    const late = new Replica('late')
    await connect(second.port, late).opened
    await until(() => late.text('note') === 'persisted')
  })

  it('drops a peer whose clock is an hour ahead', async () => {
    const { server, port, dir } = start()
    cleanup.push(
      () => rmSync(dir, { recursive: true, force: true }),
      () => server.close(),
    )
    const future = new Replica('future', { now: () => Date.now() + 3_600_000 })
    future.set('task', 'title', 'from the future')
    const { ws } = connect(port, future)
    const code = await new Promise<number>((resolve) => ws.once('close', (c) => resolve(c)))
    expect(code).toBe(4400)
    expect(server.relay.replica.opCount).toBe(0)
  })
})

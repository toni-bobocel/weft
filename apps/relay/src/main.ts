import { listen } from './server.js'

const port = Number(process.env.PORT ?? 8790)
const server = listen(port, process.env.WEFT_DB ?? 'weft.db')
process.stdout.write(`weft relay on :${port}\n`)

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => server.close().then(() => process.exit(0)))
}

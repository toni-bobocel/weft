import { gsap } from 'gsap'
import { TextPlugin } from 'gsap/TextPlugin'
import type { World } from '../app'
import { reveal, tilt } from '../glow'

gsap.registerPlugin(TextPlugin)

const SHAPES = {
  tasks: `replica.set('task-42', 'status', 'done')`,
  notes: `replica.insertText('note', caret, 'hello')`,
  forms: `replica.set('form', 'email', input.value)`,
} as const

const TRANSPORTS = {
  websocket: `const ws = new WebSocket('wss://relay.example')
const link = peer(replica, (m) => ws.send(JSON.stringify(m)))
ws.onopen = () => link.open()
ws.onmessage = (e) => link.receive(JSON.parse(e.data))`,
  broadcast: `const tabs = new BroadcastChannel('weft')
const link = peer(replica, (m) => tabs.postMessage(m))
tabs.onmessage = (e) => link.receive(e.data)
link.open()`,
  memory: `const a = peer(left, (m) => b.receive(m))
const b = peer(right, (m) => a.receive(m))
a.open(); b.open()`,
} as const

type Shape = keyof typeof SHAPES
type Transport = keyof typeof TRANSPORTS

/** The choices write the snippet: the same two calls work over any transport. */
export function usePage({ nebula }: World) {
  const root = document.querySelector('.use') as HTMLElement
  const snippet = root.querySelector('[data-snippet]') as HTMLElement
  const copy = root.querySelector('[data-copy]') as HTMLButtonElement
  const choice = { shape: 'tasks' as Shape, transport: 'websocket' as Transport }

  nebula.to({ dim: 0.1, zoom: 5.2, yaw: 0.9 })
  reveal(root, 0.15)
  const untilt = tilt(root)
  gsap.from(root.querySelectorAll('.choices > div, .contact > *'), {
    autoAlpha: 0,
    y: 20,
    duration: 0.9,
    stagger: 0.08,
    delay: 0.9,
    ease: 'expo.out',
  })

  const code = () =>
    `import { peer, Replica } from '@weft/engine'\n\nconst replica = new Replica(deviceId)\n${TRANSPORTS[choice.transport]}\n\n${SHAPES[choice.shape]}`
  const write = (animate: boolean) => {
    const text = code()
    if (!animate) {
      snippet.textContent = text
      return
    }
    // Scrambling would flatten the line breaks; the code wipes in instead.
    gsap
      .timeline()
      .to(snippet, { clipPath: 'inset(0 100% 0 0)', duration: 0.25, ease: 'power2.in' })
      .add(() => {
        snippet.textContent = text
      })
      .to(snippet, { clipPath: 'inset(0 0% 0 0)', duration: 0.5, ease: 'expo.out' })
  }
  write(false)

  for (const group of root.querySelectorAll<HTMLElement>('[data-group]')) {
    group.addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip')
      if (!chip) return
      for (const c of group.querySelectorAll('.chip'))
        c.setAttribute('aria-pressed', String(c === chip))
      if (group.dataset.group === 'shape') choice.shape = chip.dataset.value as Shape
      else choice.transport = chip.dataset.value as Transport
      write(true)
    })
  }

  copy.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(code())
    const label = copy.querySelector('span') as HTMLElement
    const before = label.innerHTML
    gsap.to(label, { duration: 0.4, text: 'Copied' })
    gsap.delayedCall(1.6, () => {
      label.innerHTML = before
    })
  })

  return untilt
}

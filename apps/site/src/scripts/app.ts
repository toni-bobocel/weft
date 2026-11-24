import { gsap } from 'gsap'
import { boot } from './boot'
import { Stage } from './gl/stage'
import { demoPage } from './pages/demo'
import { enginePage } from './pages/engine'
import { homePage } from './pages/home'
import { usePage } from './pages/use'
import { Ambient } from './sound'

// Runs once. The router swaps pages underneath while the canvas, the music
// and the boot screen persist; each page mounts its own context.

export interface World {
  stage: Stage
  sound: Ambient
}

type Mount = (world: World) => (() => void) | undefined

const pages: Record<string, Mount> = {
  main: homePage,
  demo: demoPage,
  engine: enginePage,
  use: usePage,
}

const stage = new Stage(document.querySelector('[data-stage]') as HTMLCanvasElement)
const sound = new Ambient()
const world: World = { stage, sound }

// The music leans on the cloud: louder moments glow a touch brighter.
gsap.ticker.add(() => {
  stage.state.level += (sound.level() - stage.state.level) * 0.08
})

addEventListener('pointerdown', () => sound.drop(0.8))
document.addEventListener('pointerover', (e) => {
  if ((e.target as HTMLElement).closest('a, .act, .status, .toggle')) sound.tick()
})

// The sound switch: its little wave goes flat when muted and swells with the music.
const toggle = document.querySelector('[data-sound]') as HTMLButtonElement
const wave = toggle.querySelector('[data-wave]') as SVGPathElement
const amp = { a: 0 }
gsap.ticker.add(() => {
  const t = performance.now() / 600
  const a = amp.a * (0.6 + stage.state.level * 0.8)
  let d = 'M0 6'
  for (let x = 1; x <= 26; x++) d += ` L${x} ${6 + Math.sin(x / 2.2 + t) * a}`
  wave.setAttribute('d', d)
})
const setSound = (on: boolean) => {
  toggle.setAttribute('aria-pressed', String(on))
  gsap.to(amp, { a: on ? 3.2 : 0, duration: 1.2, ease: 'sine.inOut' })
  sessionStorage.setItem('weft:sound', on ? 'on' : 'off')
}
toggle.addEventListener('click', () => setSound(sound.toggle()))

let unmount: (() => void) | undefined
let ctx: gsap.Context | undefined
let entered = sessionStorage.getItem('weft:booted') === '1'
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

function mount() {
  ctx = gsap.context(() => {
    unmount = pages[document.body.dataset.page ?? 'main']?.(world)
  })
}

// Coming back mid-session: audio needs a fresh gesture, so the first click resumes it.
if (entered && sessionStorage.getItem('weft:sound') !== 'off') {
  addEventListener(
    'pointerdown',
    () => {
      sound.start()
      setSound(true)
    },
    { once: true },
  )
}

document.addEventListener('astro:page-load', () => {
  if (entered || reduced) {
    document.querySelector('[data-boot]')?.remove()
    mount()
    return
  }
  boot(document.querySelector('[data-boot]') as HTMLElement, () => {
    entered = true
    sound.start()
    setSound(true)
    stage.ignite()
    mount()
  })
})

document.addEventListener('astro:before-swap', () => {
  unmount?.()
  ctx?.revert()
  stage.clearLines()
  unmount = undefined
})

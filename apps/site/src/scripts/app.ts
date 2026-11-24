import { gsap } from 'gsap'
import { boot } from './boot'
import { Nebula } from './nebula'
import { demoPage } from './pages/demo'
import { enginePage } from './pages/engine'
import { homePage } from './pages/home'
import { usePage } from './pages/use'

// Runs once: the router swaps pages underneath while the canvas, cursor
// and boot screen persist. Each page mounts its own context and the
// previous one is reverted before the swap.

type Mount = (world: World) => (() => void) | undefined

export interface World {
  nebula: Nebula
  online: () => boolean
}

const pages: Record<string, Mount> = {
  main: homePage,
  demo: demoPage,
  engine: enginePage,
  use: usePage,
}

const nebula = new Nebula(document.querySelector('[data-nebula]') as HTMLCanvasElement)

const cursor = document.querySelector('[data-cursor]') as HTMLElement
const cx = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' })
const cy = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' })
addEventListener('pointermove', (e) => {
  cx(e.clientX)
  cy(e.clientY)
})
addEventListener('pointerdown', () => gsap.to(cursor, { scale: 0.7, duration: 0.2 }))
addEventListener('pointerup', () =>
  gsap.to(cursor, { scale: 1, duration: 0.4, ease: 'back.out(3)' }),
)

// The frame's network switch: the demo listens to it, the cloud shows it.
const link = document.querySelector('[data-link]') as HTMLButtonElement
let online = true
link.addEventListener('click', () => {
  online = !online
  link.setAttribute('aria-pressed', String(online))
  link.classList.toggle('is-off', !online)
  if (online) nebula.merge()
  else nebula.split()
  dispatchEvent(new CustomEvent('weft:network', { detail: online }))
})

const world: World = { nebula, online: () => online }
let unmount: (() => void) | undefined
let ctx: gsap.Context | undefined
let entered = sessionStorage.getItem('weft:booted') === '1'
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

function mount() {
  ctx = gsap.context(() => {
    unmount = pages[document.body.dataset.page ?? 'main']?.(world)
  })
}

document.addEventListener('astro:page-load', () => {
  if (entered || reduced) {
    document.querySelector('[data-boot]')?.remove()
    mount()
    return
  }
  boot(document.querySelector('[data-boot]') as HTMLElement, () => {
    entered = true
    nebula.ignite()
    mount()
  })
})

document.addEventListener('astro:before-swap', () => {
  unmount?.()
  ctx?.revert()
  unmount = undefined
})

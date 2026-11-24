import { Clock, encode } from '@weft/engine'
import { gsap } from 'gsap'
import { TextPlugin } from 'gsap/TextPlugin'

gsap.registerPlugin(TextPlugin)

const LINES = [
  'toni@weft:~$ ./sync --boot',
  '[ OK ] HYBRID LOGICAL CLOCK',
  '[ OK ] LAST-WRITER-WINS RECORDS',
  '[ OK ] RGA SEQUENCE',
  '[ OK ] VERSION VECTORS',
]

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/**
 * The entrance. The clock in the corner is a real hybrid logical clock from
 * the engine; its encoded timestamp is what every op on this page carries.
 */
export function boot(root: HTMLElement, onEnter: () => void) {
  const clock = new Clock('this-tab')
  const date = root.querySelector('[data-date]') as HTMLElement
  const ms = root.querySelector('[data-ms]') as HTMLElement
  const hlc = root.querySelector('[data-hlc]') as HTMLElement
  const log = root.querySelector('[data-log]') as HTMLElement
  const enter = root.querySelector('[data-enter]') as HTMLButtonElement

  const tick = () => {
    const d = new Date()
    date.textContent = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
    ms.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
    hlc.textContent = `HLC ${encode(clock.now()).slice(0, 18)}`
  }
  gsap.ticker.add(tick)

  root.hidden = false
  const tl = gsap.timeline()
  let text = ''
  for (const line of LINES) {
    const start = text
    text += `${line}\n`
    tl.to(log, {
      duration: line.length * 0.018,
      text: { value: start + line, delimiter: '' },
      ease: 'none',
    }).set(log, { text: text }, '+=0.08')
  }
  const bar = { p: 0 }
  tl.to(bar, {
    p: 1,
    duration: 0.9,
    ease: 'steps(24)',
    onUpdate: () => {
      const filled = Math.round(bar.p * 24)
      log.textContent = `${text}[${'▓'.repeat(filled)}${' '.repeat(24 - filled)}] ${Math.round(bar.p * 100)}%`
    },
  }).add(() => {
    log.textContent += '\n[ OK ] READY — PRESS ENTER'
    enter.focus({ preventScroll: true })
  })

  const go = () => {
    tl.progress(1)
    gsap.ticker.remove(tick)
    removeEventListener('keydown', onKey)
    sessionStorage.setItem('weft:booted', '1')
    gsap
      .timeline({ onComplete: () => root.remove() })
      .to(root.querySelector('.boot__center'), {
        scale: 1.08,
        autoAlpha: 0,
        duration: 0.45,
        ease: 'power2.in',
      })
      .to(root, { autoAlpha: 0, duration: 0.6 }, 0.25)
    onEnter()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') go()
  }
  enter.addEventListener('click', go, { once: true })
  addEventListener('keydown', onKey)
}

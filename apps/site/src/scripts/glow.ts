import { gsap } from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import type { Line } from './gl/lines'
import type { Stage } from './gl/stage'

gsap.registerPlugin(ScrambleTextPlugin)

export const BLOCKS = '░▒▓/\\·:'

/** Paint every headline line under `root` into the WebGL layer. */
export function linesOf(stage: Stage, root: ParentNode) {
  return [...root.querySelectorAll<HTMLElement>('.glow .ln')].map((el) => stage.line(el))
}

/**
 * Lines surface the way things do through water: out of focus and drawn
 * thin, then settling. The letters pass through a little noise on the way.
 */
export function reveal(lines: Line[], delay = 0) {
  const tl = gsap.timeline({ delay })
  lines.forEach((line, i) => {
    const text = line.el.dataset.text ?? ''
    gsap.set(line.state, { opacity: 0, blur: 10, stretch: 0.82, tiltX: 0.5 })
    tl.to(
      line.state,
      { opacity: 1, blur: 0, stretch: 1, tiltX: 0, duration: 2.6, ease: 'expo.out' },
      i * 0.28,
    ).to(
      line.el,
      { duration: 1.6, scrambleText: { text, chars: BLOCKS, speed: 0.35, revealDelay: 0.5 } },
      i * 0.28,
    )
  })
  return tl
}

/** Each line hangs at its own depth and leans, slowly, toward the hand. */
export function tilt(lines: Line[]) {
  const movers = lines.map((line, i) => ({
    rx: gsap.quickTo(line.state, 'tiltX', { duration: 2.2, ease: 'power3.out' }),
    ry: gsap.quickTo(line.state, 'tiltY', { duration: 2.2, ease: 'power3.out' }),
    depth: (i % 2 ? -1 : 1) * (0.7 + i * 0.25),
  }))
  const onMove = (e: PointerEvent) => {
    const x = e.clientX / innerWidth - 0.5
    const y = e.clientY / innerHeight - 0.5
    for (const m of movers) {
      m.ry(x * 0.32 * m.depth)
      m.rx(-y * 0.22 * m.depth)
    }
  }
  addEventListener('pointermove', onMove)
  return () => removeEventListener('pointermove', onMove)
}

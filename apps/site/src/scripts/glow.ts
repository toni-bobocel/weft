import { gsap } from 'gsap'
import { RoughEase } from 'gsap/EasePack'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'

gsap.registerPlugin(ScrambleTextPlugin, RoughEase)

export const BLOCKS = '░▒▓█▚▞▙▟▛▜/\\[]#'

const WIDE = "'wdth' 112"
const NARROW = "'wdth' 50"

/**
 * Glowing headline lines arrive as noise: block glyphs resolve into letters
 * while the face stretches from its narrowest cut to its widest, as if the
 * line were being pulled taut.
 */
export function reveal(root: ParentNode, delay = 0) {
  const lines = [...root.querySelectorAll<HTMLElement>('.glow .ln')]
  const tl = gsap.timeline({ delay })
  lines.forEach((ln, i) => {
    const text = ln.dataset.text ?? ''
    tl.fromTo(
      ln,
      { fontVariationSettings: NARROW, autoAlpha: 0, filter: 'blur(14px)' },
      {
        fontVariationSettings: WIDE,
        autoAlpha: 1,
        filter: 'blur(0px)',
        duration: 1.6,
        ease: 'expo.out',
      },
      i * 0.18,
    ).to(
      ln,
      { duration: 1.3, scrambleText: { text, chars: BLOCKS, speed: 0.55, revealDelay: 0.25 } },
      i * 0.18,
    )
  })
  return tl
}

/** The lines hang at different depths and lean toward the pointer. */
export function tilt(root: ParentNode) {
  const lines = [...root.querySelectorAll<HTMLElement>('.glow .ln')]
  const movers = lines.map((ln, i) => ({
    rx: gsap.quickTo(ln, 'rotationX', { duration: 1.2, ease: 'power3.out' }),
    ry: gsap.quickTo(ln, 'rotationY', { duration: 1.2, ease: 'power3.out' }),
    depth: (i % 2 ? -1 : 1) * (0.6 + i * 0.25),
  }))
  const onMove = (e: PointerEvent) => {
    const x = e.clientX / innerWidth - 0.5
    const y = e.clientY / innerHeight - 0.5
    for (const m of movers) {
      m.ry(x * 14 * m.depth)
      m.rx(-y * 10 * m.depth)
    }
  }
  addEventListener('pointermove', onMove)
  return () => removeEventListener('pointermove', onMove)
}

/** Brief corruption of a line, then back: used when state changes underneath it. */
export function glitch(el: HTMLElement) {
  const text = el.dataset.text ?? el.textContent ?? ''
  return gsap
    .timeline()
    .to(el, { duration: 0.35, scrambleText: { text, chars: BLOCKS, speed: 1, revealDelay: 0.15 } })
    .fromTo(
      el,
      { x: () => gsap.utils.random(-12, 12) },
      {
        x: 0,
        duration: 0.5,
        ease: 'rough({ strength: 2, points: 12, taper: "out", randomize: true })',
      },
      0,
    )
}

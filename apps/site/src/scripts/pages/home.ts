import { Replica } from '@weft/engine'
import { gsap } from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import type { World } from '../app'
import { BLOCKS, glitch, reveal, tilt } from '../glow'

gsap.registerPlugin(ScrambleTextPlugin)

const WORDS = ['offline', 'merge', 'thread', 'local', 'replica', 'clock', 'vector', 'weave']

/**
 * Holding the pointer partitions two real replicas: each writes on its own
 * side while the counter runs. Releasing syncs them through the protocol's
 * delta exchange and prints both digests, which match.
 */
export function homePage({ nebula }: World) {
  const root = document.querySelector('.home') as HTMLElement
  const hint = document.querySelector('.hint') as HTMLElement
  const lines = [...root.querySelectorAll<HTMLElement>('.glow .ln')]
  const captions = [...root.querySelectorAll<HTMLElement>('[data-caption]')]

  nebula.to({ dim: 0, zoom: 6.2, yaw: 0 })
  reveal(root, 0.2)
  const untilt = tilt(root)
  gsap.from(captions, { autoAlpha: 0, y: 10, duration: 1, stagger: 0.12, delay: 1 })
  for (const c of captions) {
    c.addEventListener('pointerenter', () => {
      const first = c.firstElementChild as HTMLElement | null
      if (first)
        gsap.to(first, {
          duration: 0.6,
          scrambleText: { text: first.dataset.text ?? '', chars: BLOCKS },
        })
    })
  }

  const left = new Replica('left')
  const right = new Replica('right')
  let held: gsap.core.Tween | undefined
  const say = (text: string) =>
    gsap.to(hint, { duration: 0.5, scrambleText: { text, chars: BLOCKS, speed: 0.9 } })

  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('a, button, input, textarea')) return
    nebula.split()
    gsap.to(lines, {
      x: (i) => (i % 2 ? 90 : -90),
      duration: 1.2,
      ease: 'expo.out',
      overwrite: 'auto',
    })
    let n = 0
    held = gsap.to(
      {},
      {
        duration: 0.12,
        repeat: -1,
        onRepeat: () => {
          const side = n % 2 ? right : left
          const word = `${WORDS[(n * 7) % WORDS.length]} `
          side.insertText('note', Math.floor(Math.random() * (side.text('note').length + 1)), word)
          if (n % 5 === 0) side.set('doc', 'title', `${side.site} ${n}`)
          n++
          hint.textContent = `Partitioned · ${left.opCount} ops left · ${right.opCount} ops right`
        },
      },
    )
  }

  const up = () => {
    if (!held) return
    held.kill()
    held = undefined
    nebula.merge()
    gsap.to(lines, { x: 0, duration: 1.1, ease: 'expo.inOut', overwrite: 'auto' })
    for (const ln of lines) glitch(ln)
    right.receive(left.missingFrom(right.versionVector))
    left.receive(right.missingFrom(left.versionVector))
    const same = left.digest() === right.digest()
    say(
      `Merged · ${left.digest().slice(0, 8)} = ${right.digest().slice(0, 8)} · ${same ? 'identical' : 'diverged'}`,
    )
  }

  addEventListener('pointerdown', down)
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)
  return () => {
    untilt()
    held?.kill()
    removeEventListener('pointerdown', down)
    removeEventListener('pointerup', up)
    removeEventListener('pointercancel', up)
  }
}

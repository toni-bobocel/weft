import { Replica } from '@weft/engine'
import { gsap } from 'gsap'
import type { World } from '../app'
import { linesOf, reveal, tilt } from '../glow'

const WORDS = ['tide', 'harbour', 'drift', 'shore', 'current', 'still', 'shallow', 'keel']

/**
 * Holding the mouse splits two real replicas: each keeps writing on its own
 * side while the cloud tears in two. Letting go syncs them and prints both
 * digests, which match.
 */
export function homePage({ stage }: World) {
  const root = document.querySelector('.home') as HTMLElement
  const hint = document.querySelector('.hint') as HTMLElement
  const original = hint.textContent ?? ''
  const lines = linesOf(stage, root)

  stage.to({ dim: 0, zoom: 6.2, yaw: 0 })
  reveal(lines, 0.3)
  const untilt = tilt(lines)
  gsap.from('[data-caption], .lede, .ident', {
    autoAlpha: 0,
    y: 12,
    duration: 2,
    stagger: 0.18,
    delay: 1.2,
    ease: 'sine.out',
  })

  const left = new Replica('left')
  const right = new Replica('right')
  let writing: gsap.core.Tween | undefined

  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('a, button')) return
    stage.split()
    lines.forEach((l, i) => {
      gsap.to(l.state, {
        dx: i % 2 ? 110 : -110,
        duration: 2.2,
        ease: 'expo.out',
        overwrite: 'auto',
      })
    })
    let n = 0
    writing = gsap.to(
      {},
      {
        duration: 0.14,
        repeat: -1,
        onRepeat: () => {
          const side = n % 2 ? right : left
          side.insertText(
            'note',
            Math.floor(Math.random() * (side.text('note').length + 1)),
            `${WORDS[(n * 5) % WORDS.length]} `,
          )
          n++
          hint.textContent = `Apart. ${left.opCount} edits on the left, ${right.opCount} on the right.`
        },
      },
    )
  }

  const up = () => {
    if (!writing) return
    writing.kill()
    writing = undefined
    stage.merge()
    for (const l of lines)
      gsap.to(l.state, { dx: 0, duration: 2, ease: 'expo.inOut', overwrite: 'auto' })
    right.receive(left.missingFrom(right.versionVector))
    left.receive(right.missingFrom(left.versionVector))
    const same = left.digest() === right.digest()
    hint.textContent = same
      ? `Merged. Both copies now read ${left.digest().slice(0, 8)}.`
      : 'They disagree. That would be a bug, please tell me.'
    gsap.delayedCall(6, () => {
      if (!writing) hint.textContent = original
    })
  }

  addEventListener('pointerdown', down)
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)
  return () => {
    untilt()
    writing?.kill()
    removeEventListener('pointerdown', down)
    removeEventListener('pointerup', up)
    removeEventListener('pointercancel', up)
  }
}

import { gsap } from 'gsap'
import { Observer } from 'gsap/Observer'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import type { World } from '../app'
import { SCENARIOS } from '../playground/scenarios'
import { stage as bench } from '../playground/view'

gsap.registerPlugin(Observer, ScrambleTextPlugin)

const PERSPECTIVE = 1400

/**
 * Scenarios on a drum, drawn in WebGL: each title sits on the curve of a
 * cylinder, leans away and goes soft as it turns out of view. Scroll or drag
 * turns it; the title facing you opens a live bench.
 */
export function demoPage({ stage, sound }: World) {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-drum] button')]
  const hit = document.querySelector('[data-hit]') as HTMLElement
  const whisper = document.querySelector('[data-whisper]') as HTMLElement
  const tag = whisper.querySelector('[data-tag]') as HTMLElement
  const blurb = whisper.querySelector('[data-blurb]') as HTMLElement
  const play = document.querySelector('[data-play]') as HTMLElement

  const count = buttons.length
  const step = 360 / count
  const scenarioAt = (i: number) => SCENARIOS[i % SCENARIOS.length]
  const lines = buttons.map((b) => {
    const line = stage.line(b)
    line.manual = { x: innerWidth / 2, y: innerHeight / 2 }
    return line
  })
  const size = Number.parseFloat(getComputedStyle(buttons[0] as Element).fontSize)
  const radius = (size * 1.18) / (2 * Math.sin((step / 2) * (Math.PI / 180)))
  const placed = lines.map(() => ({ y: 0, visible: false }))

  stage.to({ dim: 0.5, zoom: 7.4, yaw: 0.5 })

  const spin = { a: SCENARIOS.length * step }
  const place = () => {
    lines.forEach((line, i) => {
      let rel = i * step - spin.a
      rel = ((((rel + 180) % 360) + 360) % 360) - 180
      const rad = (rel * Math.PI) / 180
      const away = Math.abs(rel)
      const z = radius * (Math.cos(rad) - 1)
      const y = innerHeight / 2 + radius * Math.sin(rad) * (PERSPECTIVE / (PERSPECTIVE - z))
      line.manual = { x: innerWidth / 2, y }
      line.state.z = z
      line.state.tiltX = -rad
      line.state.opacity = away > 78 ? 0 : 1 - (away / 78) ** 2 * 0.75
      line.state.blur = Math.min(away * 0.16, 12)
      placed[i] = { y, visible: away < 70 }
    })
  }
  const facing = () => ((Math.round(spin.a / step) % count) + count) % count

  const announce = () => {
    const s = scenarioAt(facing())
    if (!s) return
    gsap.to(tag, { duration: 0.8, scrambleText: { text: s.tag, chars: 'lowerCase', speed: 0.5 } })
    blurb.textContent = s.blurb
    gsap.fromTo(blurb, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.2, ease: 'sine.out' })
  }
  const turnTo = (a: number) => {
    gsap.to(spin, {
      a,
      duration: 1.6,
      ease: 'expo.out',
      onUpdate: place,
      overwrite: true,
      onComplete: announce,
    })
  }

  place()
  // Read the facing title before the intro turn rewinds the drum.
  announce()
  gsap.from(spin, { a: spin.a - step * 4, duration: 2.6, ease: 'expo.out', onUpdate: place })
  gsap.set(whisper, { autoAlpha: 0 })

  const observer = Observer.create({
    target: window,
    type: 'wheel,touch',
    wheelSpeed: 0.06,
    tolerance: 4,
    onChangeY: (self) => {
      if (play.style.visibility === 'visible') return
      const by = self.deltaY * (self.event.type === 'wheel' ? 1 : 0.2)
      gsap.to(spin, {
        a: spin.a + by,
        duration: 0.9,
        ease: 'power3.out',
        onUpdate: place,
        overwrite: true,
      })
    },
    onStop: () => turnTo(Math.round(spin.a / step) * step),
    onStopDelay: 0.15,
  })

  const follow = (e: PointerEvent) => {
    gsap.to(whisper, {
      autoAlpha: 1,
      x: e.clientX + 24,
      y: e.clientY + 18,
      duration: 1.2,
      ease: 'power3.out',
    })
  }
  addEventListener('pointermove', follow)

  let unbench: (() => void) | undefined
  const open = (index: number) => {
    const scenario = scenarioAt(index)
    if (!scenario) return
    unbench?.()
    unbench = bench(play, scenario)
    stage.to({ dim: 0.88 })
    sound.drop(1.2)
    gsap.set(play, { visibility: 'visible' })
    gsap.fromTo(play, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.1, ease: 'sine.out' })
    gsap.from(play.querySelectorAll('.device, .relay, .play__head > *'), {
      y: 24,
      autoAlpha: 0,
      duration: 1.4,
      stagger: 0.1,
      delay: 0.2,
      ease: 'expo.out',
    })
    ;(play.querySelector('[data-replay]') as HTMLElement).onclick = () => open(index)
  }
  const close = () => {
    unbench?.()
    unbench = undefined
    stage.to({ dim: 0.5 })
    gsap.to(play, {
      autoAlpha: 0,
      duration: 0.8,
      ease: 'sine.in',
      onComplete: () => gsap.set(play, { visibility: 'hidden' }),
    })
  }

  hit.addEventListener('click', (e) => {
    let best = -1
    let gap = Number.POSITIVE_INFINITY
    placed.forEach((p, i) => {
      const d = Math.abs(p.y - e.clientY)
      if (p.visible && d < gap) {
        gap = d
        best = i
      }
    })
    if (best < 0) return
    if (best === facing()) open(best)
    else turnTo(spin.a + ((((best * step - spin.a + 180) % 360) + 360) % 360) - 180)
  })
  ;(play.querySelector('[data-close]') as HTMLElement).addEventListener('click', close)
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
    if (play.style.visibility === 'visible') return
    if (e.key === 'ArrowDown') turnTo(Math.round(spin.a / step + 1) * step)
    if (e.key === 'ArrowUp') turnTo(Math.round(spin.a / step - 1) * step)
    if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button, a')) open(facing())
  }
  addEventListener('keydown', keys)
  addEventListener('resize', place)

  return () => {
    observer.kill()
    unbench?.()
    removeEventListener('pointermove', follow)
    removeEventListener('keydown', keys)
    removeEventListener('resize', place)
  }
}

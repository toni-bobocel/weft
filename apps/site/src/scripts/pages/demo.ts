import { gsap } from 'gsap'
import { Observer } from 'gsap/Observer'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import type { World } from '../app'
import { BLOCKS } from '../glow'
import { SCENARIOS } from '../playground/scenarios'
import { stage } from '../playground/view'

gsap.registerPlugin(Observer, ScrambleTextPlugin)

/**
 * Scenarios on a drum: titles sit on a cylinder, the one facing you is
 * sharp, the rest fall away into blur. Scroll or drag turns it; the facing
 * title opens a live bench running that scenario.
 */
export function demoPage({ nebula }: World) {
  const axis = document.querySelector('[data-axis]') as HTMLElement
  const tag = document.querySelector('[data-tag]') as HTMLElement
  const preview = document.querySelector('[data-preview]') as HTMLElement
  const play = document.querySelector('[data-play]') as HTMLElement
  const items = [...axis.querySelectorAll<HTMLButtonElement>('.drum__item')]
  const count = items.length
  const STEP = 360 / count
  const scenarioAt = (i: number) => SCENARIOS[i % SCENARIOS.length]

  nebula.to({ dim: 0.45, zoom: 7.4, yaw: 0.5 })

  const height = items[0]?.offsetHeight ?? 80
  const radius = height / 2 / Math.tan(((STEP / 2) * Math.PI) / 180) + 20
  const spin = { a: 0 }
  const place = () => {
    for (const [i, el] of items.entries()) {
      let rel = i * STEP - spin.a
      rel = ((((rel + 180) % 360) + 360) % 360) - 180
      const away = Math.abs(rel)
      gsap.set(el, {
        xPercent: -50,
        yPercent: -50,
        rotationX: -rel,
        transformOrigin: `50% 50% ${-radius}px`,
        y: 0,
        // Titles seen edge-on turn into hairlines: fade them out before they get there.
        autoAlpha: away > 70 ? 0 : 1 - (away / 70) ** 2 * 0.6,
        filter: `blur(${Math.min(away * 0.32, 14)}px)`,
        scale: 1 - Math.min(away / 300, 0.2),
      })
      el.tabIndex = away < STEP / 2 ? 0 : -1
    }
  }
  const facing = () => ((Math.round(spin.a / STEP) % count) + count) % count

  const turnTo = (a: number, duration = 0.9) =>
    gsap.to(spin, {
      a,
      duration,
      ease: 'expo.out',
      onUpdate: place,
      overwrite: true,
      onComplete: announce,
    })
  const announce = () => {
    const s = scenarioAt(facing())
    if (!s) return
    gsap.to(tag, { duration: 0.5, scrambleText: { text: s.tag, chars: BLOCKS } })
    ;(preview.querySelector('[data-blurb]') as HTMLElement).textContent = s.blurb
    ;(preview.querySelector('[data-who]') as HTMLElement).textContent = s.devices.join(' · ')
  }

  spin.a = SCENARIOS.length * STEP
  place()
  gsap.set([tag, preview], { autoAlpha: 0 })
  gsap.from(items, { autoAlpha: 0, rotationX: 70, duration: 1.4, ease: 'expo.out', stagger: 0.05 })
  announce()

  const observer = Observer.create({
    target: window,
    type: 'wheel,touch,pointer',
    wheelSpeed: 0.08,
    dragMinimum: 6,
    tolerance: 4,
    onChangeY: (self) => {
      if (play.style.visibility === 'visible') return
      gsap.to(spin, {
        a: spin.a + self.deltaY * (self.event.type === 'wheel' ? 1 : 0.25),
        duration: 0.5,
        ease: 'power3.out',
        onUpdate: place,
        overwrite: true,
      })
    },
    onStop: () => turnTo(Math.round(spin.a / STEP) * STEP),
    onStopDelay: 0.12,
  })

  const follow = (e: PointerEvent) => {
    gsap.to([tag, preview], { autoAlpha: 1, duration: 0.4 })
    gsap.to(tag, { x: e.clientX + 18, y: e.clientY - 34, duration: 0.5, ease: 'power3.out' })
    gsap.to(preview, { x: e.clientX + 18, y: e.clientY + 8, duration: 0.7, ease: 'power3.out' })
  }
  addEventListener('pointermove', follow)

  let unstage: (() => void) | undefined
  const open = (index: number) => {
    const scenario = scenarioAt(index)
    if (!scenario) return
    unstage?.()
    unstage = stage(play, scenario)
    nebula.to({ dim: 0.85 })
    gsap.set(play, { visibility: 'visible' })
    gsap.fromTo(
      play,
      { clipPath: 'inset(50% 0 50% 0)' },
      { clipPath: 'inset(0% 0 0% 0)', duration: 0.8, ease: 'expo.inOut' },
    )
    gsap.from(play.querySelectorAll('.device, .relay'), {
      y: 30,
      autoAlpha: 0,
      duration: 0.8,
      stagger: 0.08,
      delay: 0.35,
      ease: 'expo.out',
    })
    ;(play.querySelector('[data-replay]') as HTMLElement).onclick = () => open(index)
  }
  const close = () => {
    unstage?.()
    unstage = undefined
    nebula.to({ dim: 0.45 })
    gsap.to(play, {
      clipPath: 'inset(50% 0 50% 0)',
      duration: 0.6,
      ease: 'expo.inOut',
      onComplete: () => gsap.set(play, { visibility: 'hidden' }),
    })
  }

  for (const [i, el] of items.entries()) {
    el.addEventListener('click', () => {
      if (i === facing()) open(i)
      else turnTo(spin.a + ((((i * STEP - spin.a + 180) % 360) + 360) % 360) - 180)
    })
  }
  ;(play.querySelector('[data-close]') as HTMLElement).addEventListener('click', close)
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
    if (play.style.visibility === 'visible') return
    if (e.key === 'ArrowDown') turnTo(Math.round(spin.a / STEP + 1) * STEP)
    if (e.key === 'ArrowUp') turnTo(Math.round(spin.a / STEP - 1) * STEP)
    if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) open(facing())
  }
  addEventListener('keydown', keys)

  return () => {
    observer.kill()
    unstage?.()
    removeEventListener('pointermove', follow)
    removeEventListener('keydown', keys)
  }
}

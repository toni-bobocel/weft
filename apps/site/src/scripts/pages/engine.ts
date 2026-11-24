import { gsap } from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { World } from '../app'
import { linesOf } from '../glow'

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin)

/**
 * A long read. Headlines come up from under the surface curled and soft,
 * lie flat at the reading line, and curl away again as they leave; the
 * cloud turns a little with every chapter.
 */
export function enginePage({ stage }: World) {
  const chapters = [...document.querySelectorAll<HTMLElement>('[data-chapter]')]
  const mark = document.querySelector('[data-mark]') as HTMLElement
  const progress = document.querySelector('[data-progress]') as HTMLElement

  stage.to({ dim: 0.25, zoom: 5.6, yaw: -0.4 })
  window.scrollTo(0, 0)

  chapters.forEach((chapter, i) => {
    const states = linesOf(stage, chapter).map((l) => l.state)
    gsap
      .timeline({
        scrollTrigger: { trigger: chapter, start: 'top bottom', end: 'bottom top', scrub: 1.2 },
      })
      .fromTo(
        states,
        { tiltX: 0.9, bend: 0.22, blur: 9, opacity: 0, stretch: 0.86, dy: 50 },
        {
          tiltX: 0,
          bend: 0,
          blur: 0,
          opacity: 1,
          stretch: 1,
          dy: 0,
          stagger: 0.07,
          ease: 'sine.out',
          duration: 1,
        },
      )
      .to(
        states,
        {
          tiltX: -0.7,
          bend: -0.18,
          blur: 7,
          opacity: 0.15,
          stagger: 0.07,
          ease: 'sine.in',
          duration: 1,
        },
        '+=0.7',
      )

    gsap.from(chapter.querySelectorAll('.kv tr, .prose, .records li, .ghosts div'), {
      autoAlpha: 0,
      y: 18,
      stagger: 0.06,
      duration: 1.6,
      ease: 'expo.out',
      scrollTrigger: { trigger: chapter, start: 'top 55%' },
    })

    ScrollTrigger.create({
      trigger: chapter,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: ({ isActive }) => {
        if (!isActive) return
        gsap.to(mark, {
          duration: 0.8,
          scrambleText: { text: chapter.dataset.chapter ?? '', chars: 'lowerCase', speed: 0.5 },
        })
        stage.to({ yaw: -0.4 + i * 0.3, zoom: 5.6 - (i % 2) * 0.5 }, 3.2)
      },
    })
  })

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: ({ progress: p }) => gsap.set(progress, { scaleY: p }),
  })

  return () => {
    for (const t of ScrollTrigger.getAll()) t.kill()
  }
}

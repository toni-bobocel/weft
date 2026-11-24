import { gsap } from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { World } from '../app'
import { BLOCKS } from '../glow'

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin)

/**
 * A long read where the headlines bend as they pass: they enter tilted back
 * and stretched narrow, stand up straight at the reading line, and lean
 * away as they leave. The cloud turns a little with every chapter.
 */
export function enginePage({ nebula }: World) {
  const chapters = [...document.querySelectorAll<HTMLElement>('[data-chapter]')]
  const mark = document.querySelector('[data-mark]') as HTMLElement
  const progress = document.querySelector('[data-progress]') as HTMLElement

  nebula.to({ dim: 0.2, zoom: 5.6, yaw: -0.4 })
  window.scrollTo(0, 0)

  chapters.forEach((chapter, i) => {
    const lines = chapter.querySelectorAll<HTMLElement>('.glow .ln')
    gsap
      .timeline({
        scrollTrigger: { trigger: chapter, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      })
      .fromTo(
        lines,
        {
          rotationX: 55,
          rotationY: -18,
          fontVariationSettings: "'wdth' 60",
          filter: 'blur(8px)',
          yPercent: 40,
        },
        {
          rotationX: 0,
          rotationY: 0,
          fontVariationSettings: "'wdth' 112",
          filter: 'blur(0px)',
          yPercent: 0,
          stagger: 0.08,
          ease: 'power2.out',
          duration: 1,
        },
      )
      .to(
        lines,
        {
          rotationX: -40,
          rotationY: 14,
          filter: 'blur(6px)',
          fontVariationSettings: "'wdth' 80",
          stagger: 0.08,
          ease: 'power2.in',
          duration: 1,
        },
        '+=0.6',
      )

    gsap.from(chapter.querySelectorAll('.kv tr, .prose, .records li, .ghosts div'), {
      autoAlpha: 0,
      y: 24,
      stagger: 0.05,
      duration: 0.9,
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
          duration: 0.6,
          scrambleText: { text: chapter.dataset.chapter ?? '', chars: BLOCKS },
        })
        nebula.to({ yaw: -0.4 + i * 0.35, zoom: 5.6 - (i % 2) * 0.6 }, 2.4)
      },
    })
  })

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: ({ progress: p }) => gsap.set(progress, { scaleY: p }),
  })

  for (const ln of chapters[0]?.querySelectorAll<HTMLElement>('.glow .ln') ?? []) {
    gsap.to(ln, {
      duration: 1.4,
      delay: 0.3,
      scrambleText: { text: ln.dataset.text ?? '', chars: BLOCKS, speed: 0.6 },
    })
  }
  return () => {
    for (const t of ScrollTrigger.getAll()) t.kill()
  }
}

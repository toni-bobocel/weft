import { gsap } from 'gsap'
import { TextPlugin } from 'gsap/TextPlugin'
import type { Act, Scenario } from './scenarios'
import { type Device, type Packet, TASKS, World } from './world'

gsap.registerPlugin(TextPlugin)

const STATUSES = ['todo', 'doing', 'done']
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const clock = (wall: number) => {
  const d = new Date(wall)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/**
 * The bench: one panel per device, the relay in the middle, packets on the
 * wires, and an inspector that compares digests after every delivery.
 */
export function stage(root: HTMLElement, scenario: Scenario) {
  const bench = root.querySelector('[data-bench]') as HTMLElement
  const story = root.querySelector('[data-story]') as HTMLElement
  const verdict = root.querySelector('[data-verdict]') as HTMLElement
  const journal = root.querySelector('[data-journal]') as HTMLElement
  ;(root.querySelector('[data-title]') as HTMLElement).textContent = scenario.title

  bench.replaceChildren()
  bench.classList.toggle('is-two', scenario.devices.length === 2)
  const wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  wires.classList.add('wires')
  bench.append(wires)
  const relayEl = document.createElement('div')
  relayEl.className = 'relay'
  relayEl.innerHTML =
    '<span class="mono dim">relay</span><b>one more replica</b><span class="mono dim" data-relay-state></span>'
  bench.append(relayEl)

  const log = (line: string) => {
    const li = document.createElement('li')
    li.className = 'mono'
    li.textContent = line
    journal.prepend(li)
    while (journal.children.length > 4) journal.lastElementChild?.remove()
    gsap.from(li, { autoAlpha: 0, x: -10, duration: 0.4 })
  }

  const tweens = new Set<gsap.core.Animation>()
  const world = new World(scenario.devices, {
    ship: (packet, deliver) => tweens.add(fly(packet, deliver)),
    superseded: (device, s) => {
      const who = (c: typeof s.kept) => `"${c.value}" (${c.ts.node} ${clock(c.ts.wall)})`
      log(
        s.outcome === 'replaced'
          ? `${device}: ${who(s.kept)} replaced ${who(s.dropped)}`
          : `${device}: kept ${who(s.kept)}, ignored older ${who(s.dropped)}`,
      )
    },
    note: log,
  })

  const panels = new Map<string, ReturnType<typeof panel>>()
  scenario.devices.forEach((name, i) => {
    const p = panel(world.device(name), world, i)
    panels.set(name, p)
    bench.append(p.el)
  })

  const wire = new Map<string, SVGLineElement>()
  const centre = (el: Element) => {
    const b = el.getBoundingClientRect()
    const o = bench.getBoundingClientRect()
    return { x: b.left - o.left + b.width / 2, y: b.top - o.top + b.height / 2 }
  }
  const layoutWires = () => {
    const r = centre(relayEl)
    for (const [name, p] of panels) {
      let line = wire.get(name)
      if (!line) {
        line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        wires.append(line)
        wire.set(name, line)
      }
      const d = centre(p.el)
      line.setAttribute('x1', String(d.x))
      line.setAttribute('y1', String(d.y))
      line.setAttribute('x2', String(r.x))
      line.setAttribute('y2', String(r.y))
      line.classList.toggle('is-down', !world.device(name).online)
    }
  }

  function fly(packet: Packet, deliver: () => void) {
    const device = packet.from === 'relay' ? packet.to : packet.from
    const p = panels.get(device)
    const dot = document.createElement('i')
    dot.className = `packet${packet.msg.t === 'hello' ? ' is-hello' : ''}`
    bench.append(dot)
    const a = p ? centre(p.el) : { x: 0, y: 0 }
    const b = centre(relayEl)
    const [from, to] = packet.from === 'relay' ? [b, a] : [a, b]
    const size = packet.msg.t === 'ops' ? Math.min(1 + packet.msg.ops.length / 6, 2.6) : 1
    return gsap.fromTo(
      dot,
      { x: from.x, y: from.y, scale: size },
      {
        x: to.x,
        y: to.y,
        duration: packet.latencyMs / 1000,
        ease: 'power1.inOut',
        onComplete: () => {
          dot.remove()
          deliver()
          refresh()
        },
      },
    )
  }

  const refresh = () => {
    for (const p of panels.values()) p.render()
    layoutWires()
    const same = world.converged()
    verdict.textContent = same
      ? `Converged · ${world.relay.replica.digest().slice(0, 12)}`
      : `Diverged · ${new Set(world.devices.map((d) => d.replica.digest())).size} states`
    verdict.classList.toggle('is-same', same)
    ;(relayEl.querySelector('[data-relay-state]') as HTMLElement).textContent =
      `${world.relay.replica.opCount} ops · ${world.relay.peers} peers`
  }

  const act: Act = {
    type: (name, index, text) => {
      const d = world.device(name)
      let at = index === 'end' ? d.replica.text('note').length : index
      for (const [i, ch] of [...text].entries()) {
        tweens.add(
          gsap.delayedCall(i * 0.055, () => {
            d.replica.insertText('note', at, ch)
            at++
            refresh()
          }),
        )
      }
    },
    erase: (name, index, length) => {
      for (let i = 0; i < length; i++) {
        tweens.add(
          gsap.delayedCall(i * 0.05, () => {
            world.device(name).replica.deleteText('note', index + length - 1 - i, 1)
            refresh()
          }),
        )
      }
    },
    title: (name, task, value) => {
      world.device(name).replica.set(task, 'title', value)
      refresh()
    },
    status: (name, task, value) => {
      world.device(name).replica.set(task, 'status', value)
      refresh()
    },
    online: (name, on) => {
      world.setOnline(world.device(name), on)
      refresh()
    },
  }

  for (const d of world.devices) d.replica.subscribe(() => refresh())

  // The scripted run. Narration types itself; the user can take over at any time.
  const script = gsap.timeline({ delay: 0.5 })
  for (const step of scenario.steps) {
    script.add(() => {
      if (step.say)
        gsap.to(story, { duration: step.say.length * 0.014, text: step.say, ease: 'none' })
      step.run?.(world, act)
    })
    script.to({}, { duration: step.wait })
  }
  script.add(() => {
    for (const d of world.devices) if (!d.online && !d.rejected) act.online(d.name, true)
  })
  tweens.add(script)

  const onNetwork = (e: Event) => {
    for (const d of world.devices) act.online(d.name, (e as CustomEvent<boolean>).detail)
  }
  addEventListener('weft:network', onNetwork)
  addEventListener('resize', layoutWires)
  journal.replaceChildren()
  story.textContent = ''
  requestAnimationFrame(refresh)

  return () => {
    for (const t of tweens) t.kill()
    removeEventListener('weft:network', onNetwork)
    removeEventListener('resize', layoutWires)
  }
}

function panel(device: Device, world: World, index: number) {
  const el = document.createElement('section')
  el.className = 'device'
  el.style.gridArea = ['a', 'b', 'c'][index] ?? 'a'
  el.innerHTML = `
    <div class="device__head">
      <span class="device__name">${device.name}</span>
      <button class="chip mono" type="button" data-online></button>
    </div>
    <ul class="tasks">${TASKS.map(
      (t) =>
        `<li class="task" data-task="${t}"><input aria-label="Task title" /><button class="chip mono" type="button" data-status></button></li>`,
    ).join('')}</ul>
    <textarea class="note" aria-label="Shared note on ${device.name}" spellcheck="false"></textarea>
    <div class="device__state mono">
      <span>vector</span><b data-vv></b>
      <span>ops</span><b data-ops></b>
      <span>clock</span><b data-clock></b>
      <span>digest</span><b data-digest></b>
    </div>`

  const replica = device.replica
  const online = el.querySelector('[data-online]') as HTMLButtonElement
  online.addEventListener('click', () => {
    world.setOnline(device, !device.online)
    render()
  })

  for (const li of el.querySelectorAll<HTMLElement>('[data-task]')) {
    const task = li.dataset.task as string
    const input = li.querySelector('input') as HTMLInputElement
    const status = li.querySelector('[data-status]') as HTMLButtonElement
    input.addEventListener('change', () => replica.set(task, 'title', input.value))
    status.addEventListener('click', () => {
      const now = String(replica.records.get(task)?.status ?? 'todo')
      replica.set(task, 'status', STATUSES[(STATUSES.indexOf(now) + 1) % STATUSES.length] as string)
    })
  }

  // Typing becomes RGA ops: the diff between the old and new text is one
  // delete and one insert at the first differing position.
  const note = el.querySelector('.note') as HTMLTextAreaElement
  let shown = replica.text('note')
  note.addEventListener('input', () => {
    const next = note.value
    let start = 0
    while (start < shown.length && start < next.length && shown[start] === next[start]) start++
    let endOld = shown.length
    let endNew = next.length
    while (endOld > start && endNew > start && shown[endOld - 1] === next[endNew - 1]) {
      endOld--
      endNew--
    }
    if (endOld > start) replica.deleteText('note', start, endOld - start)
    if (endNew > start) replica.insertText('note', start, next.slice(start, endNew))
    shown = replica.text('note')
  })

  function render() {
    online.textContent = device.rejected ? 'rejected' : device.online ? 'online' : 'offline'
    online.classList.toggle('is-online', device.online)
    online.classList.toggle('is-offline', !device.online)
    for (const li of el.querySelectorAll<HTMLElement>('[data-task]')) {
      const rec = replica.records.get(li.dataset.task as string) ?? {}
      const input = li.querySelector('input') as HTMLInputElement
      if (document.activeElement !== input) input.value = String(rec.title ?? '')
      ;(li.querySelector('[data-status]') as HTMLElement).textContent = String(rec.status ?? 'todo')
    }
    const text = replica.text('note')
    if (text !== note.value) {
      // Keep the caret on the character it was after, not at the same index.
      const seq = replica.doc('note')
      const caretId =
        document.activeElement === note
          ? seq.idBefore(Math.min(note.selectionStart, text.length))
          : null
      note.value = text
      if (caretId) {
        const at = seq.indexOf(caretId) + 1
        note.setSelectionRange(at, at)
      }
    }
    shown = text
    const vv = replica.versionVector
    ;(el.querySelector('[data-vv]') as HTMLElement).textContent =
      Object.entries(vv)
        .filter(([s]) => s !== 'seed')
        .map(([s, n]) => `${s}:${n}`)
        .join(' ') || '—'
    ;(el.querySelector('[data-ops]') as HTMLElement).textContent =
      `${replica.opCount} · sent ${device.sent} · got ${device.received}${replica.pendingCount ? ` · ${replica.pendingCount} parked` : ''}`
    const last = replica.clock.last
    ;(el.querySelector('[data-clock]') as HTMLElement).textContent =
      `${clock(last.wall)}${device.skewMs ? ` (${device.skewMs > 0 ? '+' : ''}${Math.round(device.skewMs / 1000)}s)` : ''}`
    ;(el.querySelector('[data-digest]') as HTMLElement).textContent = replica.digest().slice(0, 12)
  }

  render()
  return { el, render }
}

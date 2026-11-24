import type { World } from './world'

export interface Step {
  /** Narration, typed into the stage while the step runs. */
  say?: string
  run?: (world: World, act: Act) => void
  /** Seconds to wait after this step. */
  wait: number
}

export interface Act {
  type(device: string, index: number | 'end', text: string): void
  erase(device: string, index: number, length: number): void
  title(device: string, task: string, value: string): void
  status(device: string, task: string, value: string): void
  online(device: string, on: boolean): void
}

export interface Scenario {
  slug: string
  title: string
  tag: string
  blurb: string
  devices: string[]
  steps: Step[]
}

export const SCENARIOS: Scenario[] = [
  {
    slug: 'two-writers',
    title: 'Two writers, one title',
    tag: 'last-writer-wins',
    blurb:
      'Both rename the same task while offline. One title wins on every device, and the log says which and why.',
    devices: ['laptop', 'phone'],
    steps: [
      {
        say: 'Both devices go offline.',
        run: (_, a) => {
          a.online('laptop', false)
          a.online('phone', false)
        },
        wait: 1,
      },
      {
        say: 'The laptop renames the Safari task…',
        run: (_, a) => a.title('laptop', 'safari-login', 'Fix login on Safari 17'),
        wait: 1.2,
      },
      {
        say: '…and the phone renames it too, a moment later.',
        run: (_, a) => a.title('phone', 'safari-login', 'Fix the Safari login loop'),
        wait: 1.4,
      },
      {
        say: 'Reconnect both. The later write, by hybrid clock, wins everywhere.',
        run: (_, a) => {
          a.online('laptop', true)
          a.online('phone', true)
        },
        wait: 3,
      },
    ],
  },
  {
    slug: 'airplane',
    title: 'A week in airplane mode',
    tag: 'offline delta',
    blurb:
      'The phone keeps working offline. On reconnect it sends only what the relay lacks, and gets only what it missed.',
    devices: ['laptop', 'phone'],
    steps: [
      {
        run: (_, a) => {
          a.online('laptop', true)
          a.online('phone', true)
        },
        wait: 1.6,
      },
      { say: 'The phone loses signal.', run: (_, a) => a.online('phone', false), wait: 0.8 },
      {
        say: 'Work goes on on both sides.',
        run: (_, a) => a.status('phone', 'release-notes', 'doing'),
        wait: 0.6,
      },
      { run: (_, a) => a.type('phone', 'end', 'test offline banner, '), wait: 0.8 },
      { run: (_, a) => a.status('laptop', 'ship-offline', 'done'), wait: 0.6 },
      { run: (_, a) => a.type('laptop', 'end', 'tag v1.0, '), wait: 1 },
      {
        say: 'Back online: a hello with a version vector, then just the delta each way.',
        run: (_, a) => a.online('phone', true),
        wait: 3.2,
      },
    ],
  },
  {
    slug: 'same-spot',
    title: 'Same spot, two words',
    tag: 'rga sequence',
    blurb:
      'Two people type at the very same position. The words land whole, side by side, never letter by letter.',
    devices: ['laptop', 'phone'],
    steps: [
      {
        say: 'Offline, both type at the start of the note.',
        run: (_, a) => {
          a.online('laptop', false)
          a.online('phone', false)
        },
        wait: 0.8,
      },
      { run: (_, a) => a.type('laptop', 0, 'urgent: '), wait: 1.2 },
      { run: (_, a) => a.type('phone', 0, 'today: '), wait: 1.4 },
      {
        say: 'Merge. Concurrent runs stay contiguous.',
        run: (_, a) => {
          a.online('laptop', true)
          a.online('phone', true)
        },
        wait: 3,
      },
    ],
  },
  {
    slug: 'deleted-under',
    title: 'Deleted under your cursor',
    tag: 'tombstones',
    blurb:
      'One deletes a word while the other types inside it. The new letters survive; they are anchored to a tombstone.',
    devices: ['laptop', 'phone'],
    steps: [
      {
        run: (_, a) => {
          a.online('laptop', false)
          a.online('phone', false)
        },
        wait: 0.6,
      },
      { say: 'The laptop deletes "checklist"…', run: (_, a) => a.erase('laptop', 7, 9), wait: 1.2 },
      {
        say: '…while the phone turns it into "checklists".',
        run: (_, a) => a.type('phone', 16, 's'),
        wait: 1.2,
      },
      {
        say: 'Merge: the word is gone, the s typed after it stays.',
        run: (_, a) => {
          a.online('laptop', true)
          a.online('phone', true)
        },
        wait: 3,
      },
    ],
  },
  {
    slug: 'twice',
    title: 'Everything arrives twice',
    tag: 'idempotence',
    blurb:
      'The network now redelivers every batch. Duplicates are recognised by site and sequence, and applied once.',
    devices: ['laptop', 'phone'],
    steps: [
      {
        say: 'Every ops packet is now sent twice.',
        run: (w, a) => {
          w.duplicate = true
          a.online('laptop', true)
          a.online('phone', true)
        },
        wait: 1.6,
      },
      { run: (_, a) => a.type('laptop', 'end', 'once, '), wait: 1.4 },
      { run: (_, a) => a.status('phone', 'safari-login', 'done'), wait: 2.6 },
      { say: 'Same state everywhere, nothing doubled.', wait: 1 },
    ],
  },
  {
    slug: 'backwards',
    title: 'Backwards in time',
    tag: 'hybrid clocks',
    blurb:
      "The tablet's clock runs forty seconds slow. Its edit still lands after the one it saw, because the clock is hybrid.",
    devices: ['laptop', 'tablet', 'phone'],
    steps: [
      {
        say: 'The tablet clock is set forty seconds behind.',
        run: (w, a) => {
          w.device('tablet').skewMs = -40_000
          a.online('laptop', true)
          a.online('tablet', true)
          a.online('phone', true)
        },
        wait: 1.6,
      },
      {
        say: 'The laptop sets a status…',
        run: (_, a) => a.status('laptop', 'release-notes', 'doing'),
        wait: 2.2,
      },
      {
        say: '…the tablet, having seen it, changes it again.',
        run: (_, a) => a.status('tablet', 'release-notes', 'done'),
        wait: 2.6,
      },
      {
        say: 'Wall clock says the tablet wrote first. Causality says otherwise, and wins.',
        wait: 1,
      },
    ],
  },
  {
    slug: 'three-way',
    title: 'Three-way partition',
    tag: 'n replicas',
    blurb:
      'Three devices, all offline, all editing. They come back one at a time and end up identical.',
    devices: ['laptop', 'tablet', 'phone'],
    steps: [
      {
        say: 'Everyone offline.',
        run: (_, a) => {
          a.online('laptop', false)
          a.online('tablet', false)
          a.online('phone', false)
        },
        wait: 0.6,
      },
      {
        run: (_, a) => {
          a.type('laptop', 'end', 'laptop, ')
          a.status('laptop', 'safari-login', 'doing')
        },
        wait: 0.9,
      },
      {
        run: (_, a) => {
          a.type('tablet', 'end', 'tablet, ')
          a.title('tablet', 'release-notes', 'Release notes, short')
        },
        wait: 0.9,
      },
      {
        run: (_, a) => {
          a.type('phone', 0, 'phone: ')
          a.status('phone', 'safari-login', 'done')
        },
        wait: 1,
      },
      { say: 'Back one by one.', run: (_, a) => a.online('tablet', true), wait: 1.6 },
      { run: (_, a) => a.online('phone', true), wait: 1.6 },
      { run: (_, a) => a.online('laptop', true), wait: 3 },
    ],
  },
  {
    slug: 'future',
    title: 'The clock from the future',
    tag: 'drift guard',
    blurb:
      'A phone an hour ahead would win every conflict for an hour. The relay refuses it instead.',
    devices: ['laptop', 'phone'],
    steps: [
      {
        say: "The phone's clock jumps an hour ahead.",
        run: (w, a) => {
          w.device('phone').skewMs = 3_600_000
          a.online('laptop', true)
        },
        wait: 1,
      },
      { run: (_, a) => a.title('phone', 'ship-offline', 'From the future'), wait: 0.8 },
      {
        say: 'It connects. The relay closes it with 4400.',
        run: (_, a) => a.online('phone', true),
        wait: 2.4,
      },
      { say: 'Nothing from the future reached anyone.', wait: 1 },
    ],
  },
]

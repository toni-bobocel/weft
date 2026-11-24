// Everything here is synthesised in the browser: no audio files. A slow pad
// in D, a sub, a breath of filtered noise like water far away, and glassy
// notes picked at random from a pentatonic scale. Clicks drop a stone.

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12)

// Dmaj9, Bm11, Gmaj9, Asus2 — voiced low and open so nothing beats.
const CHORDS = [
  [50, 57, 64, 66, 73],
  [47, 54, 62, 69, 76],
  [43, 50, 59, 66, 69],
  [45, 52, 59, 64, 71],
]
const PENTATONIC = [74, 76, 78, 81, 83, 86, 88, 90]
const CHORD_SECONDS = 11

export class Ambient {
  #ctx: AudioContext | null = null
  #master!: GainNode
  #wet!: GainNode
  #filter!: BiquadFilterNode
  #analyser!: AnalyserNode
  #levels = new Uint8Array(64)
  #timer = 0
  #chord = 0
  #nextChord = 0
  #nextPluck = 0
  on = false

  /** Must be called from a user gesture: browsers block audio until then. */
  start() {
    if (!this.#ctx) this.#build()
    const ctx = this.#ctx as AudioContext
    void ctx.resume()
    this.on = true
    this.#master.gain.cancelScheduledValues(ctx.currentTime)
    this.#master.gain.setTargetAtTime(0.5, ctx.currentTime, 1.2)
    if (!this.#timer) this.#timer = window.setInterval(() => this.#schedule(), 250)
  }

  stop() {
    if (!this.#ctx) return
    this.on = false
    this.#master.gain.setTargetAtTime(0, this.#ctx.currentTime, 0.6)
  }

  toggle() {
    if (this.on) this.stop()
    else this.start()
    return this.on
  }

  /** 0..1, how loud things are right now: the cloud breathes with it. */
  level() {
    if (!this.#ctx || !this.on) return 0
    this.#analyser.getByteTimeDomainData(this.#levels)
    let sum = 0
    for (const v of this.#levels) sum += ((v - 128) / 128) ** 2
    return Math.min(Math.sqrt(sum / this.#levels.length) * 6, 1)
  }

  /** A stone dropped in still water: a quick downward sweep into the reverb. */
  drop(strength = 1) {
    const ctx = this.#ctx
    if (!ctx || !this.on) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(980 + Math.random() * 300, t)
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.16)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.09 * strength, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    osc.connect(gain)
    gain.connect(this.#wet)
    gain.connect(this.#master)
    osc.start(t)
    osc.stop(t + 0.6)
  }

  /** A faint high note for hovering links. */
  tick() {
    const ctx = this.#ctx
    if (!ctx || !this.on) return
    this.#note(PENTATONIC[Math.floor(Math.random() * 3) + 5] ?? 88, ctx.currentTime, 0.018, 0.9)
  }

  #build() {
    const ctx = new AudioContext()
    this.#ctx = ctx
    this.#master = ctx.createGain()
    this.#master.gain.value = 0
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -20
    comp.ratio.value = 3
    this.#analyser = ctx.createAnalyser()
    this.#analyser.fftSize = 128
    this.#master.connect(comp).connect(this.#analyser).connect(ctx.destination)

    const reverb = ctx.createConvolver()
    reverb.buffer = this.#impulse(5.5)
    this.#wet = ctx.createGain()
    this.#wet.gain.value = 0.55
    this.#wet.connect(reverb).connect(this.#master)

    // One shared filter for the pad, opening and closing over twenty seconds.
    this.#filter = ctx.createBiquadFilter()
    this.#filter.type = 'lowpass'
    this.#filter.frequency.value = 900
    this.#filter.Q.value = 0.4
    const lfo = ctx.createOscillator()
    const lfoDepth = ctx.createGain()
    lfo.frequency.value = 1 / 20
    lfoDepth.gain.value = 420
    lfo.connect(lfoDepth).connect(this.#filter.frequency)
    lfo.start()
    this.#filter.connect(this.#master)
    this.#filter.connect(this.#wet)

    // Water, very far away: looping noise through a wide band-pass.
    const noise = ctx.createBufferSource()
    noise.buffer = this.#noise(4)
    noise.loop = true
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 700
    band.Q.value = 0.5
    const hush = ctx.createGain()
    hush.gain.value = 0.012
    noise.connect(band).connect(hush).connect(this.#wet)
    noise.start()

    this.#nextChord = ctx.currentTime + 0.1
    this.#nextPluck = ctx.currentTime + 2
  }

  #schedule() {
    const ctx = this.#ctx
    if (!ctx) return
    const horizon = ctx.currentTime + 1
    while (this.#nextChord < horizon) {
      this.#pad(CHORDS[this.#chord % CHORDS.length] ?? [], this.#nextChord)
      this.#chord++
      this.#nextChord += CHORD_SECONDS
    }
    while (this.#nextPluck < horizon) {
      const n = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)] ?? 81
      this.#note(n, this.#nextPluck, 0.03 + Math.random() * 0.02, 3.5)
      // Sometimes an echo of itself an octave down, a beat later.
      if (Math.random() < 0.3) this.#note(n - 12, this.#nextPluck + 0.42, 0.02, 3)
      this.#nextPluck += 2.2 + Math.random() * 4.5
    }
  }

  #pad(chord: number[], at: number) {
    const ctx = this.#ctx as AudioContext
    const length = CHORD_SECONDS + 4
    for (const n of chord) {
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.028, at + 4)
      gain.gain.setValueAtTime(0.028, at + CHORD_SECONDS - 1)
      gain.gain.linearRampToValueAtTime(0, at + length)
      gain.connect(this.#filter)
      for (const [type, detune] of [
        ['sine', -6],
        ['triangle', 5],
      ] as const) {
        const osc = ctx.createOscillator()
        osc.type = type
        osc.frequency.value = midi(n)
        osc.detune.value = detune
        osc.connect(gain)
        osc.start(at)
        osc.stop(at + length + 0.1)
      }
    }
    const sub = ctx.createOscillator()
    const subGain = ctx.createGain()
    sub.frequency.value = midi((chord[0] ?? 50) - 12)
    subGain.gain.setValueAtTime(0, at)
    subGain.gain.linearRampToValueAtTime(0.05, at + 5)
    subGain.gain.linearRampToValueAtTime(0, at + length)
    sub.connect(subGain).connect(this.#master)
    sub.start(at)
    sub.stop(at + length + 0.1)
  }

  #note(n: number, at: number, peak: number, decay: number) {
    const ctx = this.#ctx as AudioContext
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(peak, at + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay)
    gain.connect(this.#wet)
    const dry = ctx.createGain()
    dry.gain.value = 0.35
    gain.connect(dry).connect(this.#master)
    for (const [ratio, level] of [
      [1, 1],
      [2.01, 0.25],
      [3.98, 0.08],
    ] as const) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.frequency.value = midi(n) * ratio
      g.gain.value = level
      osc.connect(g).connect(gain)
      osc.start(at)
      osc.stop(at + decay + 0.1)
    }
  }

  #impulse(seconds: number) {
    const ctx = this.#ctx as AudioContext
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c)
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2
    }
    return buffer
  }

  #noise(seconds: number) {
    const ctx = this.#ctx as AudioContext
    const length = Math.floor(ctx.sampleRate * seconds)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    // Brownian, so it rumbles instead of hissing.
    let last = 0
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[i] = last * 3.5
    }
    return buffer
  }
}

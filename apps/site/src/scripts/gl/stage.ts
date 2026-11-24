import { gsap } from 'gsap'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  LineSegments,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { Line } from './lines'
import { QUAD_VERTEX, Water } from './water'

const DUST_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSplit;
  uniform float uBurst;
  uniform float uPixel;
  uniform vec2 uPointer;
  attribute float aSeed;
  attribute float aSide;
  attribute float aSize;
  attribute float aTone;
  varying float vTone;
  varying float vFade;

  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  void main() {
    vec3 p = position;
    float r = length(p.xz);
    p.xz = rot(uTime * 0.018 / (0.7 + r * 0.3)) * p.xz;
    p.y += sin(uTime * 0.25 + aSeed * 6.2831) * 0.03;
    p.x += aSide * uSplit * (1.4 + abs(p.x) * 0.2);
    p.yz *= 1.0 - uSplit * 0.3;
    p *= 1.0 + uBurst * (0.3 + aSeed * 1.2);
    p.xy += uPointer * (0.08 + p.z * 0.04);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel * (9.0 / -mv.z);
    vTone = aTone;
    vFade = smoothstep(10.0, 2.5, -mv.z);
  }
`

const DUST_FRAGMENT = /* glsl */ `
  uniform float uDim;
  uniform float uLevel;
  uniform vec3 uCool;
  uniform vec3 uTint;
  varying float vTone;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.6);
    vec3 c = mix(uCool, uTint, vTone);
    gl_FragColor = vec4(c, a * vFade * (0.42 + uLevel * 0.25) * (1.0 - uDim * 0.7));
  }
`

const STREAK_VERTEX = /* glsl */ `
  uniform float uTime;
  attribute vec3 aDir;
  attribute float aHead;
  attribute float aSpeed;
  attribute float aOffset;
  varying float vAlpha;
  void main() {
    float t = fract(uTime * aSpeed + aOffset);
    vec3 p = aDir * (1.4 + t * 6.0 + aHead * 0.3);
    vAlpha = sin(t * 3.14159) * (0.2 + aHead * 0.8);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const STREAK_FRAGMENT = /* glsl */ `
  uniform vec3 uTint;
  uniform float uDim;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(uTint, vAlpha * 0.22 * (1.0 - uDim)); }
`

// The water moves whatever was drawn: light bends at the ripples' slopes,
// colour splits a little where they are steep, and crests catch a highlight.
const COMPOSITE = /* glsl */ `
  uniform sampler2D uScene;
  uniform sampler2D uWater;
  uniform vec2 uWaterTexel;
  uniform float uTime;
  uniform vec2 uView;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    float l = texture2D(uWater, vUv - vec2(uWaterTexel.x, 0.0)).r;
    float r = texture2D(uWater, vUv + vec2(uWaterTexel.x, 0.0)).r;
    float b = texture2D(uWater, vUv - vec2(0.0, uWaterTexel.y)).r;
    float t = texture2D(uWater, vUv + vec2(0.0, uWaterTexel.y)).r;
    vec2 slope = vec2(r - l, t - b);
    vec2 off = slope * 0.11;
    float split = length(slope) * 1.2;

    vec3 col;
    col.r = texture2D(uScene, vUv + off * (1.0 + split)).r;
    col.g = texture2D(uScene, vUv + off).g;
    col.b = texture2D(uScene, vUv + off * (1.0 - split)).b;

    vec3 n = normalize(vec3(-slope * 14.0, 1.0));
    float spec = pow(max(dot(n, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 60.0);
    col += vec3(0.62, 0.78, 0.98) * spec * 0.35 * smoothstep(0.0, 0.015, length(slope));

    vec2 q = vUv - 0.5;
    col *= 1.0 - dot(q, q) * 0.9;
    col += (hash(vUv * uView + uTime) - 0.5) * 0.018;
    gl_FragColor = vec4(col, 1.0);
  }
`

function gauss() {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export class Stage {
  readonly renderer: WebGLRenderer
  readonly state = { split: 0, burst: 0, dim: 0, zoom: 6.2, yaw: 0, level: 0 }
  readonly #world = new Scene()
  readonly #camera = new PerspectiveCamera(50, 1, 0.1, 60)
  readonly #overlay = new Scene()
  readonly #flat = new Camera()
  readonly #post = new Scene()
  readonly #sceneTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false })
  readonly #water: Water
  readonly #lines = new Set<Line>()
  readonly #pointer = { x: 0, y: 0 }
  readonly #last = { x: -1, y: -1, t: 0 }
  #time = 0
  #dpr = 1

  readonly #dust = {
    uTime: { value: 0 },
    uSplit: { value: 0 },
    uBurst: { value: 0 },
    uDim: { value: 0 },
    uLevel: { value: 0 },
    uPixel: { value: 1 },
    uPointer: { value: [0, 0] },
    uCool: { value: new Color('#dbe7f5') },
    uTint: { value: new Color('#8fb6e6') },
  }
  readonly #streak = { uTime: { value: 0 }, uDim: { value: 0 }, uTint: this.#dust.uTint }
  readonly #composite = {
    uScene: { value: this.#sceneTarget.texture },
    uWater: { value: null as unknown },
    uWaterTexel: { value: [0, 0] },
    uTime: { value: 0 },
    uView: { value: [1, 1] },
  }

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor(0x06090d, 1)
    this.#dpr = Math.min(devicePixelRatio, 1.5)
    this.renderer.setPixelRatio(this.#dpr)
    this.#dust.uPixel.value = this.#dpr
    this.#water = new Water(this.renderer)

    this.#buildDust()
    this.#buildStreaks()
    this.#post.add(
      new Mesh(
        new PlaneGeometry(2, 2),
        new ShaderMaterial({
          vertexShader: QUAD_VERTEX,
          fragmentShader: COMPOSITE,
          uniforms: this.#composite,
        }),
      ),
    )

    this.#resize()
    addEventListener('resize', () => this.#resize())
    addEventListener('pointermove', (e) => this.#move(e.clientX, e.clientY))
    addEventListener('pointerdown', (e) => this.splash(e.clientX, e.clientY, 1))
    gsap.ticker.add(this.#frame)
  }

  /** A stone in the water at screen coordinates. */
  splash(x: number, y: number, strength: number) {
    this.#water.drop(x / innerWidth, 1 - y / innerHeight, 0.035 + strength * 0.03, 0.9 * strength)
  }

  line(el: HTMLElement) {
    const line = new Line(el)
    this.#lines.add(line)
    this.#overlay.add(line.mesh)
    return line
  }

  clearLines() {
    for (const l of this.#lines) {
      this.#overlay.remove(l.mesh)
      l.dispose()
    }
    this.#lines.clear()
  }

  split() {
    gsap.to(this.state, { split: 1, duration: 2.2, ease: 'expo.out', overwrite: 'auto' })
  }

  merge() {
    gsap
      .timeline({ overwrite: 'auto' })
      .to(this.state, { split: 0, duration: 1.2, ease: 'power3.in' })
      .fromTo(this.state, { burst: 0.35 }, { burst: 0, duration: 2.6, ease: 'expo.out' })
  }

  ignite() {
    return gsap.fromTo(
      this.state,
      { zoom: 2.6, burst: 1 },
      { zoom: 6.2, burst: 0, duration: 4.2, ease: 'expo.out' },
    )
  }

  to(vars: Partial<Stage['state']>, duration = 2.4) {
    return gsap.to(this.state, { ...vars, duration, ease: 'sine.inOut', overwrite: 'auto' })
  }

  #move(x: number, y: number) {
    gsap.to(this.#pointer, {
      x: (x / innerWidth - 0.5) * 2,
      y: -(y / innerHeight - 0.5) * 2,
      duration: 2,
      ease: 'power3.out',
      overwrite: true,
    })
    // A wake: small drops along the path, stronger when the hand moves fast.
    const now = performance.now()
    if (this.#last.x >= 0) {
      const speed = Math.hypot(x - this.#last.x, y - this.#last.y) / Math.max(now - this.#last.t, 8)
      if (speed > 0.05)
        this.#water.drop(x / innerWidth, 1 - y / innerHeight, 0.018, Math.min(speed * 0.09, 0.22))
    }
    this.#last.x = x
    this.#last.y = y
    this.#last.t = now
  }

  #buildDust() {
    const count = matchMedia('(max-width: 900px)').matches ? 18000 : 46000
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const side = new Float32Array(count)
    const size = new Float32Array(count)
    const tone = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const roll = Math.random()
      let x: number
      let y: number
      let z: number
      if (roll < 0.66) {
        x = gauss() * 2.4
        y = gauss() * 0.42 * (1 - Math.min(Math.abs(x) / 6, 0.6))
        z = gauss() * 0.9
      } else if (roll < 0.86) {
        x = gauss() * 0.6
        y = gauss() * 0.36
        z = gauss() * 0.5
      } else {
        x = (Math.random() - 0.5) * 14
        y = (Math.random() - 0.5) * 8
        z = (Math.random() - 0.5) * 8
      }
      pos.set([x, y, z], i * 3)
      seed[i] = Math.random()
      side[i] = x < 0 ? -1 : 1
      // Almost all dust; a rare mote close to the lens, soft and dim.
      size[i] = Math.random() < 0.008 ? 5 + Math.random() * 7 : 0.8 + Math.random() ** 5 * 1.6
      tone[i] = Math.random() < 0.3 ? 0.4 + Math.random() * 0.6 : Math.random() * 0.2
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1))
    geo.setAttribute('aSide', new BufferAttribute(side, 1))
    geo.setAttribute('aSize', new BufferAttribute(size, 1))
    geo.setAttribute('aTone', new BufferAttribute(tone, 1))
    this.#world.add(
      new Points(
        geo,
        new ShaderMaterial({
          vertexShader: DUST_VERTEX,
          fragmentShader: DUST_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          uniforms: this.#dust,
        }),
      ),
    )
  }

  #buildStreaks() {
    const lines = 70
    const dir = new Float32Array(lines * 6)
    const head = new Float32Array(lines * 2)
    const speed = new Float32Array(lines * 2)
    const offset = new Float32Array(lines * 2)
    for (let i = 0; i < lines; i++) {
      const theta = Math.random() * Math.PI * 2
      const d = [Math.cos(theta), gauss() * 0.15, Math.sin(theta) * 0.6]
      const s = 0.012 + Math.random() * 0.025
      const o = Math.random()
      for (let k = 0; k < 2; k++) {
        dir.set(d, (i * 2 + k) * 3)
        head[i * 2 + k] = k
        speed[i * 2 + k] = s
        offset[i * 2 + k] = o
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(lines * 6), 3))
    geo.setAttribute('aDir', new BufferAttribute(dir, 3))
    geo.setAttribute('aHead', new BufferAttribute(head, 1))
    geo.setAttribute('aSpeed', new BufferAttribute(speed, 1))
    geo.setAttribute('aOffset', new BufferAttribute(offset, 1))
    const streaks = new LineSegments(
      geo,
      new ShaderMaterial({
        vertexShader: STREAK_VERTEX,
        fragmentShader: STREAK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: this.#streak,
      }),
    )
    streaks.frustumCulled = false
    this.#world.add(streaks)
  }

  #resize() {
    const w = innerWidth
    const h = innerHeight
    this.renderer.setSize(w, h, false)
    this.#sceneTarget.setSize(w * this.#dpr, h * this.#dpr)
    this.#camera.aspect = w / h
    this.#camera.updateProjectionMatrix()
    this.#water.resize(w, h)
    this.#composite.uView.value = [w * this.#dpr, h * this.#dpr]
    this.#composite.uWaterTexel.value = [4 / w, 4 / h]
  }

  #frame = (_: number, delta: number) => {
    if (document.hidden) return
    this.#time += Math.min(delta, 50) / 1000
    const d = this.#dust
    d.uTime.value = this.#time
    d.uSplit.value = this.state.split
    d.uBurst.value = this.state.burst
    d.uDim.value = this.state.dim
    d.uLevel.value = this.state.level
    d.uPointer.value = [this.#pointer.x, this.#pointer.y]
    this.#streak.uTime.value = this.#time
    this.#streak.uDim.value = Math.max(this.state.dim, this.state.split)

    this.#camera.position.set(
      Math.sin(this.state.yaw) * this.state.zoom,
      0.3,
      Math.cos(this.state.yaw) * this.state.zoom,
    )
    this.#camera.lookAt(0, 0, 0)
    for (const l of this.#lines) l.update(innerWidth, innerHeight, this.#dpr)

    this.#water.step()
    this.renderer.setRenderTarget(this.#sceneTarget)
    this.renderer.clear()
    this.renderer.render(this.#world, this.#camera)
    this.renderer.autoClear = false
    this.renderer.render(this.#overlay, this.#flat)
    this.renderer.autoClear = true
    this.renderer.setRenderTarget(null)
    this.#composite.uWater.value = this.#water.texture
    this.#composite.uTime.value = this.#time
    this.renderer.render(this.#post, this.#flat)
  }
}

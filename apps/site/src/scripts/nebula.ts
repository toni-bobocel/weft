import { gsap } from 'gsap'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from 'three'

// A band of light that stands for the op log. It drifts while things are
// calm, tears in two while the network is partitioned, and snaps back with a
// flash when the halves merge: the same story the engine tells in data.

const VERTEX = /* glsl */ `
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
    p.xz = rot(uTime * 0.035 / (0.6 + r * 0.35) + aSeed * 0.002) * p.xz;
    p.y += sin(uTime * 0.4 + aSeed * 6.2831) * 0.04;

    // Partition: each half drifts to its own side and tightens.
    p.x += aSide * uSplit * (1.5 + abs(p.x) * 0.2);
    p.yz *= 1.0 - uSplit * 0.35;

    p *= 1.0 + uBurst * (0.4 + aSeed * 1.6);
    p.xy += uPointer * (0.12 + p.z * 0.06);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel * (13.0 / -mv.z);
    vTone = aTone;
    vFade = smoothstep(9.0, 2.5, -mv.z);
  }
`

const FRAGMENT = /* glsl */ `
  uniform float uDim;
  uniform vec3 uWarm;
  uniform vec3 uThread;
  varying float vTone;
  varying float vFade;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = pow(smoothstep(0.5, 0.0, d), 1.8);
    vec3 c = mix(uWarm, uThread, vTone);
    gl_FragColor = vec4(c, a * vFade * 0.62 * (1.0 - uDim * 0.75));
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
    float reach = 1.2 + t * 7.0 + aHead * 0.45;
    vec3 p = aDir * reach;
    vAlpha = sin(t * 3.14159) * (0.35 + aHead * 0.65);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const STREAK_FRAGMENT = /* glsl */ `
  uniform vec3 uThread;
  uniform float uDim;
  varying float vAlpha;
  void main() { gl_FragColor = vec4(uThread, vAlpha * 0.55 * (1.0 - uDim)); }
`

function gauss() {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export class Nebula {
  readonly #renderer: WebGLRenderer
  readonly #scene = new Scene()
  readonly #camera = new PerspectiveCamera(52, 1, 0.1, 60)
  readonly #u = {
    uTime: { value: 0 },
    uSplit: { value: 0 },
    uBurst: { value: 0 },
    uDim: { value: 0 },
    uPixel: { value: 1 },
    uPointer: { value: [0, 0] },
    uWarm: { value: new Color('#fff1e8') },
    uThread: { value: new Color('#ff5fa2') },
  }
  readonly #su = { uTime: { value: 0 }, uDim: { value: 0 }, uThread: this.#u.uThread }
  readonly #pointer = { x: 0, y: 0 }
  readonly state = { split: 0, burst: 0, dim: 0, zoom: 6.2, yaw: 0 }
  #time = 0

  constructor(readonly canvas: HTMLCanvasElement) {
    this.#renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.#renderer.setClearColor(0x080608, 1)
    this.#renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))

    const count = matchMedia('(max-width: 900px)').matches ? 16000 : 42000
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
      if (roll < 0.62) {
        // The band.
        x = gauss() * 2.3
        y = gauss() * 0.42 * (1 - Math.min(Math.abs(x) / 6, 0.6))
        z = gauss() * 0.9
      } else if (roll < 0.86) {
        // A dense core.
        x = gauss() * 0.55
        y = gauss() * 0.35
        z = gauss() * 0.45
      } else {
        // Loose dust, far out.
        x = (Math.random() - 0.5) * 14
        y = (Math.random() - 0.5) * 8
        z = (Math.random() - 0.5) * 8
      }
      pos.set([x, y, z], i * 3)
      seed[i] = Math.random()
      side[i] = x < 0 ? -1 : 1
      size[i] = Math.random() < 0.015 ? 6 + Math.random() * 10 : 0.7 + Math.random() ** 4 * 2.4
      tone[i] = Math.random() < 0.16 ? 0.55 + Math.random() * 0.45 : Math.random() * 0.12
    }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1))
    geo.setAttribute('aSide', new BufferAttribute(side, 1))
    geo.setAttribute('aSize', new BufferAttribute(size, 1))
    geo.setAttribute('aTone', new BufferAttribute(tone, 1))

    this.#u.uPixel.value = this.#renderer.getPixelRatio()
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: this.#u,
    })
    this.#scene.add(new Points(geo, material))

    const lines = 180
    const dir = new Float32Array(lines * 2 * 3)
    const head = new Float32Array(lines * 2)
    const speed = new Float32Array(lines * 2)
    const offset = new Float32Array(lines * 2)
    for (let i = 0; i < lines; i++) {
      const theta = Math.random() * Math.PI * 2
      const d = [Math.cos(theta), gauss() * 0.18, Math.sin(theta) * 0.6]
      const s = 0.03 + Math.random() * 0.06
      const o = Math.random()
      for (let k = 0; k < 2; k++) {
        dir.set(d, (i * 2 + k) * 3)
        head[i * 2 + k] = k
        speed[i * 2 + k] = s
        offset[i * 2 + k] = o
      }
    }
    const streakGeo = new BufferGeometry()
    streakGeo.setAttribute('position', new BufferAttribute(new Float32Array(lines * 2 * 3), 3))
    streakGeo.setAttribute('aDir', new BufferAttribute(dir, 3))
    streakGeo.setAttribute('aHead', new BufferAttribute(head, 1))
    streakGeo.setAttribute('aSpeed', new BufferAttribute(speed, 1))
    streakGeo.setAttribute('aOffset', new BufferAttribute(offset, 1))
    const streakMaterial = new ShaderMaterial({
      vertexShader: STREAK_VERTEX,
      fragmentShader: STREAK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: this.#su,
    })
    const streaks = new LineSegments(streakGeo, streakMaterial)
    streaks.frustumCulled = false
    this.#scene.add(streaks)

    this.#resize()
    addEventListener('resize', () => this.#resize())
    addEventListener('pointermove', (e) => {
      gsap.to(this.#pointer, {
        x: (e.clientX / innerWidth - 0.5) * 2,
        y: -(e.clientY / innerHeight - 0.5) * 2,
        duration: 1.4,
        ease: 'power3.out',
        overwrite: true,
      })
    })
    gsap.ticker.add(this.#frame)
  }

  /** Tear the cloud in two. */
  split() {
    gsap.to(this.state, { split: 1, duration: 1.6, ease: 'expo.out', overwrite: 'auto' })
  }

  /** Bring the halves back together, with a flash at the moment they meet. */
  merge() {
    gsap
      .timeline({ overwrite: 'auto' })
      .to(this.state, { split: 0, duration: 0.9, ease: 'expo.in' })
      .fromTo(this.state, { burst: 0.55 }, { burst: 0, duration: 1.8, ease: 'expo.out' })
  }

  /** The entrance: everything starts compressed and blows outward. */
  ignite() {
    return gsap
      .timeline()
      .fromTo(
        this.state,
        { zoom: 2.2, burst: 1.4 },
        { zoom: 6.2, burst: 0, duration: 3.4, ease: 'expo.out' },
      )
  }

  to(vars: Partial<Nebula['state']>, duration = 1.6) {
    return gsap.to(this.state, { ...vars, duration, ease: 'power3.inOut', overwrite: 'auto' })
  }

  #resize() {
    const w = innerWidth
    const h = innerHeight
    this.#renderer.setSize(w, h, false)
    this.#camera.aspect = w / h
    this.#camera.updateProjectionMatrix()
  }

  #frame = (_: number, delta: number) => {
    if (document.hidden) return
    this.#time += delta / 1000
    const u = this.#u
    u.uTime.value = this.#time
    u.uSplit.value = this.state.split
    u.uBurst.value = this.state.burst
    u.uDim.value = this.state.dim
    u.uPointer.value = [this.#pointer.x, this.#pointer.y]
    this.#su.uTime.value = this.#time
    this.#su.uDim.value = Math.max(this.state.dim, this.state.split)

    this.#camera.position.set(
      Math.sin(this.state.yaw) * this.state.zoom,
      0.35,
      Math.cos(this.state.yaw) * this.state.zoom,
    )
    this.#camera.lookAt(0, 0, 0)
    this.#renderer.render(this.#scene, this.#camera)
  }
}

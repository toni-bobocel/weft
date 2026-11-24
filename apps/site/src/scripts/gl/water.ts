import {
  Camera,
  HalfFloatType,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three'

// A height field that obeys the wave equation, stepped on the GPU between two
// render targets. Red is height, green is velocity. Pointer movement drops
// small stones along its path; a click drops a big one.

const MAX_DROPS = 6

const STEP = /* glsl */ `
  uniform sampler2D uPrev;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform vec4 uDrops[${MAX_DROPS}];
  varying vec2 vUv;

  void main() {
    vec4 info = texture2D(uPrev, vUv);
    float avg = (
      texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r +
      texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r +
      texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r +
      texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r
    ) * 0.25;
    info.g += (avg - info.r) * 1.9;
    info.g *= 0.986;
    info.r += info.g;
    info.r *= 0.996;

    for (int i = 0; i < ${MAX_DROPS}; i++) {
      vec4 d = uDrops[i];
      if (d.w == 0.0) continue;
      vec2 delta = (vUv - d.xy) * vec2(uAspect, 1.0);
      float dist = length(delta);
      if (dist < d.z) info.r += d.w * (0.5 + 0.5 * cos(3.14159 * dist / d.z));
    }
    gl_FragColor = info;
  }
`

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

export class Water {
  #a: WebGLRenderTarget
  #b: WebGLRenderTarget
  readonly #scene = new Scene()
  readonly #camera = new Camera()
  readonly #material: ShaderMaterial
  readonly #drops: Vector4[] = Array.from({ length: MAX_DROPS }, () => new Vector4())
  #queued = 0

  constructor(private readonly renderer: WebGLRenderer) {
    this.#a = this.#target(1, 1)
    this.#b = this.#target(1, 1)
    this.#material = new ShaderMaterial({
      vertexShader: QUAD_VERTEX,
      fragmentShader: STEP,
      uniforms: {
        uPrev: { value: null },
        uTexel: { value: new Vector2() },
        uAspect: { value: 1 },
        uDrops: { value: this.#drops },
      },
    })
    this.#scene.add(new Mesh(new PlaneGeometry(2, 2), this.#material))
  }

  resize(width: number, height: number) {
    // A quarter of the screen is plenty: ripples are smooth by nature.
    const w = Math.max(64, Math.round(width / 4))
    const h = Math.max(64, Math.round(height / 4))
    this.#a.setSize(w, h)
    this.#b.setSize(w, h)
    const u = this.#material.uniforms
    ;(u.uTexel as { value: Vector2 }).value.set(1 / w, 1 / h)
    ;(u.uAspect as { value: number }).value = width / height
  }

  /** x, y in 0..1 with y up; radius in units of screen height. */
  drop(x: number, y: number, radius: number, strength: number) {
    if (this.#queued >= MAX_DROPS) return
    this.#drops[this.#queued++]?.set(x, y, radius, strength)
  }

  step() {
    const u = this.#material.uniforms
    ;(u.uPrev as { value: unknown }).value = this.#a.texture
    this.renderer.setRenderTarget(this.#b)
    this.renderer.render(this.#scene, this.#camera)
    this.renderer.setRenderTarget(null)
    ;[this.#a, this.#b] = [this.#b, this.#a]
    for (const d of this.#drops) d.set(0, 0, 0, 0)
    this.#queued = 0
  }

  get texture() {
    return this.#a.texture
  }

  #target(w: number, h: number) {
    return new WebGLRenderTarget(w, h, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    })
  }
}

export { QUAD_VERTEX }

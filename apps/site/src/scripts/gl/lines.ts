import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'

// Headlines are typeset in the DOM, where they stay selectable and readable
// by assistive tech, then painted into WebGL so the water can move them.
// The DOM copy is transparent; this is what you actually see.

const VERTEX = /* glsl */ `
  uniform vec2 uSize;
  uniform vec2 uCenter;
  uniform vec2 uView;
  uniform float uTiltX;
  uniform float uTiltY;
  uniform float uZ;
  uniform float uStretch;
  uniform float uBend;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 p = vec3(position.x * uSize.x * uStretch, position.y * uSize.y, 0.0);
    // A gentle curl along the line, like a page that is not quite flat.
    p.z -= uBend * pow(position.x * 2.0, 2.0) * uSize.y * 1.5;
    float cx = cos(uTiltX), sx = sin(uTiltX);
    p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
    float cy = cos(uTiltY), sy = sin(uTiltY);
    p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
    p.z += uZ;
    float persp = 1400.0 / (1400.0 - p.z);
    // Screen y grows downward; the plane's y grows upward.
    vec2 screen = uCenter + vec2(p.x, -p.y) * persp;
    gl_Position = vec4(screen / uView * 2.0 - 1.0, 0.0, 1.0);
    gl_Position.y *= -1.0;
  }
`

const FRAGMENT = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uOpacity;
  uniform float uBlur;
  uniform vec2 uTexel;
  varying vec2 vUv;

  void main() {
    vec4 c = texture2D(uTex, vUv);
    if (uBlur > 0.01) {
      vec4 acc = c;
      float r = uBlur;
      acc += texture2D(uTex, vUv + uTexel * vec2(r, 0.0));
      acc += texture2D(uTex, vUv - uTexel * vec2(r, 0.0));
      acc += texture2D(uTex, vUv + uTexel * vec2(0.0, r));
      acc += texture2D(uTex, vUv - uTexel * vec2(0.0, r));
      acc += texture2D(uTex, vUv + uTexel * vec2(r, r) * 0.7);
      acc += texture2D(uTex, vUv - uTexel * vec2(r, r) * 0.7);
      acc += texture2D(uTex, vUv + uTexel * vec2(r, -r) * 0.7);
      acc += texture2D(uTex, vUv - uTexel * vec2(r, -r) * 0.7);
      c = acc / 9.0;
    }
    gl_FragColor = vec4(c.rgb, c.a * uOpacity);
  }
`

// Computed styles report font-stretch as a percentage, which the canvas
// font shorthand rejects (and then silently falls back to 10px sans-serif).
const STRETCH: [number, string][] = [
  [50, 'ultra-condensed'],
  [62.5, 'extra-condensed'],
  [75, 'condensed'],
  [87.5, 'semi-condensed'],
  [100, 'normal'],
  [112.5, 'semi-expanded'],
  [125, 'expanded'],
  [150, 'extra-expanded'],
  [200, 'ultra-expanded'],
]
const stretchKeyword = (value: string) => {
  const pct = Number.parseFloat(value)
  if (Number.isNaN(pct)) return value
  return STRETCH.reduce((best, s) => (Math.abs(s[0] - pct) < Math.abs(best[0] - pct) ? s : best))[1]
}

export interface LineState {
  opacity: number
  blur: number
  stretch: number
  bend: number
  tiltX: number
  tiltY: number
  z: number
  /** Offsets added to wherever the line is placed. */
  dx: number
  dy: number
}

export class Line {
  readonly mesh: Mesh
  readonly state: LineState = {
    opacity: 1,
    blur: 0,
    stretch: 1,
    bend: 0,
    tiltX: 0,
    tiltY: 0,
    z: 0,
    dx: 0,
    dy: 0,
  }
  /** When set, the line is placed here instead of following its DOM element. */
  manual: { x: number; y: number } | null = null
  readonly #canvas = document.createElement('canvas')
  readonly #ctx = this.#canvas.getContext('2d') as CanvasRenderingContext2D
  readonly #texture = new CanvasTexture(this.#canvas)
  readonly #material: ShaderMaterial
  #drawn = ''
  #pad = 0

  constructor(readonly el: HTMLElement) {
    this.#texture.minFilter = LinearFilter
    this.#texture.generateMipmaps = false
    this.#texture.colorSpace = SRGBColorSpace
    this.#material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      uniforms: {
        uTex: { value: this.#texture },
        uSize: { value: [1, 1] },
        uCenter: { value: [0, 0] },
        uView: { value: [1, 1] },
        uTiltX: { value: 0 },
        uTiltY: { value: 0 },
        uZ: { value: 0 },
        uStretch: { value: 1 },
        uBend: { value: 0 },
        uOpacity: { value: 1 },
        uBlur: { value: 0 },
        uTexel: { value: [0, 0] },
      },
    })
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.#material)
    this.mesh.frustumCulled = false
  }

  update(viewW: number, viewH: number, dpr: number) {
    const text = this.el.textContent ?? ''
    if (text !== this.#drawn) this.#paint(text, dpr)
    const u = this.#material.uniforms as Record<string, { value: unknown }>
    let cx: number
    let cy: number
    if (this.manual) {
      cx = this.manual.x
      cy = this.manual.y
    } else {
      const r = this.el.getBoundingClientRect()
      cx = r.left + r.width / 2
      cy = r.top + r.height / 2
    }
    const s = this.state
    ;(u.uCenter as { value: number[] }).value = [cx + s.dx, cy + s.dy]
    ;(u.uView as { value: number[] }).value = [viewW, viewH]
    ;(u.uSize as { value: number[] }).value = [this.#canvas.width / dpr, this.#canvas.height / dpr]
    ;(u.uTexel as { value: number[] }).value = [1 / this.#canvas.width, 1 / this.#canvas.height]
    ;(u.uTiltX as { value: number }).value = s.tiltX
    ;(u.uTiltY as { value: number }).value = s.tiltY
    ;(u.uZ as { value: number }).value = s.z
    ;(u.uStretch as { value: number }).value = s.stretch
    ;(u.uBend as { value: number }).value = s.bend
    ;(u.uOpacity as { value: number }).value = s.opacity
    ;(u.uBlur as { value: number }).value = s.blur
    this.mesh.visible = s.opacity > 0.003
  }

  #paint(raw: string, dpr: number) {
    this.#drawn = raw
    const cs = getComputedStyle(this.el)
    // The canvas knows nothing of CSS text-transform.
    const text = cs.textTransform === 'uppercase' ? raw.toUpperCase() : raw
    const size = Number.parseFloat(cs.fontSize)
    const font = `${cs.fontStyle} ${cs.fontWeight} ${stretchKeyword(cs.fontStretch)} ${size}px ${cs.fontFamily}`
    const ctx = this.#ctx
    ctx.font = font
    ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing
    this.#pad = Math.ceil(size * 0.6)
    const w = Math.ceil(ctx.measureText(text).width + this.#pad * 2)
    const h = Math.ceil(size * 1.35 + this.#pad * 2)
    this.#canvas.width = Math.max(2, w * dpr)
    this.#canvas.height = Math.max(2, h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = font
    ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing
    ctx.textBaseline = 'middle'
    ctx.clearRect(0, 0, w, h)
    // Two soft halos under a crisp face: the light is cool, never white-hot.
    ctx.fillStyle = 'rgba(214, 230, 248, 0.9)'
    ctx.shadowColor = 'rgba(150, 190, 240, 0.55)'
    ctx.shadowBlur = size * 0.55
    ctx.fillText(text, this.#pad, h / 2 + size * 0.04)
    ctx.shadowColor = 'rgba(220, 235, 255, 0.5)'
    ctx.shadowBlur = size * 0.16
    ctx.fillText(text, this.#pad, h / 2 + size * 0.04)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#eef4fb'
    ctx.fillText(text, this.#pad, h / 2 + size * 0.04)
    this.#texture.dispose()
    this.#texture.image = this.#canvas
    this.#texture.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.#material.dispose()
    this.#texture.dispose()
  }
}

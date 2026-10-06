import * as THREE from 'three';
import { DRESSING } from '../config/dressing';
import { DUST_MOTES } from '../config/render';
import { createRng, rngNext } from '../sim/rng';
import { softDotTexture } from './softDot';

/** Wraps `v` into 0..size. */
const wrap = (v: number, size: number): number => v - Math.floor(v / size) * size;

/**
 * Where a mote is drawn on one axis: its home `base` (0..box), moved by the breeze and its wander over `time`, wrapped
 * into the box centred on the camera's `eye`, so motes never run out as you move and none pop near you.
 */
export function motePosition(base: number, moved: number, eye: number, box: number): number {
  return eye + wrap(base + moved - eye + box / 2, box) - box / 2;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * How visible a mote is (0..1): `distance` metres from the camera, `edge` its largest offset along any axis (the box
 * wraps per axis). Gone within DUST_MOTES.fadeNear, full past fadeFar, fading out again before the box's edge.
 */
export function moteFade(distance: number, edge: number): number {
  const D = DUST_MOTES;
  const half = D.box / 2;
  return smoothstep(D.fadeNear, D.fadeFar, distance) * (1 - smoothstep(half - D.edgeFade, half, edge));
}

/**
 * Dust motes drifting in the sunlight round the camera (M14): one draw call of soft points, positions refreshed each
 * frame into a buffer made once. How many show is the quality preset's; reduced motion hides them. Each mote's alpha
 * (moteFade) keeps the ones right by the camera from turning into blurry blobs, and the shader caps the point size.
 */
/** A map's motes' fade with height over the ground (G8, DRESSING.motes): 1 up to `full` m, 0 from `none` m. */
export function moteHeightFade(y: number): number {
  const M = DRESSING.motes;
  return Math.max(0, Math.min(1, (M.none - y) / (M.none - M.full)));
}

export class DustMotes {
  readonly object: THREE.Points;
  private readonly base: Float32Array;
  private readonly phase: Float32Array;
  private readonly positions: Float32Array;
  private readonly attribute: THREE.BufferAttribute;
  /** Per-mote RGBA (white, alpha from moteFade): the material multiplies it in. */
  private readonly alphas: Float32Array;
  private readonly alphaAttribute: THREE.BufferAttribute;
  private readonly sprite: THREE.CanvasTexture;
  private count = 0;
  private time = 0;
  /** The shader's cap on a mote's size in device pixels: DUST_MOTES.maxPixels at the drawing buffer's pixel ratio. */
  private readonly maxSize: { value: number } = { value: DUST_MOTES.maxPixels };
  /** How far the air has carried the motes so far (m, per axis, kept within the box). */
  private readonly drift = { x: 0, y: 0, z: 0 };
  private motionOn = true;
  /** A map's dust (G8, MapDressing.motes): its colour, and the motes thinning out with height. */
  private hangsLow = false;

  /** `max`: the most motes any preset shows (the buffer's size). */
  constructor(private readonly max: number) {
    const D = DUST_MOTES;
    const rng = createRng(D.seed);
    this.base = new Float32Array(max * 3);
    this.phase = new Float32Array(max);
    for (let i = 0; i < max * 3; i++) this.base[i] = rngNext(rng) * D.box;
    for (let i = 0; i < max; i++) this.phase[i] = rngNext(rng) * Math.PI * 2;
    this.positions = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    this.attribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attribute);
    this.alphas = new Float32Array(max * 4).fill(1);
    this.alphaAttribute = new THREE.BufferAttribute(this.alphas, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.alphaAttribute);
    this.sprite = softDotTexture();
    const material = new THREE.PointsMaterial({
      size: D.size,
      map: this.sprite,
      color: D.color,
      transparent: true,
      opacity: D.opacity,
      depthWrite: false,
      sizeAttenuation: true,
      vertexColors: true,
    });
    // Cap the point size: even a faded mote never covers more than a few pixels (at any pixel ratio: setPixelRatio).
    material.onBeforeCompile = (shader) => {
      shader.uniforms.moteMaxSize = this.maxSize;
      shader.vertexShader = `uniform float moteMaxSize;\n${shader.vertexShader}`.replace(
        '#include <logdepthbuf_vertex>',
        'gl_PointSize = min(gl_PointSize, moteMaxSize);\n#include <logdepthbuf_vertex>',
      );
    };
    this.object = new THREE.Points(geo, material);
    this.object.name = 'dustMotes';
    this.object.frustumCulled = false;
    this.setCount(0);
  }

  /** How many motes to show (the quality preset's), at most the buffer's size. */
  setCount(count: number): void {
    this.count = Math.max(0, Math.min(this.max, Math.floor(count)));
    this.object.geometry.setDrawRange(0, this.count);
    this.object.visible = this.count > 0 && this.motionOn;
  }

  /**
   * The drawing buffer's pixel ratio (KNOWN_ISSUES: near motes looked smaller on high-DPI screens): a mote's world size
   * is drawn in device pixels, so the cap is scaled with it and a mote looks the same size at any pixel ratio.
   */
  setPixelRatio(pixelRatio: number): void {
    this.maxSize.value = DUST_MOTES.maxPixels * pixelRatio;
  }

  /** The cap in force, in device pixels. */
  get maxPointSize(): number {
    return this.maxSize.value;
  }

  /** Reduced motion on (false) or off (true): drifting specks are movement on screen, so they go. */
  setMotion(on: boolean): void {
    this.motionOn = on;
    this.setCount(this.count);
  }

  /**
   * A map's own dust (G8, MapDressing.motes; null: the default): the motes take its tint (sRGB) and fade with height
   * over the ground (DRESSING.motes: dust hangs low). The same draw and shader; only a colour and the CPU's alphas.
   */
  setMapDust(tint: number | null): void {
    (this.object.material as THREE.PointsMaterial).color.setHex(tint ?? DUST_MOTES.color);
    this.hangsLow = tint !== null;
  }

  /** Moves the motes on by `dt` round the camera at `eye`, carried by the match's `wind` (m/s; M30): dust rides the air. */
  update(dt: number, eye: { x: number; y: number; z: number }, wind: { x: number; y: number; z: number }): void {
    if (!this.object.visible) return;
    const D = DUST_MOTES;
    this.time += dt;
    const t = this.time;
    const drift = this.drift;
    drift.x = wrap(drift.x + (wind.x * D.windShare + D.breeze.x) * dt, D.box);
    drift.y = wrap(drift.y + (wind.y * D.windShare + D.breeze.y) * dt, D.box);
    drift.z = wrap(drift.z + (wind.z * D.windShare + D.breeze.z) * dt, D.box);
    for (let i = 0; i < this.count; i++) {
      const w = t * D.wanderRate + this.phase[i]!;
      const j = i * 3;
      this.positions[j] = motePosition(this.base[j]!, drift.x + Math.sin(w) * D.wander, eye.x, D.box);
      this.positions[j + 1] = motePosition(this.base[j + 1]!, drift.y + Math.sin(w * 1.3) * D.wander, eye.y, D.box);
      this.positions[j + 2] = motePosition(this.base[j + 2]!, drift.z + Math.cos(w * 0.9) * D.wander, eye.z, D.box);
      const dx = this.positions[j]! - eye.x;
      const dy = this.positions[j + 1]! - eye.y;
      const dz = this.positions[j + 2]! - eye.z;
      const fade = moteFade(Math.hypot(dx, dy, dz), Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)));
      this.alphas[i * 4 + 3] = this.hangsLow ? fade * moteHeightFade(this.positions[j + 1]!) : fade;
    }
    this.attribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.sprite.dispose();
    this.object.removeFromParent();
  }
}

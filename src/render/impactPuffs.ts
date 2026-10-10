import * as THREE from 'three';
import type { PuffConfig } from '../config/render';
import { length3, type Vec3 } from '../sim/vec';
import { GPU_POOLS } from './gpuPools';
import { softDotTexture } from './softDot';

export interface Puff {
  x: number;
  y: number;
  z: number;
  /** Its own velocity (m/s, easing to a stop over its life) on top of the pool's upward drift. */
  vx: number;
  vy: number;
  vz: number;
  /** Size as a share of the pool's radius. */
  scale: number;
  /** Tint over the pool's colour (linear RGB). */
  r: number;
  g: number;
  b: number;
  /** Seconds since spawned; >= lifetime means free. */
  age: number;
}

const NO_VELOCITY: Vec3 = { x: 0, y: 0, z: 0 };
const WHITE = new THREE.Color(0xffffff);

/** A puff's soft dot is drawn this much wider than its radius, so its nearly solid core is about the radius. */
const SOFT_EDGE = 1.4;

/**
 * Soft puffs: BB impact dust, hit puffs on players, a gas pistol's breath at the muzzle. Each is a soft round dot
 * turned to face the camera; it appears at `startScale`, grows fast, then shrinks away while drifting, and can have its own tint, size and
 * push. Pooled (the oldest is reused when all are busy), one draw call per pool, nothing allocated per frame.
 */
export class ImpactPuffs {
  readonly object: THREE.InstancedMesh;
  /** On the node renderer (W5) a compute pass moves the puffs (render/webgpu/compute/): each spawn is handed to it, the loop skipped. */
  declare gpu?: { spawn(slot: number, puff: Puff): void; update(dt: number, camera: THREE.Camera): void } | undefined;
  readonly puffs: Puff[] = [];
  private next = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly rot = new THREE.Quaternion();
  private readonly color = new THREE.Color();
  private readonly sprite = softDotTexture();
  /** Puffs drawn last frame: with none then and none now there is nothing to upload (REN-22). */
  private lastCount = 0;

  constructor(readonly cfg: PuffConfig) {
    for (let i = 0; i < cfg.max; i++) this.puffs.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, scale: 1, r: 1, g: 1, b: 1, age: cfg.lifetime });
    this.object = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(cfg.radius * 2 * SOFT_EDGE, cfg.radius * 2 * SOFT_EDGE),
      new THREE.MeshBasicMaterial({
        color: cfg.color,
        map: this.sprite,
        transparent: true,
        opacity: cfg.opacity,
        depthWrite: false,
      }),
      cfg.max,
    );
    // Every instance gets a colour from the start, so the shader is built once with per-puff tints.
    for (let i = 0; i < cfg.max; i++) this.object.setColorAt(i, WHITE);
    this.object.count = 0;
    this.object.frustumCulled = false;
    GPU_POOLS.set(this.object, this);
  }

  /** A puff at `at`: `tint` multiplies the pool's colour, `scale` its size; `velocity` pushes it, easing off. */
  spawn(at: Vec3, tint: THREE.Color = WHITE, scale = 1, velocity: Vec3 = NO_VELOCITY): void {
    const slot = this.next;
    const p = this.puffs[slot]!;
    this.next = (slot + 1) % this.puffs.length;
    p.x = at.x;
    p.y = at.y;
    p.z = at.z;
    p.vx = velocity.x;
    p.vy = velocity.y;
    p.vz = velocity.z;
    p.scale = scale;
    p.r = tint.r;
    p.g = tint.g;
    p.b = tint.b;
    p.age = 0;
    this.gpu?.spawn(slot, p);
  }

  /** `camera` is the view: puffs face it, and far ones keep a minimum size on screen. */
  update(dt: number, camera: THREE.Camera): void {
    if (this.gpu) return this.gpu.update(dt, camera);
    const P = this.cfg;
    let count = 0;
    const minScale = P.minAngularRadius / P.radius;
    const eye = camera.position;
    this.rot.copy(camera.quaternion);
    for (const p of this.puffs) {
      if (p.age >= P.lifetime) continue;
      p.age += dt;
      const t = p.age;
      const grow = P.startScale + (1 - P.startScale) * Math.min(1, t / P.growTime);
      const fade = 1 - Math.max(0, (t - P.growTime) / (P.lifetime - P.growTime));
      const dist = length3(p.x - eye.x, p.y - eye.y, p.z - eye.z);
      const s = Math.max(0, grow * fade) * Math.max(p.scale, dist * minScale);
      // The push eases off over the puff's life: distance covered is v·t·(1 - t / 2·lifetime).
      const pushed = Math.min(t, P.lifetime) * (1 - Math.min(t, P.lifetime) / (2 * P.lifetime));
      this.pos.set(p.x + p.vx * pushed, p.y + p.vy * pushed + t * P.drift, p.z + p.vz * pushed);
      this.scale.setScalar(s);
      this.matrix.compose(this.pos, this.rot, this.scale);
      this.object.setMatrixAt(count, this.matrix);
      this.object.setColorAt(count++, this.color.setRGB(p.r, p.g, p.b));
    }
    this.object.count = count;
    // Nothing alive now or last frame: the buffers already say so (REN-22).
    if (count > 0 || this.lastCount > 0) {
      this.object.instanceMatrix.needsUpdate = true;
      if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true;
    }
    this.lastCount = count;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.sprite.dispose();
    this.object.dispose();
    this.object.removeFromParent();
  }
}

import * as THREE from 'three';
import { IMPACT_GRIT } from '../config/render';
import { createRng, rngNext } from '../sim/rng';
import type { Vec3 } from '../sim/vec';

interface Chip {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  roll: number;
  spin: number;
  r: number;
  g: number;
  b: number;
  /** Seconds since thrown; >= lifetime means free. */
  age: number;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * Impact grit (FA8, QualitySettings.impactGrit): a BB landing throws a few chips of the surface it hit (IMPACT_GRIT),
 * small spinning squares in the dust's tint that fly out towards the side it came from and fall. Pooled, one draw call,
 * nothing allocated per frame; the throws come from a seeded generator (presentation only, never the simulation's).
 */
export class ImpactGrit {
  readonly object: THREE.InstancedMesh;
  private readonly chips: Chip[] = [];
  private next = 0;
  private enabled = false;
  private lastCount = 0;
  private readonly rng = createRng(IMPACT_GRIT.seed);
  private readonly matrix = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rot = new THREE.Quaternion();
  private readonly roll = new THREE.Quaternion();
  private readonly color = new THREE.Color();

  constructor() {
    const G = IMPACT_GRIT;
    for (let i = 0; i < G.max; i++) this.chips.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, roll: 0, spin: 0, r: 1, g: 1, b: 1, age: G.lifetime });
    this.object = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), G.max);
    for (let i = 0; i < G.max; i++) this.object.setColorAt(i, this.color.setRGB(1, 1, 1));
    this.object.count = 0;
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** Grit on or off (off: nothing thrown, and what is in the air is gone). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.object.visible = on;
    if (on) return;
    for (const c of this.chips) c.age = IMPACT_GRIT.lifetime;
    this.object.count = 0;
  }

  get active(): boolean {
    return this.enabled;
  }

  /** A BB landed at `at`: chips in `tint` (linear), thrown towards `eye` (the side the BB came from) and up. */
  spawn(at: Vec3, tint: THREE.Color, eye: Vec3): void {
    if (!this.enabled) return;
    const G = IMPACT_GRIT;
    let tx = eye.x - at.x;
    let ty = eye.y - at.y;
    let tz = eye.z - at.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    tx /= len;
    ty /= len;
    tz /= len;
    const n = G.perImpact[0] + Math.floor(rngNext(this.rng) * (G.perImpact[1] - G.perImpact[0] + 1));
    for (let i = 0; i < n; i++) {
      const c = this.chips[this.next]!;
      this.next = (this.next + 1) % this.chips.length;
      // A random direction, leaning towards the eye's side and up.
      const u = rngNext(this.rng) * 2 - 1;
      const a = rngNext(this.rng) * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      let dx = s * Math.cos(a) + tx * G.toward;
      let dy = u + ty * G.toward + G.up;
      let dz = s * Math.sin(a) + tz * G.toward;
      const dl = Math.hypot(dx, dy, dz) || 1;
      const speed = G.speed[0] + rngNext(this.rng) * (G.speed[1] - G.speed[0]);
      dx = (dx / dl) * speed;
      dy = (dy / dl) * speed;
      dz = (dz / dl) * speed;
      c.x = at.x;
      c.y = at.y;
      c.z = at.z;
      c.vx = dx;
      c.vy = dy;
      c.vz = dz;
      c.size = G.size[0] + rngNext(this.rng) * (G.size[1] - G.size[0]);
      c.roll = rngNext(this.rng) * Math.PI * 2;
      c.spin = (rngNext(this.rng) * 2 - 1) * G.spin;
      c.r = tint.r * G.shade;
      c.g = tint.g * G.shade;
      c.b = tint.b * G.shade;
      c.age = 0;
    }
  }

  /** Moves the chips on by `dt` and faces them to `camera`. */
  update(dt: number, camera: THREE.Camera): void {
    if (!this.enabled) return;
    const G = IMPACT_GRIT;
    const eye = camera.position;
    let count = 0;
    for (const c of this.chips) {
      if (c.age >= G.lifetime) continue;
      c.age += dt;
      c.vy -= G.gravity * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.roll += c.spin * dt;
      const dist = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z);
      const fade = 1 - Math.max(0, c.age / G.lifetime) ** 2;
      this.scale.setScalar(Math.max(c.size, dist * G.minAngularSize) * fade);
      this.rot.copy(camera.quaternion).multiply(this.roll.setFromAxisAngle(Z_AXIS, c.roll));
      this.matrix.compose(this.pos.set(c.x, c.y, c.z), this.rot, this.scale);
      this.object.setMatrixAt(count, this.matrix);
      this.object.setColorAt(count++, this.color.setRGB(c.r, c.g, c.b));
    }
    this.object.count = count;
    if (count > 0 || this.lastCount > 0) {
      this.object.instanceMatrix.needsUpdate = true;
      if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true;
    }
    this.lastCount = count;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.dispose();
    this.object.removeFromParent();
  }
}

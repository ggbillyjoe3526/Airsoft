import * as THREE from 'three';
import { LEAF_FLECKS } from '../config/render';
import { createRng, rngNext } from '../sim/rng';
import { length3, type Vec3 } from '../sim/vec';

interface Fleck {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** The level way it sways, and how far through its sway it is (radians) and how fast that goes (radians a second). */
  swayX: number;
  swayZ: number;
  swayPhase: number;
  swayRate: number;
  size: number;
  /** Its turn in the view's plane, and how far it has turned over (its width shrinks and grows as it does). */
  roll: number;
  flip: number;
  spin: number;
  r: number;
  g: number;
  b: number;
  /** Seconds since knocked out; >= lifetime means free. */
  age: number;
  /** The ground it settles on (BP5: they fell on through it), -Infinity for none known. */
  floor: number;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * Leaves knocked out of a bush by a BB (Dev 6 item 44; LEAF_FLECKS): a few small green leaves that pop out towards the
 * side the BB came from, then drift down, swaying and turning over, and fade. At every quality, since they show where a
 * BB went into the leaves. Pooled, one draw call, nothing allocated per frame; the throws come from a seeded generator
 * (presentation only, never the simulation's).
 */
export class LeafFlecks {
  readonly object: THREE.InstancedMesh;
  private readonly flecks: Fleck[] = [];
  private readonly colours: readonly THREE.Color[];
  private next = 0;
  private lastCount = 0;
  /** Leaves were knocked out since the last update (so an idle pool skips its loop). */
  private fresh = false;
  private readonly rng = createRng(LEAF_FLECKS.seed);
  private readonly matrix = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rot = new THREE.Quaternion();
  private readonly roll = new THREE.Quaternion();
  private readonly color = new THREE.Color();

  constructor() {
    const L = LEAF_FLECKS;
    for (let i = 0; i < L.max; i++) {
      this.flecks.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, swayX: 1, swayZ: 0, swayPhase: 0, swayRate: 0, size: 0, roll: 0, flip: 0, spin: 0, r: 1, g: 1, b: 1, age: L.lifetime, floor: Number.NEGATIVE_INFINITY });
    }
    this.colours = L.colours.map((c) => new THREE.Color().setHex(c, THREE.SRGBColorSpace));
    // A diamond, a leaf's outline at this size: a four-sided disc, stretched along its length when drawn.
    this.object = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 4), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), L.max);
    for (let i = 0; i < L.max; i++) this.object.setColorAt(i, this.color.setRGB(1, 1, 1));
    this.object.count = 0;
    this.object.frustumCulled = false;
  }

  /** How many are in the air (for tests and the debug overlay). */
  get live(): number {
    return this.lastCount;
  }

  /**
   * A BB went into the leaves at `at`: a few leaves (`count`: LEAF_FLECKS.perStop for a BB they stopped, perBrush for one
   * through an edge) thrown out towards `from` (the side it came from: impactGrit.ts impactSide) and up, coming to rest on
   * `floor` (the ground under the bush: map/foliage.ts leafFloor) if they get that far down.
   */
  spawn(at: Vec3, from: Vec3, count: readonly [number, number], floor = Number.NEGATIVE_INFINITY): void {
    const L = LEAF_FLECKS;
    let tx = from.x - at.x;
    let ty = from.y - at.y;
    let tz = from.z - at.z;
    const len = length3(tx, ty, tz) || 1;
    tx /= len;
    ty /= len;
    tz /= len;
    const n = count[0] + Math.floor(rngNext(this.rng) * (count[1] - count[0] + 1));
    for (let i = 0; i < n; i++) {
      const f = this.flecks[this.next]!;
      this.next = (this.next + 1) % this.flecks.length;
      const u = rngNext(this.rng) * 2 - 1;
      const a = rngNext(this.rng) * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      let dx = s * Math.cos(a) + tx * L.toward;
      let dy = u + ty * L.toward + L.up;
      let dz = s * Math.sin(a) + tz * L.toward;
      const dl = length3(dx, dy, dz) || 1;
      const speed = L.speed[0] + rngNext(this.rng) * (L.speed[1] - L.speed[0]);
      f.vx = (dx / dl) * speed;
      f.vy = (dy / dl) * speed;
      f.vz = (dz / dl) * speed;
      f.x = at.x;
      f.y = at.y;
      f.z = at.z;
      const sway = rngNext(this.rng) * Math.PI * 2;
      f.swayX = Math.cos(sway);
      f.swayZ = Math.sin(sway);
      f.swayPhase = rngNext(this.rng) * Math.PI * 2;
      f.swayRate = (Math.PI * 2) / (L.swayPeriod[0] + rngNext(this.rng) * (L.swayPeriod[1] - L.swayPeriod[0]));
      f.size = L.size[0] + rngNext(this.rng) * (L.size[1] - L.size[0]);
      f.roll = rngNext(this.rng) * Math.PI * 2;
      f.flip = rngNext(this.rng) * Math.PI;
      f.spin = (rngNext(this.rng) * 2 - 1) * L.spin;
      const c = this.colours[Math.floor(rngNext(this.rng) * this.colours.length)]!;
      const dark = 1 - L.shade * rngNext(this.rng);
      f.r = c.r * dark;
      f.g = c.g * dark;
      f.b = c.b * dark;
      f.age = 0;
      f.floor = floor;
    }
    if (n > 0) this.fresh = true;
  }

  /** Moves the leaves on by `dt` and faces them to `camera`. */
  update(dt: number, camera: THREE.Camera): void {
    if (this.lastCount === 0 && !this.fresh) return;
    this.fresh = false;
    const L = LEAF_FLECKS;
    const eye = camera.position;
    const keep = Math.exp(-L.drag * dt);
    let count = 0;
    for (const f of this.flecks) {
      if (f.age >= L.lifetime) continue;
      f.age += dt;
      f.vx *= keep;
      f.vy = f.vy * keep - L.gravity * dt;
      f.vz *= keep;
      f.swayPhase += f.swayRate * dt;
      const sway = Math.sin(f.swayPhase) * L.sway * dt;
      f.x += f.vx * dt + f.swayX * sway;
      f.y += f.vy * dt;
      f.z += f.vz * dt + f.swayZ * sway;
      f.roll += f.spin * dt;
      f.flip += f.spin * dt;
      // Down on the ground: it lies there, still, for the rest of its fade.
      if (f.y < f.floor) {
        f.y = f.floor;
        f.vx = f.vy = f.vz = 0;
        f.swayX = f.swayZ = f.spin = 0;
      }
      const left = L.lifetime - f.age;
      const fade = left < L.fade ? Math.max(0, left / L.fade) : 1;
      const dist = length3(f.x - eye.x, f.y - eye.y, f.z - eye.z);
      const size = Math.max(f.size, dist * L.minAngularSize) * fade;
      // Long and narrow, its width breathing as it turns over.
      this.scale.set(size * (0.3 + 0.7 * Math.abs(Math.cos(f.flip))) * 0.6, size, 1);
      this.rot.copy(camera.quaternion).multiply(this.roll.setFromAxisAngle(Z_AXIS, f.roll));
      this.matrix.compose(this.pos.set(f.x, f.y, f.z), this.rot, this.scale);
      this.object.setMatrixAt(count, this.matrix);
      this.object.setColorAt(count++, this.color.setRGB(f.r, f.g, f.b));
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

import * as THREE from 'three';
import type { ComputeNode, WebGPURenderer } from 'three/webgpu';
import { Fn, If, instancedArray, instanceIndex, materialColor, materialOpacity, select, uniform, varying, vec3, vec4 } from 'three/tsl';
import type { DustMotes } from '../../dustMotes';
import type { Fireflies } from '../../fireflies';
import type { Chip, ImpactGrit } from '../../impactGrit';
import type { ImpactPuffs, Puff } from '../../impactPuffs';
import type { SmokePlumes } from '../../smokePlumes';
import { IMPACT_GRIT } from '../../../config/render';
import { makeTwin, type PointTwin } from '../pointSprites';
import { freeBuffer, xyz } from './computeKit';
import { type Node, tslOps } from './kernelOps';
import { fireflyKernel, gritScale, gritStep, moteKernel, plumeKernel, puffKernel } from './particleKernels';
import { basicTwin, type Facing, facing, facingCorner, hangUnder, quads } from './particleDraws';

/**
 * The particles on the node path, moved by compute passes (WebGPU overhaul W5): the dust motes, the fireflies, the
 * chimney smoke and vent steam, every pool of soft puffs (impacts, hits, gas, the impact rings, kicked dust) and the
 * impact grit. Each CPU module tags its object (`userData.gpuMotes` and so on); `scan` gives each a driver that the
 * module's `update` hands the frame to (its `gpu`), so the CPU's per-particle loop never runs on this path. What a
 * module keeps on the CPU is what is not per particle: its seeded arrays (uploaded once), its clock, the air, and the
 * spawns, which go into a small storage buffer as they happen. The drivers' passes are dispatched together, once a
 * frame before the draws (`frame`), and only where something moved; a pool with nothing alive draws and dispatches
 * nothing. Each kernel is written once (particleKernels.ts) and pinned against its CPU module by the unit tests.
 *
 * Both back ends run the same passes: on WebGPU as compute shaders, on Three's WebGL2 back end as transform feedback
 * (each pass writes only its own particle's element, which is what that back end can do: no atomics, no scattered
 * writes), with every buffer read in the vertex stage, where that back end can read it (W3: no storage buffers in a
 * pixel shader).
 */

/** One CPU module's GPU driver. */
interface Driver {
  /** Once a frame before the draws: the pass to dispatch this frame, or null when nothing moved. */
  frame(): ComputeNode | null;
  dispose(): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- the drivers hang on the modules' untyped userData */
type Owner = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export class ParticleTwins {
  private readonly drivers = new Map<object, Driver>();
  /** This frame's passes, reused: nothing allocated per frame. */
  private readonly batch: ComputeNode[] = [];
  private dirty = true;

  constructor(private readonly renderer: WebGPURenderer) {}

  /** Whether a Points is drawn by a driver here (pointSprites.ts leaves it alone). */
  readonly claims = (points: THREE.Object3D): boolean => points.userData.gpuMotes !== undefined || points.userData.gpuFireflies !== undefined;

  /** The scene changed: the next `scan` looks for new pools. */
  rescan(): void {
    this.dirty = true;
  }

  /** After a rescan, gives every new pool in `scene` its driver. */
  scan(scene: THREE.Object3D): void {
    if (!this.dirty) return;
    this.dirty = false;
    scene.traverse(this.visit);
  }

  /** Once a frame before the draws: every pass that has something to move, in one dispatch. */
  frame(): void {
    const batch = this.batch;
    batch.length = 0;
    for (const driver of this.drivers.values()) {
      const pass = driver.frame();
      if (pass) batch.push(pass);
    }
    if (batch.length > 0) void this.renderer.compute(batch);
  }

  /** How many pools have a driver (tests, the debug checks). */
  get count(): number {
    return this.drivers.size;
  }

  /** Every driver gone: the modules draw and move themselves again (WebGL taking over after a lost device). */
  dispose(): void {
    for (const driver of this.drivers.values()) driver.dispose();
    this.drivers.clear();
  }

  private readonly visit = (o: THREE.Object3D): void => {
    const u = o.userData;
    const owner: Owner = u.gpuMotes ?? u.gpuFireflies ?? u.gpuPlumes ?? u.gpuPuffs ?? u.gpuGrit;
    if (!owner || this.drivers.has(owner)) return;
    const gone = (): void => this.drop(owner);
    const r = this.renderer;
    const driver = u.gpuMotes ? new MotesDriver(r, owner, gone) : u.gpuFireflies ? new FirefliesDriver(r, owner, gone) : u.gpuPlumes ? new PlumesDriver(r, owner, gone) : u.gpuPuffs ? new PuffsDriver(r, owner, gone) : new GritDriver(r, owner, gone);
    this.drivers.set(owner, driver);
  };

  private drop(owner: object): void {
    this.drivers.get(owner)?.dispose();
    this.drivers.delete(owner);
  }
}

/** Calls `gone` once when `material` (the CPU pool's, freed with it) is disposed; returns how to stop listening. */
function onFreed(material: THREE.Material, gone: () => void): () => void {
  material.addEventListener('dispose', gone);
  return () => material.removeEventListener('dispose', gone);
}

/** Four floats into `a` at `o` (a spawn's record: no array made per spawn). */
function put(a: Float32Array, o: number, x: number, y: number, z: number, w: number): void {
  a[o] = x;
  a[o + 1] = y;
  a[o + 2] = z;
  a[o + 3] = w;
}

/** A vec4 storage buffer of `count` elements filled from `fill(i, out)` (out: the element's four floats). */
function seeded(count: number, fill: (i: number, out: Float32Array) => void): Node {
  const data = new Float32Array(count * 4);
  const one = new Float32Array(4);
  for (let i = 0; i < count; i++) {
    one.fill(0);
    fill(i, one);
    data.set(one, i * 4);
  }
  return instancedArray(data, 'vec4');
}

/**
 * The dust motes (dustMotes.ts): a pass writes each mote's place and alpha from its seeded home and phase, the module's
 * clock and the air, round the eye; the sized points' sprite twin draws them (pointSprites.ts, its source the pass).
 */
class MotesDriver implements Driver {
  private readonly drawn: Node;
  private readonly time = uniform(0);
  private readonly drift = uniform(new THREE.Vector3());
  private readonly eye = uniform(new THREE.Vector3());
  private readonly hangsLow = uniform(0);
  private readonly pass: ComputeNode;
  private readonly seeds: Node;
  private readonly twin: PointTwin;
  private moved = false;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly owner: DustMotes,
    gone: () => void,
  ) {
    const n = owner.phase.length;
    this.seeds = seeded(n, (i, o) => o.set([owner.base[i * 3]!, owner.base[i * 3 + 1]!, owner.base[i * 3 + 2]!, owner.phase[i]!]));
    this.drawn = instancedArray(n, 'vec4');
    const { seeds, drawn } = this;
    this.pass = Fn(() => {
      const s = seeds.element(instanceIndex);
      const k = moteKernel(tslOps, xyz(s), s.w, this.time, xyz(this.drift), xyz(this.eye), this.hangsLow);
      drawn.element(instanceIndex).assign(vec4(k.x, k.y, k.z, k.w));
    })().compute(n) as ComputeNode;
    const d = drawn.element(instanceIndex);
    this.twin = makeTwin(owner.object, 'motes', gone, { centre: vec3(d.x, d.y, d.z), alpha: varying(d.w) });
    owner.gpu = this;
  }

  update(eye: { x: number; y: number; z: number }): void {
    const o = this.owner;
    this.time.value = o.time;
    this.drift.value.set(o.drift.x, o.drift.y, o.drift.z);
    this.eye.value.set(eye.x, eye.y, eye.z);
    this.hangsLow.value = o.hangsLow ? 1 : 0;
    this.moved = true;
  }

  frame(): ComputeNode | null {
    if (!this.moved) return null;
    this.moved = false;
    return this.pass;
  }

  dispose(): void {
    this.owner.gpu = undefined;
    this.twin.dispose();
    this.pass.dispose();
    freeBuffer(this.renderer, this.seeds.value);
    freeBuffer(this.renderer, this.drawn.value);
  }
}

/** The fireflies (fireflies.ts): a pass writes each fly's place and pulse; at rest under Reduced motion. */
class FirefliesDriver implements Driver {
  private readonly drawn: Node;
  private readonly seeds: Node;
  private readonly drifts: Node;
  private readonly time = uniform(0);
  private readonly still = uniform(0);
  private readonly pass: ComputeNode;
  private readonly twin: PointTwin;
  private moved = true;
  private motion = true;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly owner: Fireflies,
    gone: () => void,
  ) {
    const n = owner.phase.length;
    this.seeds = seeded(n, (i, o) => o.set([owner.base[i * 3]!, owner.base[i * 3 + 1]!, owner.base[i * 3 + 2]!, owner.phase[i]!]));
    this.drifts = seeded(n, (i, o) => o.set([owner.drift[i * 3]!, owner.drift[i * 3 + 1]!, owner.drift[i * 3 + 2]!, owner.rate[i]!]));
    this.drawn = instancedArray(n, 'vec4');
    const { seeds, drifts, drawn } = this;
    this.pass = Fn(() => {
      const s = seeds.element(instanceIndex);
      const d = drifts.element(instanceIndex);
      const k = fireflyKernel(tslOps, xyz(s), xyz(d), d.w, s.w, this.time, this.still);
      drawn.element(instanceIndex).assign(vec4(k.x, k.y, k.z, k.w));
    })().compute(n) as ComputeNode;
    const d = drawn.element(instanceIndex);
    this.twin = makeTwin(owner.object, 'fireflies', gone, { centre: vec3(d.x, d.y, d.z), alpha: d.w });
    owner.gpu = this;
  }

  update(): void {
    this.time.value = this.owner.time;
    this.moved = true;
  }

  frame(): ComputeNode | null {
    // Reduced motion turned on or off: one pass to stand them at home at full glow (or let them go again).
    const motion = this.owner.motion;
    if (motion !== this.motion) {
      this.motion = motion;
      this.still.value = motion ? 0 : 1;
      this.moved = true;
    }
    if (!this.moved) return null;
    this.moved = false;
    return this.pass;
  }

  dispose(): void {
    this.owner.gpu = undefined;
    this.twin.dispose();
    this.pass.dispose();
    for (const b of [this.seeds, this.drifts, this.drawn]) freeBuffer(this.renderer, b.value);
  }
}

/** The chimney smoke and vent steam (smokePlumes.ts): a pass writes each puff's place, size and fade. */
class PlumesDriver implements Driver {
  private readonly drawn: Node;
  private readonly fades: Node;
  private readonly seeds: Node;
  private readonly jitters: Node;
  private readonly time = uniform(0);
  private readonly wind = uniform(new THREE.Vector2());
  private readonly face: Facing = facing();
  private readonly pass: ComputeNode;
  private readonly mesh: THREE.Mesh;
  private readonly unhang: () => void;
  private readonly unlisten: () => void;
  private moved = false;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly owner: SmokePlumes,
    gone: () => void,
  ) {
    const M = owner.M;
    const n = owner.sources.length * M.puffs;
    this.seeds = seeded(n, (i, o) => {
      const s = owner.sources[Math.floor(i / M.puffs)]!;
      o.set([s.x, s.y, s.z, s.radius]);
    });
    this.jitters = seeded(n, (i, o) => o.set([owner.jitter[i * 3]!, owner.jitter[i * 3 + 1]!, owner.jitter[i * 3 + 2]!, (i % M.puffs) / M.puffs]));
    this.drawn = instancedArray(n, 'vec4');
    this.fades = instancedArray(n, 'float');
    const { seeds, jitters, drawn, fades } = this;
    this.pass = Fn(() => {
      const s = seeds.element(instanceIndex);
      const j = jitters.element(instanceIndex);
      const k = plumeKernel(tslOps, M, xyz(s), s.w, xyz(j), j.w, this.time, { x: this.wind.x, z: this.wind.y });
      drawn.element(instanceIndex).assign(vec4(k.x, k.y, k.z, k.w));
      fades.element(instanceIndex).assign(k.alpha);
    })().compute(n) as ComputeNode;
    const plain = owner.object.material as THREE.MeshBasicMaterial;
    const material = basicTwin(plain);
    const d = drawn.element(instanceIndex);
    material.positionNode = facingCorner(this.face, vec3(d.x, d.y, d.z), d.w);
    material.opacityNode = materialOpacity.mul(varying(fades.element(instanceIndex)));
    this.mesh = new THREE.Mesh(quads(owner.object.geometry, n), material);
    this.unhang = hangUnder(owner.object, this.mesh);
    // Culled as the plume pool is: its sphere round every plume, as far as the wind bends them.
    this.mesh.frustumCulled = true;
    this.mesh.geometry.boundingSphere = owner.object.boundingSphere?.clone() ?? null;
    this.unlisten = onFreed(plain, gone);
    owner.gpu = this;
  }

  update(): void {
    const o = this.owner;
    this.time.value = o.time;
    this.wind.value.set(o.wind.x, o.wind.z);
    this.moved = true;
  }

  frame(): ComputeNode | null {
    if (!this.moved) return null;
    this.moved = false;
    return this.pass;
  }

  dispose(): void {
    this.owner.gpu = undefined;
    this.unlisten();
    this.unhang();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.pass.dispose();
    for (const b of [this.seeds, this.jitters, this.drawn, this.fades]) freeBuffer(this.renderer, b.value);
  }
}

/**
 * A pool's spawns on the GPU (puffs and grit): each slot's record in storage buffers the CPU writes as spawns happen
 * (sent in the next frame's dispatch), and the pool's own clock, so a slot's age is the clock less its birth. The clock
 * goes back to 0 whenever nothing is alive, so it never grows past a few seconds' worth of float precision.
 */
abstract class SpawnDriver implements Driver {
  protected readonly clock = uniform(0);
  protected readonly births: Float64Array;
  protected readonly face: Facing = facing();
  protected readonly eye = uniform(new THREE.Vector3());
  protected readonly mesh: THREE.Mesh;
  private readonly unhang: () => void;
  private readonly unlisten: () => void;
  protected now = 0;
  protected alive = 0;
  private sent = true;
  protected moved = false;

  protected constructor(
    protected readonly renderer: WebGPURenderer,
    object: THREE.InstancedMesh,
    slots: number,
    protected readonly lifetime: number,
    material: THREE.Material,
    gone: () => void,
  ) {
    this.births = new Float64Array(slots).fill(-1e9);
    this.mesh = new THREE.Mesh(quads(object.geometry, 0), material);
    this.unhang = hangUnder(object, this.mesh);
    this.unlisten = onFreed(object.material as THREE.Material, gone);
  }

  /** The storage buffers the CPU writes (sent again in the frame after a spawn). */
  protected abstract readonly records: readonly Node[];
  /** The pool's pass. */
  protected abstract readonly pass: ComputeNode;

  /** A spawn: slot `slot` is born now. */
  protected born(slot: number): void {
    this.births[slot] = this.now;
    this.sent = false;
  }

  /** The frame's clock and eye; how many slots are alive (each slot's age, one compare: no per-particle maths). */
  protected tick(dt: number, camera: THREE.Camera): number {
    this.now += dt;
    let alive = 0;
    for (let i = 0; i < this.births.length; i++) if (this.now - this.births[i]! - dt < this.lifetime) alive++;
    if (alive === 0 && this.alive === 0 && this.now > this.lifetime) this.rebase();
    this.alive = alive;
    this.clock.value = this.now;
    const p = camera.position;
    this.eye.value.set(p.x, p.y, p.z);
    (this.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = alive > 0 ? this.births.length : 0;
    this.moved = alive > 0;
    return alive;
  }

  frame(): ComputeNode | null {
    if (!this.moved) return null;
    this.moved = false;
    if (!this.sent) {
      this.sent = true;
      for (const r of this.records) r.value.needsUpdate = true;
    }
    return this.pass;
  }

  /** The clock back to 0, every birth moved with it (nothing is alive, so no age changes). */
  private rebase(): void {
    for (let i = 0; i < this.births.length; i++) this.births[i] = -1e9;
    this.now = 0;
  }

  /** Writes a slot's birth into its record (the w of the first vec4). */
  protected writeBirth(record: Float32Array, slot: number): void {
    record[slot * 4 + 3] = this.births[slot]!;
  }

  dispose(): void {
    this.unlisten();
    this.unhang();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.pass.dispose();
  }
}

/** A pool of soft puffs (impactPuffs.ts): a pass writes each puff's place and size from its spawn and age. */
class PuffsDriver extends SpawnDriver {
  private readonly where: Node;
  private readonly push: Node;
  private readonly tint: Node;
  private readonly drawn: Node;
  protected readonly pass: ComputeNode;
  protected readonly records: readonly Node[];

  constructor(renderer: WebGPURenderer, private readonly owner: ImpactPuffs, gone: () => void) {
    const P = owner.cfg;
    const n = P.max;
    super(renderer, owner.object, n, P.lifetime, basicTwin(owner.object.material as THREE.MeshBasicMaterial), gone);
    this.where = instancedArray(new Float32Array(n * 4).fill(-1e9), 'vec4');
    this.push = instancedArray(n, 'vec4');
    this.tint = instancedArray(n, 'vec4');
    this.drawn = instancedArray(n, 'vec4');
    this.records = [this.where, this.push, this.tint];
    const { where, push, drawn, tint } = this;
    this.pass = Fn(() => {
      const w = where.element(instanceIndex);
      const v = push.element(instanceIndex);
      const k = puffKernel(tslOps, P, xyz(w), xyz(v), v.w, this.clock.sub(w.w), xyz(this.eye));
      drawn.element(instanceIndex).assign(vec4(k.x, k.y, k.z, k.w));
    })().compute(n) as ComputeNode;
    const d = drawn.element(instanceIndex);
    const material = this.mesh.material as THREE.MeshBasicMaterial & { positionNode: Node; colorNode: Node };
    material.positionNode = facingCorner(this.face, vec3(d.x, d.y, d.z), d.w);
    material.colorNode = materialColor.mul(vec4(varying(tint.element(instanceIndex).xyz) as Node, 1));
    // Spawned before the driver came: those carry on (the rest of their life) from here.
    owner.puffs.forEach((p, i) => p.age < P.lifetime && this.spawn(i, p));
    owner.gpu = this;
  }

  spawn(slot: number, p: Puff): void {
    this.born(slot);
    const o = slot * 4;
    const where = this.where.value.array as Float32Array;
    put(where, o, p.x, p.y, p.z, 0);
    this.writeBirth(where, slot);
    put(this.push.value.array as Float32Array, o, p.vx, p.vy, p.vz, p.scale);
    put(this.tint.value.array as Float32Array, o, p.r, p.g, p.b, 1);
  }

  update(dt: number, camera: THREE.Camera): void {
    // The pool's object counts what is drawn, as the CPU loop leaves it (kicked dust shows while it is above 0).
    this.owner.object.count = this.tick(dt, camera);
  }

  override dispose(): void {
    this.owner.gpu = undefined;
    // What the GPU was moving ends here: the CPU loop takes over with nothing in the air.
    for (const p of this.owner.puffs) p.age = this.owner.cfg.lifetime;
    super.dispose();
    for (const b of [...this.records, this.drawn]) freeBuffer(this.renderer, b.value);
  }
}

/**
 * The impact grit (impactGrit.ts): a pass moves each chip a frame under gravity, as the CPU loop does, from where its
 * throw left it (a chip whose record has a new birth starts again from its throw); the draw sizes and rolls it.
 */
class GritDriver extends SpawnDriver {
  /** Each slot's throw: where (and its birth), how fast (and its spin); its tint and size, and its first roll (the draw's). */
  private readonly thrown: Node;
  private readonly speed: Node;
  private readonly look: Node;
  private readonly start: Node;
  /**
   * Each chip in flight: where (and how far it has rolled since its throw), how fast (and the birth of the throw it is
   * from). The pass touches four buffers, the most the WebGL2 back end's transform feedback writes (it writes back every
   * buffer a pass reads); the tint, size and first roll are the draw's alone.
   */
  private readonly at: Node;
  private readonly flying: Node;
  private readonly dt = uniform(0);
  protected readonly pass: ComputeNode;
  protected readonly records: readonly Node[];

  constructor(renderer: WebGPURenderer, private readonly owner: ImpactGrit, gone: () => void) {
    const G = IMPACT_GRIT;
    const n = G.max;
    super(renderer, owner.object, n, G.lifetime, basicTwin(owner.object.material as THREE.MeshBasicMaterial), gone);
    this.thrown = instancedArray(new Float32Array(n * 4).fill(-1e9), 'vec4');
    this.speed = instancedArray(n, 'vec4');
    this.look = instancedArray(n, 'vec4');
    this.start = instancedArray(n, 'float');
    this.at = instancedArray(n, 'vec4');
    this.flying = instancedArray(n, 'vec4');
    this.records = [this.thrown, this.speed, this.look, this.start];
    const { thrown, speed, at, flying } = this;
    this.pass = Fn(() => {
      const i = instanceIndex;
      const t = thrown.element(i);
      const v = speed.element(i);
      const pos = vec4(at.element(i)).toVar();
      const vel = vec4(flying.element(i)).toVar();
      // A new throw in this slot: it starts from where it was thrown, not yet rolled.
      If(vel.w.notEqual(t.w), () => {
        pos.assign(vec4(t.xyz, 0));
        vel.assign(vec4(v.xyz, t.w));
      });
      // Still in the air before this frame (the CPU skips a chip whose life is over): one step on.
      If(this.clock.sub(t.w).sub(this.dt).lessThan(G.lifetime), () => {
        const k = gritStep(tslOps, { position: xyz(pos), velocity: xyz(vel), roll: pos.w }, v.w, this.dt);
        pos.assign(vec4(k.position.x, k.position.y, k.position.z, k.roll));
        vel.assign(vec4(k.velocity.x, k.velocity.y, k.velocity.z, vel.w));
      });
      at.element(i).assign(pos);
      flying.element(i).assign(vel);
    })().compute(n) as ComputeNode;
    const p = at.element(instanceIndex);
    const l = this.look.element(instanceIndex);
    const age = this.clock.sub(thrown.element(instanceIndex).w);
    const size = select(age.sub(this.dt).lessThan(G.lifetime), gritScale(tslOps, xyz(p), l.w, age, xyz(this.eye)), 0);
    const material = this.mesh.material as THREE.MeshBasicMaterial & { positionNode: Node; colorNode: Node };
    material.positionNode = facingCorner(this.face, vec3(p.x, p.y, p.z), size, this.start.element(instanceIndex).add(p.w));
    material.colorNode = materialColor.mul(vec4(varying(l.xyz) as Node, 1));
    owner.chips.forEach((c, i) => c.age < G.lifetime && this.spawn(i, c));
    owner.gpu = this;
  }

  spawn(slot: number, c: Chip): void {
    this.born(slot);
    const o = slot * 4;
    const thrown = this.thrown.value.array as Float32Array;
    put(thrown, o, c.x, c.y, c.z, 0);
    this.writeBirth(thrown, slot);
    put(this.speed.value.array as Float32Array, o, c.vx, c.vy, c.vz, c.spin);
    put(this.look.value.array as Float32Array, o, c.r, c.g, c.b, c.size);
    (this.start.value.array as Float32Array)[slot] = c.roll;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.dt.value = dt;
    this.owner.object.count = this.tick(dt, camera);
  }

  override dispose(): void {
    this.owner.gpu = undefined;
    for (const c of this.owner.chips) c.age = IMPACT_GRIT.lifetime;
    super.dispose();
    for (const b of [...this.records, this.at, this.flying]) freeBuffer(this.renderer, b.value);
  }
}

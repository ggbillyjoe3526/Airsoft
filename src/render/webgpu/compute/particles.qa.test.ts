import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRESSING, KICKED_DUST } from '../../../config/dressing';
import { DUST_MOTES, GAS_PUFFS, HIT_PUFFS, IMPACT_GRIT, IMPACT_PUFFS, IMPACT_RINGS, type PuffConfig } from '../../../config/render';
import { buildTerrain } from '../../../map/terrain';
import { createBBPool } from '../../../sim/ballistics';
import { BBRenderer } from '../../bbRenderer';
import { DustMotes } from '../../dustMotes';
import { Fireflies } from '../../fireflies';
import { ImpactGrit } from '../../impactGrit';
import { ImpactPuffs } from '../../impactPuffs';
import { SmokePlumes, STEAM_PLUME } from '../../smokePlumes';
import { fakeCanvas, objectsAllocatedByGame } from '../../testSupport';
import { numberOps as o } from './kernelOps';
import { plumeKernel, puffKernel } from './particleKernels';
import { ParticleTwins } from './particleTwins';

/**
 * W5 QA: the particle passes (acceptance 1) beyond particleKernels.test.ts and particleTwins.test.ts: the kernels of the
 * pools that file leaves out (the hit puffs, impact rings, kicked dust and vent steam), what the drivers are fed, a
 * slot that has run its course staying dead after the pool rests, nothing dispatched or made per frame for a pool at
 * rest, and the preset's counts.
 */

beforeEach(() => {
  vi.stubGlobal('document', { createElementNS: () => fakeCanvas(), createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const v3 = (a: ArrayLike<number>, k: number): { x: number; y: number; z: number } => ({ x: a[k]!, y: a[k + 1]!, z: a[k + 2]! });

function setup() {
  const renderer = new WebGPURenderer({ forceWebGL: true, canvas: fakeCanvas() });
  const calls = { compute: 0, batches: [] as unknown[] };
  Object.assign(renderer, {
    compute: (batch: unknown) => {
      calls.compute++;
      calls.batches[0] = batch;
    },
    _attributes: { delete: () => undefined },
  });
  return { twins: new ParticleTwins(renderer), calls };
}

function pools() {
  const scene = new THREE.Scene();
  const motes = new DustMotes(DUST_MOTES.max);
  motes.setCount(64);
  const terrain = buildTerrain(-10, -10, 1, 20, 20, () => 0);
  const flies = new Fireflies(30, terrain, [], new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 2, 10)));
  const plumes = new SmokePlumes([{ x: 0, y: 5, z: 0, radius: 0.5 }], DRESSING.smoke);
  const puffs = new ImpactPuffs(IMPACT_PUFFS);
  const grit = new ImpactGrit();
  grit.setEnabled(true);
  scene.add(motes.object, flies.object, plumes.object, puffs.object, grit.object);
  return { scene, motes, flies, plumes, puffs, grit };
}

const camera = new THREE.PerspectiveCamera();
camera.position.set(1, 1.6, 4);

describe('puffKernel for every pool of soft puffs (acceptance 1: impact, hit and gas puffs, impact rings, kicked dust)', () => {
  const configs: [string, PuffConfig][] = [
    ['hit', HIT_PUFFS],
    ['ring', IMPACT_RINGS],
    ['kicked dust', KICKED_DUST],
  ];
  for (const [name, cfg] of configs) {
    it(`places and sizes every live ${name} puff as ImpactPuffs.update does`, () => {
      const puffs = new ImpactPuffs(cfg);
      puffs.spawn({ x: 0, y: 1, z: 0 }, undefined, 1.3, { x: 0.5, y: 0.2, z: -0.4 });
      puffs.update(0.05, camera);
      puffs.spawn({ x: 3, y: 0.5, z: -6 }, undefined, 0.8);
      for (let f = 0; f < 8; f++) puffs.update(1 / 60, camera);
      const matrix = new THREE.Matrix4();
      const at = new THREE.Vector3();
      const s = new THREE.Vector3();
      const live = puffs.puffs.filter((p) => p.age < cfg.lifetime);
      expect(live.length).toBe(2);
      expect(puffs.object.count).toBe(live.length);
      live.forEach((p, k) => {
        const d = puffKernel(o, cfg, p, { x: p.vx, y: p.vy, z: p.vz }, p.scale, p.age, camera.position);
        puffs.object.getMatrixAt(k, matrix);
        matrix.decompose(at, new THREE.Quaternion(), s);
        expect([d.x, d.y, d.z, d.w].map((x) => Math.round(x * 1e6))).toEqual([at.x, at.y, at.z, s.x].map((x) => Math.round(x * 1e6)));
        expect(d.w).toBeGreaterThan(0);
      });
    });
  }

  it('reads each pool\'s own numbers: the four configs do not give one puff one size', () => {
    const at = { x: 0, y: 0, z: 0 };
    const sizes = [IMPACT_PUFFS, GAS_PUFFS, HIT_PUFFS, IMPACT_RINGS, KICKED_DUST].map((c) => puffKernel(o, c, at, at, 1, c.lifetime / 2, { x: 0.2, y: 0, z: 0 }).w);
    expect(new Set(sizes.map((x) => x.toFixed(6))).size).toBeGreaterThanOrEqual(4);
  });
});

describe('plumeKernel for the vent steam (acceptance 1: chimney smoke and vent steam)', () => {
  it('places, sizes and fades every puff of every vent as SmokePlumes.update does', () => {
    const vents = [
      { x: 4, y: 0.4, z: -9, radius: STEAM_PLUME.spread },
      { x: -12, y: 0.6, z: 3, radius: STEAM_PLUME.spread },
    ];
    const plumes = new SmokePlumes(vents, STEAM_PLUME, 'steamPlumes');
    const cam = new THREE.PerspectiveCamera();
    for (let f = 0; f < 120; f++) plumes.update(1 / 60, cam, { x: 1.4, z: 0.7 });
    const M = plumes.M;
    expect(M).toBe(STEAM_PLUME);
    expect(M.puffs).not.toBe(DRESSING.smoke.puffs);
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const s = new THREE.Vector3();
    const alpha = plumes.object.geometry.getAttribute('puffAlpha').array;
    let n = 0;
    for (const v of vents) {
      for (let i = 0; i < M.puffs; i++, n++) {
        const d = plumeKernel(o, M, v, v.radius, v3(plumes.jitter, n * 3), i / M.puffs, plumes.time, plumes.wind);
        plumes.object.getMatrixAt(n, matrix);
        matrix.decompose(at, new THREE.Quaternion(), s);
        expect([d.x, d.y, d.z, d.w].map((x) => Math.round(x * 1e4))).toEqual([at.x, at.y, at.z, s.x].map((x) => Math.round(x * 1e4)));
        expect(d.alpha).toBeCloseTo(alpha[n]!, 5);
      }
    }
  });
});

describe('what each driver is fed (acceptance 1: the CPU keeps the clock, the air and the spawns)', () => {
  it('hands the motes\' pass the module\'s clock, drift, eye and the map dust\'s height fade', () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    const gpu = p.motes.gpu as unknown as { time: { value: number }; drift: { value: THREE.Vector3 }; eye: { value: THREE.Vector3 }; hangsLow: { value: number } };
    p.motes.update(0.25, { x: 3, y: 2, z: -5 }, { x: 1, y: 0.5, z: -2 });
    p.motes.update(0.25, { x: 4, y: 2, z: -5 }, { x: 1, y: 0.5, z: -2 });
    expect(gpu.time.value).toBeCloseTo(0.5, 9);
    expect(gpu.time.value).toBe(p.motes.time);
    expect(gpu.drift.value.toArray()).toEqual([p.motes.drift.x, p.motes.drift.y, p.motes.drift.z]);
    expect(p.motes.drift.x).toBeGreaterThan(0);
    expect(gpu.eye.value.toArray()).toEqual([4, 2, -5]);
    expect(gpu.hangsLow.value).toBe(0);
    p.motes.setMapDust(0x998877);
    p.motes.update(0.1, { x: 4, y: 2, z: -5 }, { x: 0, y: 0, z: 0 });
    expect(gpu.hangsLow.value).toBe(1);
    p.motes.setMapDust(null);
    p.motes.update(0.1, { x: 4, y: 2, z: -5 }, { x: 0, y: 0, z: 0 });
    expect(gpu.hangsLow.value).toBe(0);
  });

  it('hands the plumes\' pass the module\'s clock and its eased wind, and the flies\' their clock', () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    const plume = p.plumes.gpu as unknown as { time: { value: number }; wind: { value: THREE.Vector2 } };
    for (let f = 0; f < 30; f++) p.plumes.update(0.05, camera, { x: 2, z: -1 });
    expect(plume.time.value).toBe(p.plumes.time);
    expect(plume.time.value).toBeCloseTo(1.5, 9);
    expect(plume.wind.value.toArray()).toEqual([p.plumes.wind.x, p.plumes.wind.z]);
    expect(p.plumes.wind.x).toBeGreaterThan(0.5);
    const fly = p.flies.gpu as unknown as { time: { value: number } };
    p.flies.update(0.2);
    p.flies.update(0.2);
    expect(fly.time.value).toBeCloseTo(0.4, 9);
  });

  it('stands the fireflies at home at full glow under Reduced motion with one pass, and lets them go with one more', () => {
    const { twins, calls } = setup();
    const p = pools();
    twins.scan(p.scene);
    twins.frame();
    const still = (p.flies.gpu as unknown as { still: { value: number } }).still;
    expect(still.value).toBe(0);
    const before = calls.compute;
    twins.frame();
    expect(calls.compute).toBe(before);
    p.flies.setMotion(false);
    // The module's update is a no-op under Reduced motion: the driver notices the switch itself, once.
    p.flies.update(0.1);
    twins.frame();
    expect(still.value).toBe(1);
    expect(calls.compute).toBe(before + 1);
    twins.frame();
    expect(calls.compute).toBe(before + 1);
    p.flies.setMotion(true);
    twins.frame();
    expect(still.value).toBe(0);
    expect(calls.compute).toBe(before + 2);
  });
});

describe('BB flight stays in the simulation (acceptance 1: the GPU only draws BBs, trails and glows)', () => {
  it('gives the BBs\' own draw no driver, and leaves it in the camera\'s layers', () => {
    const { twins } = setup();
    const p = pools();
    const bbs = new BBRenderer(createBBPool(4), 1 / 60);
    p.scene.add(bbs.object);
    twins.scan(p.scene);
    expect(twins.count).toBe(5);
    bbs.object.traverse((o) => {
      expect(o.name.endsWith('-gpu')).toBe(false);
      expect(twins.claims(o)).toBe(false);
    });
    for (const child of bbs.object.children) expect(child.layers.mask).not.toBe(0);
    expect(bbs.object.children).toHaveLength(3);
    bbs.dispose();
  });
});

describe('a pool at rest dispatches nothing (acceptance 1)', () => {
  it('dispatches no pass for motes the preset draws none of (Low) or Reduced motion hides, and none for the plumes while hidden', () => {
    const { twins, calls } = setup();
    const p = pools();
    twins.scan(p.scene);
    twins.frame();
    const base = calls.compute;
    // Low: no motes.
    p.motes.setCount(0);
    p.motes.update(0.1, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
    p.plumes.object.visible = false;
    p.plumes.update(0.1, camera, { x: 0, z: 0 });
    twins.frame();
    expect(calls.compute).toBe(base);
    // Reduced motion hides the motes too.
    p.motes.setCount(64);
    p.motes.setMotion(false);
    p.motes.update(0.1, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
    twins.frame();
    expect(calls.compute).toBe(base);
    // And back: moving again, one pass.
    p.motes.setMotion(true);
    p.motes.update(0.1, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 });
    twins.frame();
    expect(calls.compute).toBe(base + 1);
  });
});

describe('the preset\'s counts on the GPU path (acceptance 1: the same counts per preset as WebGL)', () => {
  /** The quads the motes' or flies' sprite twin draws for the next frame. */
  function drawn(points: THREE.Points): number {
    const sprite = points.children.find((c) => c instanceof THREE.Sprite) as THREE.Sprite;
    (sprite.onBeforeRender as unknown as (...a: unknown[]) => void)(null, null, null, null, null, null);
    return sprite.count;
  }

  it('draws as many motes as the preset sets, as the points do, and none at 0', () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    for (const count of [64, 90, DUST_MOTES.max, 0, 12]) {
      p.motes.setCount(count);
      expect(drawn(p.motes.object)).toBe(count);
    }
  });

  it('draws every firefly the map asks for, and a puff pool as many puffs as are alive', () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    expect(drawn(p.flies.object)).toBe(30);
    const mesh = p.puffs.object.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry>;
    p.puffs.update(1 / 60, camera);
    expect(p.puffs.object.count).toBe(0);
    expect(mesh.geometry.instanceCount).toBe(0);
    for (let k = 0; k < 5; k++) p.puffs.spawn({ x: k, y: 1, z: 0 });
    p.puffs.update(1 / 60, camera);
    expect(p.puffs.object.count).toBe(5);
    expect(mesh.geometry.instanceCount).toBe(IMPACT_PUFFS.max);
  });
});

/** A spawn pool's driver, as the tests read it. */
interface SpawnDriverView {
  clock: { value: number };
  births: Float64Array;
  records: { value: { array: Float32Array } }[];
}

describe('a slot that has run its course stays dead after the pool rests (acceptance 1)', () => {
  const REST = 1.2;

  /** Frames of `seconds` at 60 Hz through the pool's update and the driver's dispatch. */
  function run(seconds: number, update: (dt: number) => void, twins: ParticleTwins): void {
    for (let t = 0; t < seconds; t += 1 / 60) {
      update(1 / 60);
      twins.frame();
    }
  }

  // Was a bug (W5 QA, found on 9c12534, fixed in attempt 2): SpawnDriver.rebase() puts the pool's clock back to 0 after a lull and
  // clears the CPU's births, but leaves each slot's birth in the record the pass reads. An earlier puff (or burst of
  // chips) then has a birth within a lifetime of the new clock and is drawn again, at its old place, with the next impact.
  // Found by evaluating the kernel on the records; fixed: rebase() also writes -1e9 into the births of the records.
  it('shows only the new puff, not an earlier one replayed, when an impact follows a lull', () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    const driver = p.puffs.gpu as unknown as SpawnDriverView;
    run(0.1, (dt) => p.puffs.update(dt, camera), twins);
    p.puffs.spawn({ x: 1, y: 1, z: 1 });
    run(REST, (dt) => p.puffs.update(dt, camera), twins);
    expect(p.puffs.object.count).toBe(0);
    p.puffs.spawn({ x: 9, y: 1, z: 1 });
    run(1 / 60, (dt) => p.puffs.update(dt, camera), twins);
    // What the pass would draw for each slot: the kernel on its record, at the clock.
    const where = driver.records[0]!.value.array;
    const push = driver.records[1]!.value.array;
    const ages: number[] = [];
    for (let i = 0; i < IMPACT_PUFFS.max; i++) {
      const age = driver.clock.value - where[i * 4 + 3]!;
      const size = puffKernel(o, IMPACT_PUFFS, v3(where, i * 4), v3(push, i * 4), push[i * 4 + 3]!, age, camera.position).w;
      if (size > 0) ages.push(age);
    }
    expect(ages).toHaveLength(1);
    expect(ages[0]!).toBeGreaterThanOrEqual(0);
    expect(ages[0]!).toBeLessThan(0.05);
  });

  // Was a bug (W5 QA, fixed in attempt 2): the same, for the grit: the old chips are stepped and drawn full size.
  it('shows only the new chips, not an earlier burst falling again, when an impact follows a lull', () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    const driver = p.grit.gpu as unknown as SpawnDriverView;
    const tint = new THREE.Color(1, 1, 1);
    run(0.1, (dt) => p.grit.update(dt, camera), twins);
    p.grit.spawn({ x: 0, y: 1, z: 0 }, tint, { x: 0, y: 1, z: 5 });
    run(REST, (dt) => p.grit.update(dt, camera), twins);
    expect(p.grit.object.count).toBe(0);
    p.grit.spawn({ x: 5, y: 1, z: 0 }, tint, { x: 0, y: 1, z: 5 });
    const dt = 1 / 60;
    run(dt, (d) => p.grit.update(d, camera), twins);
    const thrown = driver.records[0]!.value.array;
    // The pass moves and draws a chip while clock − birth − dt is under the lifetime.
    const ages: number[] = [];
    for (let i = 0; i < IMPACT_GRIT.max; i++) {
      const age = driver.clock.value - thrown[i * 4 + 3]!;
      if (age - dt < IMPACT_GRIT.lifetime) ages.push(age);
    }
    expect(ages.length).toBeGreaterThanOrEqual(IMPACT_GRIT.perImpact[0]);
    expect(ages.length).toBeLessThanOrEqual(IMPACT_GRIT.perImpact[1]);
    for (const age of ages) {
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(0.05);
    }
  });

  it('still shows an earlier puff that is inside its life when the next comes, and keeps the clock small over a long match', () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    const driver = p.puffs.gpu as unknown as SpawnDriverView;
    p.puffs.spawn({ x: 0, y: 1, z: 0 });
    run(0.1, (dt) => p.puffs.update(dt, camera), twins);
    p.puffs.spawn({ x: 2, y: 1, z: 0 });
    run(1 / 60, (dt) => p.puffs.update(dt, camera), twins);
    expect(p.puffs.object.count).toBe(2);
    // A shot every two seconds for two minutes: the clock never carries a minute of float precision.
    let widest = 0;
    for (let shot = 0; shot < 60; shot++) {
      p.puffs.spawn({ x: shot, y: 1, z: 0 });
      run(2, (dt) => p.puffs.update(dt, camera), twins);
      widest = Math.max(widest, driver.clock.value);
    }
    expect(widest).toBeLessThan(IMPACT_PUFFS.lifetime + 2.1);
  });
});

describe('no allocation per frame in the particle drivers (acceptance 5)', () => {
  const FRAMES = 1_000;
  // A frame that made one object would read 1,000; the sampler's own noise (a JIT tier-up) is a hundred or so.
  const NOISE = 400;
  const eye = { x: 1, y: 1.6, z: 4 };
  const wind = { x: 1, y: 0, z: 0.5 };
  const at = { x: 0, y: 1, z: 0 };

  it('makes no object in every pool\'s update, nor in the spawns it is handed', async () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    const update = (f: number): void => {
      p.motes.update(1 / 60, eye, wind);
      p.flies.update(1 / 60);
      p.plumes.update(1 / 60, camera, wind);
      if (f % 9 === 0) p.puffs.spawn(at);
      p.puffs.update(1 / 60, camera);
      p.grit.update(1 / 60, camera);
    };
    for (let f = 0; f < 200; f++) update(f);
    const objects = await objectsAllocatedByGame(() => {
      for (let f = 0; f < FRAMES; f++) update(f);
    });
    expect(objects).toBeLessThan(NOISE);
  }, 60_000);

  // Was a bug (W5 QA, fixed in attempt 2): ParticleTwins.frame walked `drivers.values()` (a Map iterator and a result
  // object per step, about 7 objects a frame) and empties `batch` with `length = 0`, which frees its backing store, so
  // the next push makes one (152 bytes): 8,000 objects in 1,000 frames, against the "nothing allocated per frame" it
  // says. Fixed: it walks an array of the drivers, and sets `batch.length` only when the number of passes changes.
  it('makes no object in the frame\'s dispatch of the drivers\' passes (the batch and the walk of the drivers are reused)', async () => {
    const { twins, calls } = setup();
    const p = pools();
    twins.scan(p.scene);
    const frame = (f: number): void => {
      p.motes.update(1 / 60, eye, wind);
      p.flies.update(1 / 60);
      p.plumes.update(1 / 60, camera, wind);
      if (f % 9 === 0) p.puffs.spawn(at);
      p.puffs.update(1 / 60, camera);
      twins.frame();
    };
    for (let f = 0; f < 200; f++) frame(f);
    const dispatched = calls.compute;
    const objects = await objectsAllocatedByGame(() => {
      for (let f = 0; f < FRAMES; f++) frame(f);
    });
    // Every frame did dispatch (the walk really ran), and made nothing to do it.
    expect(calls.compute - dispatched).toBe(FRAMES);
    expect(objects).toBeLessThan(NOISE);
  }, 60_000);
});

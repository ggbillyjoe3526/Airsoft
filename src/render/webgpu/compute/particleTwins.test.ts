import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRESSING } from '../../../config/dressing';
import { DUST_MOTES, IMPACT_GRIT, IMPACT_PUFFS } from '../../../config/render';
import { buildTerrain } from '../../../map/terrain';
import { DustMotes } from '../../dustMotes';
import { Fireflies } from '../../fireflies';
import { ImpactGrit } from '../../impactGrit';
import { ImpactPuffs } from '../../impactPuffs';
import { SmokePlumes } from '../../smokePlumes';
import { ParticleTwins } from './particleTwins';

/**
 * The particles' compute drivers (W5) on a real `WebGPURenderer` (its WebGL2 back end, as the container runs it; no
 * GPU: `compute` and the buffer store are stood in for): every pool gets a driver that its module hands the frame to,
 * the frame's passes go in one dispatch, a pool with nothing alive draws and dispatches nothing, and every buffer is
 * freed when the driver goes.
 */

function fakeCanvas(): HTMLCanvasElement {
  return { style: {}, width: 300, height: 150, addEventListener: () => undefined, removeEventListener: () => undefined, getContext: () => null } as unknown as HTMLCanvasElement;
}

beforeEach(() => {
  vi.stubGlobal('document', { createElementNS: () => fakeCanvas(), createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(): { renderer: WebGPURenderer; compute: ReturnType<typeof vi.fn>; freed: THREE.BufferAttribute[]; twins: ParticleTwins } {
  const renderer = new WebGPURenderer({ forceWebGL: true, canvas: fakeCanvas() });
  const compute = vi.fn();
  (renderer as unknown as { compute: unknown }).compute = compute;
  const freed: THREE.BufferAttribute[] = [];
  (renderer as unknown as { _attributes: unknown })._attributes = { delete: (a: THREE.BufferAttribute) => freed.push(a) };
  return { renderer, compute, freed, twins: new ParticleTwins(renderer) };
}

function pools(): { scene: THREE.Scene; motes: DustMotes; flies: Fireflies; plumes: SmokePlumes; puffs: ImpactPuffs; grit: ImpactGrit } {
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

describe('ParticleTwins', () => {
  it('gives every pool a driver its module hands the frame to, and claims the sized points it draws itself', () => {
    const { twins } = setup();
    const p = pools();
    twins.scan(p.scene);
    expect(twins.count).toBe(5);
    for (const owner of [p.motes, p.flies, p.plumes, p.puffs, p.grit]) expect(owner.gpu).toBeDefined();
    expect(twins.claims(p.motes.object)).toBe(true);
    expect(twins.claims(p.flies.object)).toBe(true);
    // The CPU pools' own draws leave the camera's layers; the drivers' draws hang under them.
    for (const o of [p.plumes.object, p.puffs.object, p.grit.object]) {
      expect(o.layers.mask).toBe(0);
      expect(o.children.some((c) => c.name.endsWith('-gpu'))).toBe(true);
    }
    // A second scan finds nothing new.
    twins.rescan();
    twins.scan(p.scene);
    expect(twins.count).toBe(5);
  });

  it("skips the CPU's per-particle loop and dispatches the frame's passes together, in one reused batch", () => {
    const { twins, compute } = setup();
    const p = pools();
    twins.scan(p.scene);
    const before = Array.from(p.motes.object.geometry.getAttribute('position').array);
    p.motes.update(0.1, { x: 1, y: 2, z: 3 }, { x: 1, y: 0, z: 0 });
    p.flies.update(0.1);
    p.plumes.update(0.1, camera, { x: 0, z: 0 });
    // The motes' CPU positions were never written: their pass places them.
    expect(Array.from(p.motes.object.geometry.getAttribute('position').array)).toEqual(before);
    twins.frame();
    expect(compute).toHaveBeenCalledTimes(1);
    const batch = compute.mock.calls[0]![0] as unknown[];
    expect(batch).toHaveLength(3);
    // Nothing moved since: no dispatch at all.
    twins.frame();
    expect(compute).toHaveBeenCalledTimes(1);
    p.motes.update(0.1, { x: 1, y: 2, z: 3 }, { x: 1, y: 0, z: 0 });
    twins.frame();
    expect(compute.mock.calls[1]![0]).toBe(batch);
  });

  it('draws and dispatches nothing for a pool with nothing alive, and draws a spawn until its life is over', () => {
    const { twins, compute } = setup();
    const p = pools();
    twins.scan(p.scene);
    // The fireflies' first pass places them (once); from here only what moves dispatches.
    twins.frame();
    compute.mockClear();
    const draw = p.puffs.object.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry>;
    p.puffs.update(1 / 60, camera);
    p.grit.update(1 / 60, camera);
    expect(draw.geometry.instanceCount).toBe(0);
    twins.frame();
    expect(compute).not.toHaveBeenCalled();
    p.puffs.spawn({ x: 0, y: 1, z: 0 });
    p.puffs.update(1 / 60, camera);
    expect(draw.geometry.instanceCount).toBe(IMPACT_PUFFS.max);
    expect(p.puffs.object.count).toBe(1);
    twins.frame();
    expect(compute).toHaveBeenCalledTimes(1);
    for (let t = 0; t < IMPACT_PUFFS.lifetime + 0.1; t += 0.05) p.puffs.update(0.05, camera);
    expect(draw.geometry.instanceCount).toBe(0);
    expect(p.puffs.object.count).toBe(0);
  });

  it("hands a pool's spawns to its driver, carrying on what was in the air when the driver came", () => {
    const { twins } = setup();
    const p = pools();
    p.grit.spawn({ x: 0, y: 1, z: 0 }, new THREE.Color(1, 1, 1), { x: 0, y: 1, z: 5 });
    twins.scan(p.scene);
    p.grit.update(1 / 60, camera);
    expect(p.grit.object.count).toBeGreaterThanOrEqual(IMPACT_GRIT.perImpact[0]);
  });

  it('frees every buffer and gives the modules back their own loop when it goes (a lost device)', () => {
    const { twins, freed } = setup();
    const p = pools();
    twins.scan(p.scene);
    twins.dispose();
    expect(twins.count).toBe(0);
    for (const owner of [p.motes, p.flies, p.plumes, p.puffs, p.grit]) expect(owner.gpu).toBeUndefined();
    // Motes 2, fireflies 3, plumes 4, puffs 4, grit 6.
    expect(freed).toHaveLength(19);
    for (const o of [p.plumes.object, p.puffs.object, p.grit.object]) {
      expect(o.layers.mask).not.toBe(0);
      expect(o.children).toHaveLength(0);
    }
  });

  it("drops a pool's driver (and its buffers) when the pool itself is freed", () => {
    const { twins, freed } = setup();
    const p = pools();
    twins.scan(p.scene);
    p.puffs.dispose();
    expect(twins.count).toBe(4);
    expect(freed).toHaveLength(4);
  });
});

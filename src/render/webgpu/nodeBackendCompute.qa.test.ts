import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRESSING } from '../../config/dressing';
import { DUST_MOTES, IMPACT_PUFFS, QUALITY } from '../../config/render';
import { buildTerrain } from '../../map/terrain';
import { WOODLAND } from '../../map/woodland';
import { DustMotes } from '../dustMotes';
import { Fireflies } from '../fireflies';
import { ImpactGrit } from '../impactGrit';
import { ImpactPuffs } from '../impactPuffs';
import { SmokePlumes } from '../smokePlumes';
import { fakeCanvas, mapSceneOf } from '../testSupport';
import { NodeBackend, type NodeBackendOptions } from './nodeBackend';
import { grassLevels } from './compute/grassLayout';

/**
 * W5 QA: the compute passes inside the node back end (acceptance 1, 2, 5), on a real `WebGPURenderer` (no GPU): the
 * quality the Renderer hands it reaches the grass and stand-ins at the frame and at the compile ahead, a preset change
 * through `rescan` frees them, and a lost or closed renderer (`dispose`) frees every compute buffer, particles and
 * dressing alike.
 */

const WEBGL2: NodeBackendOptions = { antialias: false, forceWebGL: true };

beforeEach(() => {
  vi.stubGlobal('document', { createElementNS: () => fakeCanvas(), createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
  vi.spyOn(WebGPURenderer.prototype, 'init').mockImplementation(async function (this: WebGPURenderer) {
    return this;
  });
  vi.spyOn(WebGPURenderer.prototype, 'hasFeature').mockImplementation(() => false);
  vi.spyOn(WebGPURenderer.prototype, 'dispose').mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A node back end whose renderer counts the passes and frees, over a scene holding Woodland and every kind of particle pool. */
async function world() {
  const node = await NodeBackend.make(WEBGL2);
  const freed: unknown[] = [];
  const calls = { compute: 0 };
  Object.assign(node.renderer, {
    compute: () => void calls.compute++,
    render: () => undefined,
    clear: () => undefined,
    setRenderTarget: () => undefined,
    _attributes: { delete: (a: unknown) => void freed.push(a) },
  });
  vi.spyOn(node.renderer, 'compileAsync').mockResolvedValue(undefined as never);
  const { scene } = mapSceneOf(WOODLAND);
  const motes = new DustMotes(DUST_MOTES.max);
  motes.setCount(32);
  const flies = new Fireflies(10, buildTerrain(-10, -10, 1, 20, 20, () => 0), [], new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 2, 10)));
  const plumes = new SmokePlumes([{ x: 0, y: 5, z: 0, radius: 0.5 }], DRESSING.smoke);
  const puffs = new ImpactPuffs(IMPACT_PUFFS);
  const grit = new ImpactGrit();
  grit.setEnabled(true);
  scene.add(motes.object, flies.object, plumes.object, puffs.object, grit.object);
  const drawer = { draw: vi.fn() };
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 250);
  const frame = (quality: typeof QUALITY.low): void => {
    node.rescan();
    node.prepare(scene, quality);
    node.draw(scene, camera, undefined, drawer);
  };
  return { node, scene, freed, calls, frame, camera, drawer, pools: { motes, flies, plumes, puffs, grit } };
}

const gpuObjects = (scene: THREE.Scene): string[] => {
  const names: string[] = [];
  scene.traverse((o) => void (o.name.endsWith('-gpu') && names.push(o.name)));
  return names.sort();
};

describe('the Renderer\'s quality reaches the grass and stand-ins through the back end', () => {
  it('draws none on Low and Woodland\'s on each preset above, made and freed as the preset changes', async () => {
    const { node, scene, frame, freed, drawer } = await world();
    frame(QUALITY.low);
    expect(gpuObjects(scene)).not.toContain('grass-gpu');
    expect(gpuObjects(scene)).not.toContain('forest-gpu');
    // The particles are still moved by compute on Low (acceptance 1 holds on every preset): their draws hang under the pools.
    expect(gpuObjects(scene).length).toBeGreaterThanOrEqual(3);
    expect(freed).toEqual([]);
    expect(drawer.draw).toHaveBeenCalledTimes(1);
    for (const preset of ['medium', 'high', 'ultra'] as const) {
      frame(QUALITY[preset]);
      expect(scene.getObjectByName('grass-gpu')).toBeDefined();
      expect(scene.getObjectByName('forest-gpu')).toBeDefined();
      const dressing = (node as unknown as { dressing: { counts: { grass: number } } }).dressing;
      expect(dressing.counts.grass).toBe(grassLevels(preset).count);
    }
    // Back to Low: freed, and the particles' draws stay.
    const before = freed.length;
    frame(QUALITY.low);
    expect(scene.getObjectByName('grass-gpu')).toBeUndefined();
    expect(scene.getObjectByName('forest-gpu')).toBeUndefined();
    // The grass's three slot buffers and the stand-ins' four.
    expect(freed.length - before).toBe(7);
    expect(drawer.draw).toHaveBeenCalledTimes(5);
  });

  it('makes them at the compile ahead of the first frame (so their pipelines compile with the rest), when the Renderer says its quality', async () => {
    const { node, scene, camera } = await world();
    node.compile(scene, camera, undefined, null);
    expect(scene.getObjectByName('grass-gpu')).toBeUndefined();
    node.compile(scene, camera, undefined, null, QUALITY.high);
    expect(scene.getObjectByName('grass-gpu')).toBeDefined();
    expect(scene.getObjectByName('forest-gpu')).toBeDefined();
  });

  it('draws nothing of the dressing before the Renderer has said its quality', async () => {
    const { node, scene, camera, drawer } = await world();
    node.draw(scene, camera, undefined, drawer);
    expect(scene.getObjectByName('grass-gpu')).toBeUndefined();
  });
});

describe('a lost or closed renderer frees every compute buffer (acceptance 5)', () => {
  it('frees the particles\' and the dressing\'s buffers, takes their draws out of the scene and gives the pools their own loop back', async () => {
    const { node, scene, freed, frame, pools } = await world();
    frame(QUALITY.ultra);
    expect(freed).toEqual([]);
    expect(pools.puffs.gpu).toBeDefined();
    node.dispose();
    // Motes 2, fireflies 3, plumes 4, puffs 4, grit 6; the grass's three, the stand-ins' four.
    expect(freed).toHaveLength(19 + 7);
    expect(new Set(freed).size).toBe(freed.length);
    expect(gpuObjects(scene)).toEqual([]);
    for (const pool of Object.values(pools)) expect(pool.gpu).toBeUndefined();
    expect(pools.puffs.object.layers.mask).not.toBe(0);
  });

  it('frees them when the device is lost and the game takes the old renderer down', async () => {
    const { node, scene, freed, frame } = await world();
    const told = vi.fn();
    node.onLost(told);
    frame(QUALITY.high);
    node.renderer.onDeviceLost({ api: 'WebGL', message: 'context lost', reason: null, originalEvent: null } as never);
    expect(told).toHaveBeenCalledTimes(1);
    expect(node.lost).toBe(true);
    // Nothing is freed by the loss itself (the buffers died with the device); the Renderer's takeOver disposes the old back end.
    node.dispose();
    expect(freed).toHaveLength(19 + 7);
    expect(gpuObjects(scene)).toEqual([]);
  });
});

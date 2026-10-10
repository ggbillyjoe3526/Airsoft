import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUALITY } from '../../../config/render';
import { DEPOT } from '../../../map/depot';
import type { MapData } from '../../../map/mapTypes';
import { WOODLAND } from '../../../map/woodland';
import { GpuDressing } from './gpuDressing';
import { grassLevels } from './grassLayout';

/**
 * The map's grass and tree stand-ins on the node path (W5), on a real `WebGPURenderer` (no GPU: its draws, compute and
 * buffer store stood in for): made for a map whose dressing asks for them on Medium and up, freed and made again on a
 * preset change, freed when the map leaves the scene or the device goes; none on Low or for a map that asks for none.
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

function setup(webgpu = false): { dressing: GpuDressing; compute: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn>; freed: unknown[] } {
  const renderer = new WebGPURenderer({ forceWebGL: true, canvas: fakeCanvas() });
  const compute = vi.fn();
  const render = vi.fn();
  const freed: unknown[] = [];
  Object.assign(renderer, { compute, render, clear: vi.fn(), setRenderTarget: vi.fn(), _attributes: { delete: (a: unknown) => freed.push(a) } });
  return { dressing: new GpuDressing(renderer, webgpu), compute, render, freed };
}

/** A scene holding `map`'s group as render/mapMeshes.ts builds it: the map on it, its terrain mesh coloured. */
function sceneOf(map: MapData): { scene: THREE.Scene; group: THREE.Group } {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = 'map';
  group.userData.map = map;
  if (map.terrain) {
    const n = (map.terrain.cols + 1) * (map.terrain.rows + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.2), 3));
    const terrain = new THREE.Mesh(g);
    terrain.name = 'map-terrain';
    group.add(terrain);
  }
  scene.add(group);
  return { scene, group };
}

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 250);

describe('GpuDressing', () => {
  it("makes Woodland's grass and stand-ins on Ultra, culls both every frame and takes the stand-ins' pictures once", () => {
    const { dressing, compute, render } = setup();
    const { scene } = sceneOf(WOODLAND);
    dressing.frame(scene, camera, QUALITY.ultra);
    expect(dressing.counts).toEqual({ grass: grassLevels('ultra').count, forest: 2000 });
    expect(scene.getObjectByName('grass-gpu')).toBeDefined();
    expect(scene.getObjectByName('forest-gpu')).toBeDefined();
    // The atlas: its colour and its normals, one draw each.
    expect(render).toHaveBeenCalledTimes(2);
    expect(compute).toHaveBeenCalledTimes(2);
    dressing.frame(scene, camera, QUALITY.ultra);
    expect(compute).toHaveBeenCalledTimes(4);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('packs the kept blades into an indirect draw on WebGPU; on the WebGL2 back end draws every slot', () => {
    for (const webgpu of [false, true]) {
      const { dressing } = setup(webgpu);
      const { scene } = sceneOf(WOODLAND);
      dressing.frame(scene, camera, QUALITY.medium);
      const grass = scene.getObjectByName('grass-gpu') as THREE.Mesh<THREE.InstancedBufferGeometry>;
      expect(grass.geometry.instanceCount).toBe(grassLevels('medium').count);
      expect(grass.geometry.indirect !== null && grass.geometry.indirect !== undefined).toBe(webgpu);
    }
  });

  it('draws neither on Low, nor for a map whose dressing asks for none', () => {
    const { dressing, compute } = setup();
    const woods = sceneOf(WOODLAND).scene;
    dressing.frame(woods, camera, QUALITY.low);
    expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
    const depot = sceneOf(DEPOT).scene;
    dressing.rescan();
    dressing.frame(depot, camera, QUALITY.ultra);
    expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
    expect(compute).not.toHaveBeenCalled();
  });

  it("frees everything and makes them again at the new preset's counts on a preset change", () => {
    const { dressing, freed } = setup();
    const { scene } = sceneOf(WOODLAND);
    dressing.frame(scene, camera, QUALITY.ultra);
    const grass = scene.getObjectByName('grass-gpu') as THREE.Mesh;
    const disposed = vi.fn();
    grass.geometry.addEventListener('dispose', disposed);
    dressing.rescan();
    dressing.frame(scene, camera, QUALITY.medium);
    expect(disposed).toHaveBeenCalled();
    // The grass's three slot buffers and the stand-ins' four.
    expect(freed).toHaveLength(7);
    expect(dressing.counts.grass).toBe(grassLevels('medium').count);
    expect(scene.children.filter((c) => c.name === 'grass-gpu')).toHaveLength(1);
    // The same preset again: nothing made or freed.
    dressing.rescan();
    dressing.frame(scene, camera, QUALITY.medium);
    expect(freed).toHaveLength(7);
  });

  it('frees both when the map leaves the scene, and when the device goes', () => {
    const { dressing, freed } = setup();
    const { scene, group } = sceneOf(WOODLAND);
    dressing.frame(scene, camera, QUALITY.high);
    scene.remove(group);
    dressing.frame(scene, camera, QUALITY.high);
    expect(dressing.counts).toEqual({ grass: 0, forest: 0 });
    expect(scene.getObjectByName('grass-gpu')).toBeUndefined();
    expect(freed).toHaveLength(7);
    // A new map comes in: found on the next frame.
    const next = sceneOf(WOODLAND);
    scene.add(next.group);
    dressing.frame(scene, camera, QUALITY.high);
    expect(dressing.counts.forest).toBeGreaterThan(0);
    dressing.dispose();
    expect(freed).toHaveLength(14);
    expect(scene.getObjectByName('forest-gpu')).toBeUndefined();
  });

  it("sways the grass only while the match's motion allows (Reduced motion stills it)", () => {
    const { dressing } = setup();
    const { scene } = sceneOf(WOODLAND);
    const sway = () => (dressing as unknown as { grass: { sway: { value: number } } }).grass.sway.value;
    dressing.frame(scene, camera, QUALITY.medium);
    expect(sway()).toBe(1);
    dressing.frame(scene, camera, QUALITY.medium, false);
    expect(sway()).toBe(0);
    dressing.frame(scene, camera, QUALITY.medium, true);
    expect(sway()).toBe(1);
  });
});

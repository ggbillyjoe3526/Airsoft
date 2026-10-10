import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import type { GpuDressingTier } from '../../../config/gpuDressing';
import { type QualitySettings, qualityChoiceOf } from '../../../config/render';
import { buildGroundGrid } from '../../../map/groundSurfaces';
import type { MapData } from '../../../map/mapTypes';
import { terrainMaxX, terrainMaxZ } from '../../../map/terrain';
import { type FieldBounds, forestCount, placeForest } from './forestLayout';
import { ForestStandIns } from './forestStandIns';
import { GrassField } from './grassField';
import { grassMask } from './grassLayout';

/**
 * The node renderer's map-driven compute dressing (WebGPU overhaul W5): the grass (grassField.ts) and the tree
 * stand-ins (forestStandIns.ts) of the map in the scene, for maps whose dressing asks for them (MapDressing.grass and
 * .forest), on Medium and up (a Custom preset with Map detail on draws High's; Low and Custom without it, neither).
 * Made when the scene changes (a session's build, a quality change: `rescan`) for the map group in it
 * (render/mapMeshes.ts, which carries its MapData), and freed when the preset or the map changes, the map leaves the
 * scene, or the device goes (`dispose`). Each frame before the draws, both are culled for the camera.
 *
 * `?noGpuDressing` (dev server and the e2e build only) leaves both out: the WebGPU comparison draws its W2 to W4 views
 * so, where WebGL has nothing like them (pipeline/webgpu-compare.mjs).
 */

const OFF = (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && typeof location !== 'undefined' && new URLSearchParams(location.search).has('noGpuDressing');

/** The preset whose counts `quality` draws, or null for none. */
export function dressingTier(quality: QualitySettings): GpuDressingTier | null {
  const choice = qualityChoiceOf(quality);
  if (choice === 'medium' || choice === 'high' || choice === 'ultra') return choice;
  return choice === 'custom' && quality.mapDetail ? 'high' : null;
}

/** The field's bounds on the ground: its terrain's, else its blocks'. */
function fieldOf(map: MapData): FieldBounds {
  const t = map.terrain;
  if (t) return { minX: t.minX, maxX: terrainMaxX(t), minZ: t.minZ, maxZ: terrainMaxZ(t) };
  const box = new THREE.Box3();
  for (const b of map.blocks) box.expandByPoint(new THREE.Vector3(b.center.x - b.size.x / 2, 0, b.center.z - b.size.z / 2)).expandByPoint(new THREE.Vector3(b.center.x + b.size.x / 2, 0, b.center.z + b.size.z / 2));
  return { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
}

export class GpuDressing {
  private grass: GrassField | null = null;
  private forest: ForestStandIns | null = null;
  /** The map group and preset they were made for. */
  private group: THREE.Object3D | null = null;
  private tier: GpuDressingTier | null = null;
  private dirty = true;
  private last = Number.NaN;
  private readonly media = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly webgpu: boolean,
  ) {}

  /** The scene changed: the next frame looks for the map again. */
  rescan(): void {
    this.dirty = true;
  }

  /** Blades and stand-ins drawn now (tests, the comparison's counts). */
  get counts(): { grass: number; forest: number } {
    return { grass: this.grass?.levels.count ?? 0, forest: this.forest?.count ?? 0 };
  }

  /** Before a frame's draws (and its compile): made or freed for `scene` at `quality` after a rescan, then culled for `camera`. */
  frame(scene: THREE.Scene, camera: THREE.Camera, quality: QualitySettings | null): void {
    if (OFF) return;
    if (this.dirty) {
      this.dirty = false;
      this.find(scene, quality);
    } else if (this.group && this.group.parent !== scene) {
      // The map left the scene (a new match, a rebuilt map): freed now, and the next frame looks for its successor.
      this.dispose();
      this.dirty = true;
    }
    if (!this.grass && !this.forest) return;
    const now = performance.now();
    const dt = Number.isNaN(this.last) ? 0 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    camera.updateMatrixWorld();
    this.grass?.frame(camera, dt, this.motion());
    this.forest?.frame(camera);
  }

  /** Frees both (the preset or the map changed, or the device went). */
  dispose(): void {
    this.grass?.dispose();
    this.forest?.dispose();
    this.grass = null;
    this.forest = null;
    this.group = null;
    this.tier = null;
  }

  private find(scene: THREE.Scene, quality: QualitySettings | null): void {
    const group = scene.getObjectByName('map') ?? null;
    const map = (group?.userData.map as MapData | undefined) ?? null;
    const tier = quality && map ? dressingTier(quality) : null;
    if (group === this.group && tier === this.tier) return;
    this.dispose();
    if (!group || !map || !tier) return;
    this.group = group;
    this.tier = tier;
    const grass = map.dressing?.grass;
    const terrainMesh = group.getObjectByName('map-terrain') as THREE.Mesh | undefined;
    const colours = terrainMesh?.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    const grid = grass && map.terrain && colours ? buildGroundGrid(map) : null;
    if (grass && map.terrain && colours && grid) {
      this.grass = new GrassField(this.renderer, tier, map.terrain, grassMask(map, map.terrain, grid), colours, grass.height, this.webgpu);
      scene.add(this.grass.mesh);
    }
    const forest = map.dressing?.forest;
    if (forest) {
      const trees = placeForest(forestCount(forest.trees, tier), fieldOf(map), map.dressing?.skyline ?? []);
      this.forest = new ForestStandIns(this.renderer, trees, this.webgpu);
      scene.add(this.forest.mesh);
    }
  }

  /** Whether the world may move: the player's Reduced motion (the game's container class), else the system's. */
  private motion(): boolean {
    const set = this.renderer.domElement.closest('.reduced-motion, .full-motion');
    if (set) return set.classList.contains('full-motion');
    return !(this.media?.matches ?? false);
  }
}

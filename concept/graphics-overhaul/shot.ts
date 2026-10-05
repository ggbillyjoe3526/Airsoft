import type * as THREE from 'three';
import type { Kit } from './kit';
import type { PostOpts } from './post';
import type { Preset } from './quality';

/**
 * What a map's shot builder gets from the concept page (main.ts): the scene to fill, the camera to aim, the shared kit
 * for the map, and helpers. It returns the post-processing options for its shot.
 */
export interface ShotCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  preset: Preset;
  /** The map's kit (its envMap is set on Ultra). Call kit.build() and add the group yourself. */
  kit: Kit;
  /** A fresh kit with the same preset and envMap (for figures, replicas, the world round the map). */
  newKit: () => Kit;
  /** Adds an object at (x, y, z) facing yaw, with shadows on every mesh. */
  place: (o: THREE.Object3D, x: number, z: number, yaw: number, y?: number) => THREE.Object3D;
  /** Whether figures should be robots (the page's robots=1 switch). */
  robots: boolean;
  /** Bakes the light probes (bounce light and large-scale shade) for `root` inside `box`, once the lights are in. */
  bakeGI: (root: THREE.Object3D, box: THREE.Box3, sun: number, sky: THREE.Color) => void;
}

export type MapShot = (ctx: ShotCtx, view: string) => PostOpts;

import * as THREE from 'three';
import type { MapData } from '../map/mapTypes';

/**
 * Test helpers for the render folder's QA tests (W5): a canvas as much as Three's renderer constructor touches, a scene
 * holding a map as render/mapMeshes.ts builds it, and a measure of what a loop allocates.
 */

/** A scene holding `map`'s group as render/mapMeshes.ts builds it (the map on it, its terrain mesh coloured). */
export function mapSceneOf(map: MapData): { scene: THREE.Scene; group: THREE.Group } {
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

/** A canvas as much as `new WebGPURenderer` touches. */
export function fakeCanvas(): HTMLCanvasElement {
  return { style: {}, width: 300, height: 150, addEventListener: () => undefined, removeEventListener: () => undefined, getContext: () => null } as unknown as HTMLCanvasElement;
}

interface HeapNode {
  id: number;
  callFrame: { url: string };
  children: HeapNode[];
}

/** The part of Node's inspector this reads (the app's tsconfig has no Node types). */
interface InspectorSession {
  connect(): void;
  disconnect(): void;
  post(method: string, params: object, done: (error: Error | null, result?: unknown) => void): void;
}

/** An object is at least this many bytes: a boxed number (V8 makes one for most double a Three method writes) is 16, a vector 48. */
const OBJECT_BYTES = 24;

/**
 * How many objects (not numbers) `run` allocates, sampled by V8's heap profiler (every few bytes, objects since
 * collected included), counting only allocation made under a stack frame in a source file of the game (not a test, not
 * Node's own, as `performance.now()` makes): a loop that calls `frame()` 1,000 times reads a few dozen unless `frame()`,
 * or anything it calls, makes a vector, an array or a closure each time. What the test's own loop, the profiler and
 * vitest allocate is left out.
 */
export async function objectsAllocatedByGame(run: () => void): Promise<number> {
  const inspector = 'node:inspector';
  const { Session } = (await import(/* @vite-ignore */ inspector)) as { Session: new () => InspectorSession };
  const session = new Session();
  session.connect();
  const post = <T>(method: string, params: object = {}): Promise<T> =>
    new Promise((resolve, reject) => session.post(method, params, (error, result) => (error ? reject(error) : resolve(result as T))));
  await post('HeapProfiler.enable');
  await post('HeapProfiler.startSampling', { samplingInterval: 8, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  let thrown: unknown = null;
  try {
    run();
  } catch (e) {
    thrown = e;
  }
  const { profile } = await post<{ profile: { head: HeapNode; samples: { size: number; nodeId: number }[] } }>('HeapProfiler.stopSampling');
  session.disconnect();
  if (thrown) throw thrown;
  // The nodes whose allocation is the game's: under (or in) a frame of one of its source files, and not Node's own.
  const counted = new Set<number>();
  const walk = (node: HeapNode, inGame: boolean): void => {
    const url = node.callFrame.url;
    const here = inGame || (/\/src\/.*\.ts$/.test(url) && !/node_modules|\.test\.ts$|testSupport\.ts$/.test(url));
    if (here && !url.startsWith('node:')) counted.add(node.id);
    for (const child of node.children) walk(child, here);
  };
  walk(profile.head, false);
  return profile.samples.filter((s) => s.size >= OBJECT_BYTES && counted.has(s.nodeId)).length;
}

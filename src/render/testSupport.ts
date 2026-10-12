import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FIGURE_RIG_KINDS, type FigureRigKind } from '../config/figureRig';
import type { MapData } from '../map/mapTypes';
import { type FigureRig, type FigureSidecar, prepareFigureRig } from './figureRig';
import { prepareReplicaFile, type ReplicaFiles } from './replicaFiles';

/**
 * Test helpers for the render folder's QA tests (W5): a canvas as much as Three's renderer constructor touches, a scene
 * holding a map as render/mapMeshes.ts builds it, a measure of what a loop allocates, and the rigged figures' and the
 * replicas' model files read from disk (BF1).
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

/** A GLB without its textures (Node has no image decoder): the materials keep their colours, the meshes are untouched. */
function withoutTextures(buf: Uint8Array): ArrayBuffer {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLength))) as Record<string, unknown> & { materials?: Record<string, unknown>[] };
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    const pbr = m.pbrMetallicRoughness as Record<string, unknown> | undefined;
    if (pbr) {
      delete pbr.baseColorTexture;
      delete pbr.metallicRoughnessTexture;
    }
  }
  const text = new TextEncoder().encode(JSON.stringify(json));
  // The JSON chunk is padded with spaces to four bytes, as GLB asks.
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const rest = buf.subarray(20 + jsonLength);
  const out = new Uint8Array(20 + padded.length + rest.length);
  const o = new DataView(out.buffer);
  out.set(buf.subarray(0, 12));
  o.setUint32(8, out.length, true);
  o.setUint32(12, padded.length, true);
  o.setUint32(16, 0x4e4f534a, true);
  out.set(padded, 20);
  out.set(rest, 20 + padded.length);
  return out.buffer;
}

/** Node's fs, without its types (the project compiles for the browser). */
export async function readFile(path: URL): Promise<Uint8Array> {
  const nodeFs = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array };
  return readFileSync(path);
}

/**
 * A model file under src/assets/models/, parsed as the game parses it (its clips on the scene, meshopt decoded as
 * render/externalModels.ts decodes it), without its textures.
 */
export async function modelScene(path: string): Promise<THREE.Object3D> {
  const buf = await readFile(new URL(`../assets/models/${path}`, import.meta.url));
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(withoutTextures(buf), '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

/** The rigged human and robot (BF1) and the AEG's and gas pistol's model files, as the game prepares them. */
export async function figureFilesForTests(): Promise<{ rigs: Record<FigureRigKind, FigureRig>; files: ReplicaFiles }> {
  const rigOf = async (kind: FigureRigKind): Promise<FigureRig> => {
    const sidecar = JSON.parse(new TextDecoder().decode(await readFile(new URL(`../assets/models/characters/${kind}.json`, import.meta.url)))) as FigureSidecar;
    return prepareFigureRig(kind, await modelScene(`characters/${kind}.glb`), sidecar);
  };
  const rigs = Object.fromEntries(await Promise.all(FIGURE_RIG_KINDS.map(async (k) => [k, await rigOf(k)] as const))) as Record<FigureRigKind, FigureRig>;
  const files: ReplicaFiles = new Map(await Promise.all((['aeg', 'pistol'] as const).map(async (id) => [id, prepareReplicaFile(id, await modelScene(`replicas/${id}.glb`), await modelScene(`replicaParts/${id}.glb`))] as const)));
  return { rigs, files };
}

import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { type MapEntry, MAPS } from '../../map/maps';
import type { Asset, Pool } from '../../pool/pool';
import { prepareReplicaFile, type ReplicaFile, type ReplicaFiles } from '../../render/replicaFiles';

/**
 * Test-only (vitest project `content`, which exists only when AIRSOFT_CONTENT is set): what the content report's runners
 * share. `node pipeline/content-check.mjs <item>` sets the variables, runs the runners and builds the report from what
 * they hand it in their tests' meta (vitest's JSON report carries it), as the balance report does.
 */

/** The process's environment, read without Node's types (the project compiles for the browser). */
export const ENV: Readonly<Record<string, string | undefined>> = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

/** The item `AIRSOFT_CONTENT_ITEM` names: a pool ID, a name or a Key (any case); undefined when it names none. */
export function contentItem(pool: Pool, named: string | undefined = ENV.AIRSOFT_CONTENT_ITEM): Asset | undefined {
  if (!named) return undefined;
  const want = named.trim().toLowerCase();
  return pool.assets.find((a) => a.id === want) ?? pool.assets.find((a) => a.name.toLowerCase() === want) ?? pool.assets.find((a) => a.key.toLowerCase() === want);
}

/** Whether `named` names a map ("map:woodland"), not a pool item. */
export const namesMap = (named: string | undefined = ENV.AIRSOFT_CONTENT_ITEM): boolean => /^map:/i.test(named?.trim() ?? '');

/**
 * The map "map:<id or label>" names (any case, spaces ignored: "map:woodland", "map:Neon Heights"), every map for
 * "map:all", or none.
 */
export function contentMaps(named: string | undefined = ENV.AIRSOFT_CONTENT_ITEM): MapEntry[] {
  if (!named || !namesMap(named)) return [];
  const want = named.trim().slice('map:'.length).replace(/\s+/g, '').toLowerCase();
  if (want === 'all') return [...MAPS];
  const m = MAPS.find((e) => e.id.toLowerCase() === want || e.label.replace(/\s+/g, '').toLowerCase() === want);
  return m ? [m] : [];
}

/** A number from the environment, or `fallback`. */
export function envNumber(name: string, fallback: number): number {
  const v = Number(ENV[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Vitest's test context as far as a runner needs it: the task whose meta carries what it found. */
export interface ReportContext {
  task: { meta: object };
}

/** Hands `value` to the report under `key` of the test's meta. */
export function reportMeta(ctx: ReportContext, key: string, value: unknown): void {
  (ctx.task.meta as Record<string, unknown>)[key] = value;
}

// Node's fs, without its types.
const nodeFs = 'node:fs';
const fs = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync(path: URL): Uint8Array; readdirSync(path: URL): string[]; existsSync(path: URL): boolean };

async function parse(url: URL): Promise<THREE.Object3D> {
  const buf = fs.readFileSync(url);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '');
  gltf.scene.animations = gltf.animations;
  return gltf.scene;
}

/** The replica model files the build ships (src/assets/models/replicas/, with their parts files), read from disk. */
export async function nodeReplicaFiles(): Promise<ReplicaFiles> {
  const dir = new URL('../../assets/models/replicas/', import.meta.url);
  const partsDir = new URL('../../assets/models/replicaParts/', import.meta.url);
  const files = new Map<string, ReplicaFile>();
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.glb'))) {
    const id = name.slice(0, -'.glb'.length);
    const parts = new URL(name, partsDir);
    files.set(id, prepareReplicaFile(id, await parse(new URL(name, dir)), fs.existsSync(parts) ? await parse(parts) : null));
  }
  return files;
}

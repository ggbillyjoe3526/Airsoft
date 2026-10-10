import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REPLICA_FILE } from '../config/assets';
import { loadGltfScene } from './externalModels';
import type { MaterialKey } from './replicaBuilder';

/**
 * Replica models from files (M101, config/assets.ts REPLICA_FILE, docs/CC0_ASSETS.md › Replica models). Each
 * `src/assets/models/replicas/<replica id>.glb` in the build loads once at start; the viewmodel, the menus' pictures and
 * the figures then draw that replica from it in place of its built-in model. Without a file, or with one that can't be
 * used (a warning says why), the built-in model is drawn as before.
 */
const FILES = import.meta.glob<string>('../assets/models/replicas/*.glb', { query: '?url', import: 'default', eager: true });

/**
 * The material names a file may use (any case) and the replica material each is drawn in: the game's own materials
 * (replicaBuilder.ts createMaterials), so the Realistic colours setting, the glow and the High finish apply as on the
 * built-in models. A material named after one of these keys draws in it too.
 */
const MATERIALS: Readonly<Record<string, MaterialKey>> = {
  cyberslab: 'cyberSlab',
  cyberframe: 'polymer',
  cyberline: 'cyberLine',
  cybercore: 'cyberCore',
  cybermetal: 'metal',
  polymer: 'polymer',
  furniture: 'furniture',
  detail: 'detail',
  metal: 'metal',
  rubber: 'rubber',
  stipple: 'stipple',
  accent: 'accent',
};

/** One material's shape of a part: positions and normals, no index, UVs or colours (the builders add their own). */
export interface ReplicaFilePiece {
  key: MaterialKey;
  geometry: THREE.BufferGeometry;
}

/** A replica's model from its file, every part in the replica's own space (metres, bore along -Z, up +Y). */
export interface ReplicaFile {
  /** The replica it draws (the file's name). */
  id: string;
  /** Everything but the magazine: one piece per material. */
  body: readonly ReplicaFilePiece[];
  /** The magazine, where it sits in the grip; empty when the file has none (the built-in magazine is drawn). */
  magazine: readonly ReplicaFilePiece[];
  /**
   * The cut-down model figures carry, in the figures' pistol frame (render/figureReplicas.ts addPistol): the back of the
   * slide at the origin, the bore on the axis. Empty when the file has none (the built-in shape is drawn).
   */
  figure: readonly ReplicaFilePiece[];
  /** The centre of the muzzle's face, where BBs leave. */
  muzzle: THREE.Vector3;
  /** Where a weapon torch clamps on, when the file marks it (the built-in layout draws the torch either way). */
  torchMount: THREE.Vector3 | null;
  /** Triangles in the hands (body and magazine) and on a figure. */
  triangles: { held: number; figure: number };
  dispose(): void;
}

/** The replica models this build has, by replica id. */
export type ReplicaFiles = ReadonlyMap<string, ReplicaFile>;

export const NO_REPLICA_FILES: ReplicaFiles = new Map();

/** This build's replica model files, by replica id (the file's name). */
export function replicaFileUrls(): Map<string, string> {
  const urls = new Map<string, string>();
  for (const [path, url] of Object.entries(FILES)) urls.set(path.slice(path.lastIndexOf('/') + 1, -'.glb'.length), url);
  return urls;
}

/** Loads every replica model in `urls` (this build's, by default); one that can't be used is left out with a warning. */
export async function loadReplicaFiles(urls: ReadonlyMap<string, string> = replicaFileUrls()): Promise<ReplicaFiles> {
  const files = new Map<string, ReplicaFile>();
  await Promise.all(
    [...urls].map(async ([id, url]) => {
      try {
        files.set(id, prepareReplicaFile(id, await loadGltfScene(url, REPLICA_FILE.warnBytes, `The ${id} replica model`)));
      } catch (err) {
        console.warn(`The ${id} replica model (${url}) could not be used, so its built-in model is drawn instead:`, err);
      }
    }),
  );
  return files;
}

/**
 * Takes a loaded file's scene apart into the replica's parts (REPLICA_FILE.nodes). Throws when it has no `Body` with a
 * mesh, no `Muzzle`, or a material the game can't draw in. Exported for the tests.
 */
export function prepareReplicaFile(id: string, scene: THREE.Object3D): ReplicaFile {
  const N = REPLICA_FILE.nodes;
  scene.updateMatrixWorld(true);
  const node = (name: string): THREE.Object3D | null => scene.getObjectByName(name) ?? null;
  const bodyNode = node(N.body);
  const muzzleNode = node(N.muzzle);
  if (!bodyNode) throw new Error(`no "${N.body}" object`);
  if (!muzzleNode) throw new Error(`no "${N.muzzle}" marker`);
  const magazineNode = node(N.magazine);
  const figureNode = node(N.figure);
  const torchNode = node(N.torchMount);

  const toScene = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const at = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toScene);
  const muzzle = at(muzzleNode);
  const body = pieces(bodyNode, toScene, [magazineNode, figureNode]);
  if (body.length === 0) throw new Error(`"${N.body}" has no mesh`);
  const magazine = magazineNode ? pieces(magazineNode, toScene, []) : [];
  // The figures' pistol frame: the back of the slide (the body's rearmost point at the bore's height or above) at the
  // origin, the bore on the axis.
  let figure: ReplicaFilePiece[] = [];
  if (figureNode) {
    const own = new THREE.Matrix4().copy(figureNode.matrixWorld).invert();
    figure = pieces(figureNode, new THREE.Matrix4().makeTranslation(0, -muzzle.y, -slideBack(body, muzzle.y)).multiply(own), []);
  }
  const held = triangles(body) + triangles(magazine);
  const onFigure = triangles(figure);
  if (held > REPLICA_FILE.warnTriangles) console.warn(`The ${id} replica model has ${held} triangles in the hands, over its ${REPLICA_FILE.warnTriangles} budget (docs/CC0_ASSETS.md).`);
  if (onFigure > REPLICA_FILE.warnFigureTriangles) console.warn(`The ${id} replica model's figure has ${onFigure} triangles, over its ${REPLICA_FILE.warnFigureTriangles} budget (docs/CC0_ASSETS.md).`);
  const all = [...body, ...magazine, ...figure];
  return {
    id,
    body,
    magazine,
    figure,
    muzzle,
    torchMount: torchNode ? at(torchNode) : null,
    triangles: { held, figure: onFigure },
    dispose: () => {
      for (const p of all) p.geometry.dispose();
    },
  };
}

/**
 * The meshes under `root` (not under any of `skip`), each moved by its place in the scene and then `frame`, merged into
 * one piece per replica material.
 */
function pieces(root: THREE.Object3D, frame: THREE.Matrix4, skip: readonly (THREE.Object3D | null)[]): ReplicaFilePiece[] {
  const byKey = new Map<MaterialKey, THREE.BufferGeometry[]>();
  const place = new THREE.Matrix4();
  const visit = (o: THREE.Object3D): void => {
    if (o !== root && skip.includes(o)) return;
    if (o instanceof THREE.Mesh) {
      const material = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material;
      const key = MATERIALS[material.name.toLowerCase()];
      if (!key) throw new Error(`"${o.name}" uses the material "${material.name}", which the game can't draw in (one of: ${Object.keys(MATERIALS).join(', ')})`);
      const source = o.geometry as THREE.BufferGeometry;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', source.getAttribute('position').clone());
      if (source.getAttribute('normal')) g.setAttribute('normal', source.getAttribute('normal').clone());
      if (source.index) g.setIndex(source.index.clone());
      const flat = g.index ? g.toNonIndexed() : g;
      if (flat !== g) g.dispose();
      if (!flat.getAttribute('normal')) flat.computeVertexNormals();
      flat.applyMatrix4(place.multiplyMatrices(frame, o.matrixWorld));
      let list = byKey.get(key);
      if (!list) byKey.set(key, (list = []));
      list.push(flat);
    }
    for (const child of o.children) visit(child);
  };
  visit(root);
  const out: ReplicaFilePiece[] = [];
  for (const [key, geos] of byKey) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos);
    if (geos.length > 1) for (const g of geos) g.dispose();
    if (merged) out.push({ key, geometry: merged });
  }
  return out;
}

/** The rearmost point (largest Z) of `body` at height `bore` or above: the back of the slide. */
function slideBack(body: readonly ReplicaFilePiece[], bore: number): number {
  let back = -Infinity;
  for (const p of body) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) >= bore) back = Math.max(back, pos.getZ(i));
  }
  return Number.isFinite(back) ? back : 0;
}

function triangles(list: readonly ReplicaFilePiece[]): number {
  return list.reduce((n, p) => n + p.geometry.getAttribute('position').count / 3, 0);
}

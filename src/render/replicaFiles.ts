import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REPLICA_FILE } from '../config/assets';
import { FIGURE } from '../config/characters';
import { loadGltfScene } from './externalModels';
import type { MaterialKey } from './replicaBuilder';

/**
 * Replica models from files (M101, config/assets.ts REPLICA_FILE, docs/CC0_ASSETS.md › Replica models). Each
 * `src/assets/models/replicas/<replica id>.glb` in the build loads once at start; the viewmodel, the menus' pictures and
 * the figures then draw that replica from it in place of its built-in model. Without a file, or with one that can't be
 * used (a warning says why), the built-in model is drawn as before.
 */
const FILES = import.meta.glob<string>('../assets/models/replicas/*.glb', { query: '?url', import: 'default', eager: true });
/** A replica's parts (optics, grips, magazines, muzzle devices …) as `replicaParts/<replica id>.glb`, beside its model (RM1). */
const PART_FILES = import.meta.glob<string>('../assets/models/replicaParts/*.glb', { query: '?url', import: 'default', eager: true });

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
  // RM1's rifle and Gas Pistol: the body in the scheme's body colour (as the built-in polymer), the glass, the BBs at
  // the feed lip, and the muzzle's tip ring (orange with the setting, else rubber: replicaModels.ts buildFromFile).
  body: 'polymer',
  bb: 'bb',
  lens: 'lens',
  laserlens: 'laserLens',
  torchlens: 'torchLens',
  tip: 'orange',
};

/**
 * The colour a material takes on a figure (render/figureReplicas.ts), by its name in the file: a figure's replica is
 * painted in roles, and the same game material can be the body on one replica and the frame on another.
 */
const FIGURE_ROLES: Readonly<Record<string, FigureRole>> = {
  cyberslab: 'body',
  cyberframe: 'furniture',
  cyberline: 'accent',
  cybercore: 'accent',
  cybermetal: 'steel',
  body: 'body',
  polymer: 'body',
  furniture: 'furniture',
  accent: 'accent',
  metal: 'steel',
};

/** The colour roles of a replica on a figure (figureReplicas.ts FigureReplicaColours). */
export type FigureRole = 'body' | 'furniture' | 'detail' | 'accent' | 'steel';

/** One material's shape of a part: positions and normals, no index, UVs or colours (the builders add their own). */
export interface ReplicaFilePiece {
  key: MaterialKey;
  geometry: THREE.BufferGeometry;
  /** Its colour on a figure (by the file's material name; detail when it names none). */
  role: FigureRole;
}

/** A moving part's shape: as a piece, with the bone (an index into ReplicaFileRig.bones) that moves it. */
export interface ReplicaRigPiece extends ReplicaFilePiece {
  bone: number;
}

/**
 * A file's moving parts (RM1): the bones its animations move, other than the magazine's (the viewmodel moves the
 * magazine itself), their parts' shapes and the animations, renamed to the bones as the game builds them
 * (`rig_<bone>`, replicaRig.ts).
 */
export interface ReplicaFileRig {
  /** Where the bones hang from, in the replica's space (the file's root bone). */
  root: THREE.Matrix4;
  /** Each bone's name and rest place relative to the root. */
  bones: readonly { name: string; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[];
  /** The moving parts' shapes in the replica's space at rest. */
  pieces: readonly ReplicaRigPiece[];
  /** The animations by name ('Fire', 'Reload', …), each holding only the tracks that move something in it. */
  clips: ReadonlyMap<string, THREE.AnimationClip>;
}

/** A replica's model from its file, every part in the replica's own space (metres, bore along -Z, up +Y). */
export interface ReplicaFile {
  /** The replica it draws (the file's name). */
  id: string;
  /** Everything but the magazine: one piece per material. */
  body: readonly ReplicaFilePiece[];
  /** The magazine, where it sits in the grip; empty when the file has none (the built-in magazine is drawn). */
  magazine: readonly ReplicaFilePiece[];
  /** The rifle's flash hider (its bare muzzle device), in the replica's space; empty when the file has none. */
  flashHider: readonly ReplicaFilePiece[];
  /** The moving parts and their animations; null when the file has none. */
  rig: ReplicaFileRig | null;
  /**
   * The parts from `replicaParts/<id>.glb` by the game's part name ('optic:redDot', 'magazine:hiCap', 'muzzle:silencer'
   * …), each in the replica's space where it fits; empty without that file. A part a file lacks is drawn built-in.
   */
  parts: ReadonlyMap<string, readonly ReplicaFilePiece[]>;
  /** The file paints its own muzzle tip (a `Tip` material): no orange disc is added over it. */
  ownTip: boolean;
  /**
   * The cut-down model figures carry, in the figures' pistol frame (render/figureReplicas.ts addPistol): the back of the
   * slide at the origin, the bore on the axis. Empty when the file has none (the built-in shape is drawn).
   */
  figure: readonly ReplicaFilePiece[];
  /** The centre of the muzzle's face, where BBs leave. */
  muzzle: THREE.Vector3;
  /** Where a weapon torch clamps on, when the file marks it (the built-in layout draws the torch either way). */
  torchMount: THREE.Vector3 | null;
  /** Triangles in the hands (body, moving parts, flash hider and magazine) and on a figure. */
  triangles: { held: number; figure: number };
  dispose(): void;
}

/** The replica models this build has, by replica id. */
export type ReplicaFiles = ReadonlyMap<string, ReplicaFile>;

export const NO_REPLICA_FILES: ReplicaFiles = new Map();

const byId = (files: Record<string, string>): Map<string, string> => {
  const urls = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) urls.set(path.slice(path.lastIndexOf('/') + 1, -'.glb'.length), url);
  return urls;
};

/** This build's replica model files, by replica id (the file's name). */
export function replicaFileUrls(): Map<string, string> {
  return byId(FILES);
}

/** This build's replica part files, by the replica id they fit (the file's name). */
export function replicaPartFileUrls(): Map<string, string> {
  return byId(PART_FILES);
}

/**
 * Loads every replica model in `urls` (this build's, by default) with its parts file from `partUrls`; one that can't be
 * used is left out with a warning, and a parts file that can't be used leaves that replica's built-in parts.
 */
export async function loadReplicaFiles(urls: ReadonlyMap<string, string> = replicaFileUrls(), partUrls: ReadonlyMap<string, string> = replicaPartFileUrls()): Promise<ReplicaFiles> {
  const files = new Map<string, ReplicaFile>();
  await Promise.all(
    [...urls].map(async ([id, url]) => {
      try {
        const scene = await loadGltfScene(url, budget(REPLICA_FILE.warnBytes, id), `The ${id} replica model`);
        const partsUrl = partUrls.get(id);
        let parts: THREE.Object3D | null = null;
        if (partsUrl) {
          try {
            parts = await loadGltfScene(partsUrl, budget(REPLICA_FILE.warnPartBytes, id), `The ${id} replica's parts`);
          } catch (err) {
            console.warn(`The ${id} replica's parts (${partsUrl}) could not be used, so its built-in parts are drawn instead:`, err);
          }
        }
        files.set(id, prepareReplicaFile(id, scene, parts));
      } catch (err) {
        console.warn(`The ${id} replica model (${url}) could not be used, so its built-in model is drawn instead:`, err);
      }
    }),
  );
  return files;
}

/** A budget that is a number, or one per replica id with a `default`. */
function budget(b: number | Readonly<Record<string, number>>, id: string): number {
  return typeof b === 'number' ? b : (b[id] ?? b.default!);
}

/**
 * Takes a loaded file's scene apart into the replica's parts (REPLICA_FILE.nodes), with its parts file's `partsScene`
 * when there is one. Throws when it has no `Body` with a mesh, no `Muzzle`, or a material the game can't draw in.
 * Exported for the tests.
 */
export function prepareReplicaFile(id: string, scene: THREE.Object3D, partsScene: THREE.Object3D | null = null): ReplicaFile {
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
  const flashHiderNode = node(N.flashHider);

  const toScene = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const at = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toScene);
  const muzzle = at(muzzleNode);
  const own = pieces(bodyNode, toScene, [magazineNode, figureNode]);
  for (const p of own) p.geometry.dispose();
  if (own.length === 0) throw new Error(`"${N.body}" has no mesh`);
  const rig = rigOf(scene, toScene, magazineNode, figureNode);
  // The body: every mesh but the magazine, the figure's, the flash hider and the moving parts (the Cyber Pistol's is
  // all under `Body`; a rigged file's slide hangs from its bone).
  const body = pieces(scene, toScene, [magazineNode, figureNode, flashHiderNode, ...(rig?.nodes ?? [])]);
  const magazine = magazineNode ? pieces(magazineNode, toScene, []) : [];
  const flashHider = flashHiderNode ? pieces(flashHiderNode, toScene, []) : [];
  // The figures' frame: the pistol's (the back of the slide, the body's rearmost point at the bore's height or above,
  // at the origin), or the rifle's (its butt at the origin, its muzzle FIGURE.rifle.length ahead); the bore on the axis.
  let figure: ReplicaFilePiece[] = [];
  if (figureNode) {
    const toFigure = new THREE.Matrix4().copy(figureNode.matrixWorld).invert();
    if (REPLICA_FILE.rifles.includes(id)) {
      const butt = rearmost(pieces(figureNode, toFigure, []));
      const scale = FIGURE.rifle.length / Math.max(1e-3, butt - muzzle.z);
      const frame = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(0, -muzzle.y, -butt)).multiply(toFigure);
      figure = pieces(figureNode, frame, []);
    } else {
      // The slide may be a moving part (the gas pistol's), so it counts too.
      const back = slideBack([...body, ...(rig?.file.pieces ?? [])], muzzle.y);
      figure = pieces(figureNode, new THREE.Matrix4().makeTranslation(0, -muzzle.y, -back).multiply(toFigure), []);
    }
  }
  const parts = partsScene ? partsOf(partsScene) : new Map<string, ReplicaFilePiece[]>();
  const held = triangles(body) + triangles(magazine) + triangles(flashHider) + triangles(rig?.file.pieces ?? []);
  const onFigure = triangles(figure);
  const heldBudget = budget(REPLICA_FILE.warnTriangles, id);
  if (held > heldBudget) console.warn(`The ${id} replica model has ${held} triangles in the hands, over its ${heldBudget} budget (docs/CC0_ASSETS.md).`);
  if (onFigure > REPLICA_FILE.warnFigureTriangles) console.warn(`The ${id} replica model's figure has ${onFigure} triangles, over its ${REPLICA_FILE.warnFigureTriangles} budget (docs/CC0_ASSETS.md).`);
  const all = [...body, ...magazine, ...flashHider, ...figure, ...(rig?.file.pieces ?? []), ...[...parts.values()].flat()];
  return {
    id,
    body,
    magazine,
    flashHider,
    rig: rig?.file ?? null,
    parts,
    ownTip: all.some((p) => p.key === 'orange'),
    figure,
    muzzle,
    torchMount: torchNode ? at(torchNode) : null,
    triangles: { held, figure: onFigure },
    dispose: () => {
      for (const p of all) p.geometry.dispose();
    },
  };
}

/** A track's values change: it moves something (an exporter writes every bone's track into every clip). */
function moves(track: THREE.KeyframeTrack): boolean {
  const v = track.values;
  const n = v.length / track.times.length;
  for (let i = n; i < v.length; i++) if (Math.abs(v[i]! - v[i % n]!) > 1e-5) return true;
  return false;
}

/**
 * The moving parts of a file (RM1): the nodes its animations move, other than the magazine's, which must hang from one
 * parent (the root bone). Null when nothing moves or they don't share a parent (a warning says so).
 */
function rigOf(scene: THREE.Object3D, toScene: THREE.Matrix4, magazine: THREE.Object3D | null, figure: THREE.Object3D | null): { file: ReplicaFileRig; nodes: THREE.Object3D[] } | null {
  const clips = scene.animations;
  const moved = new Map<string, THREE.Object3D>();
  const holdsMagazine = (o: THREE.Object3D): boolean => magazine !== null && (o === magazine || o.getObjectById(magazine.id) !== undefined);
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
      const target = scene.getObjectByName(nodeName);
      if (target && !holdsMagazine(target) && moves(track)) moved.set(nodeName, target);
    }
  }
  if (moved.size === 0) return null;
  const nodes = [...moved.values()];
  const parent = nodes[0]!.parent;
  if (!parent || nodes.some((n) => n.parent !== parent)) {
    console.warn('A replica model\'s moving parts don\'t hang from one bone, so they are drawn still.');
    return null;
  }
  const bones = nodes.map((n) => ({ name: n.name, position: n.position.clone(), quaternion: n.quaternion.clone(), scale: n.scale.clone() }));
  const rigPieces: ReplicaRigPiece[] = [];
  nodes.forEach((n, i) => {
    for (const p of pieces(n, toScene, [magazine, figure])) rigPieces.push({ ...p, bone: i });
  });
  const renamed = new Map<string, THREE.AnimationClip>();
  for (const clip of clips) {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      if (!moved.has(nodeName) || !moves(track)) continue;
      const copy = track.clone();
      copy.name = `${RIG_PREFIX}${nodeName}.${propertyName}`;
      tracks.push(copy);
    }
    if (tracks.length > 0) renamed.set(clip.name, new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  return {
    file: { root: new THREE.Matrix4().multiplyMatrices(toScene, parent.matrixWorld), bones, pieces: rigPieces, clips: renamed },
    nodes,
  };
}

/** What the game names a moving part's bone: `rig_<the file's bone>` (three's track names can't take a colon). */
export const RIG_PREFIX = 'rig_';

/**
 * A parts file's parts (RM1): each top-level object named `<kind>_<id>` ('optic_redDot', 'muzzle_silencer' …) is the
 * part `<kind>:<id>`, in the replica's space where it fits; its `<name>_Figure` copy (a figure's) is not drawn in the
 * hands, and its markers have no meshes.
 */
function partsOf(scene: THREE.Object3D): Map<string, ReplicaFilePiece[]> {
  scene.updateMatrixWorld(true);
  const toScene = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const parts = new Map<string, ReplicaFilePiece[]>();
  for (const child of scene.children) {
    const match = /^([a-z]+)_([A-Za-z0-9]+)$/.exec(child.name);
    if (!match) continue;
    const figure = child.getObjectByName(`${child.name}_Figure`) ?? null;
    const list = pieces(child, toScene, [figure]);
    if (list.length > 0) parts.set(`${match[1]}:${match[2]}`, list);
  }
  return parts;
}

/**
 * The meshes under `root` (not under any of `skip`), each moved by its place in the scene and then `frame`, merged into
 * one piece per replica material.
 */
function pieces(root: THREE.Object3D, frame: THREE.Matrix4, skip: readonly (THREE.Object3D | null)[]): ReplicaFilePiece[] {
  const byKey = new Map<string, { key: MaterialKey; role: FigureRole; geos: THREE.BufferGeometry[] }>();
  const place = new THREE.Matrix4();
  const visit = (o: THREE.Object3D): void => {
    if (o !== root && skip.includes(o)) return;
    if (o.name.endsWith('_Figure') && o !== root) return;
    if (o instanceof THREE.Mesh) {
      const material = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material;
      const name = material.name.toLowerCase();
      const key = MATERIALS[name];
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
      const role = FIGURE_ROLES[name] ?? 'detail';
      const group = `${key}|${role}`;
      let list = byKey.get(group);
      if (!list) byKey.set(group, (list = { key, role, geos: [] }));
      list.geos.push(flat);
    }
    for (const child of o.children) visit(child);
  };
  visit(root);
  const out: ReplicaFilePiece[] = [];
  for (const { key, role, geos } of byKey.values()) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos);
    if (geos.length > 1) for (const g of geos) g.dispose();
    if (merged) out.push({ key, role, geometry: merged });
  }
  return out;
}

/** The rearmost point (largest Z) of `list`: a rifle's butt. */
function rearmost(list: readonly ReplicaFilePiece[]): number {
  let back = -Infinity;
  for (const p of list) {
    const pos = p.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) back = Math.max(back, pos.getZ(i));
    p.geometry.dispose();
  }
  return Number.isFinite(back) ? back : 0;
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

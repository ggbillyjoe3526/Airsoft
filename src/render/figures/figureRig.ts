import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIGURE_HIT_SHAPES, FIGURE_RIG, FIGURE_RIG_KINDS, type FigureRigKind } from '../../config/figureRig';
import type { FigureBody, FigureLegs } from '../../config/hits';
import { loadGltfScene } from './externalModels';
import { figureBodyFrom } from './figureBody';
import { figureLegsFrom, legsWithSpares } from './figureLegs';
import { figureFinish } from './figureRigFinish';
import { RiggedFigure, type RiggedFigureSetup } from './riggedFigure';
import { ThrownMagazines } from './thrownMagazines';
import { BODY_CLIPS, FIRE_CLIPS, type MagazineTimes, OPTIONAL_CLIPS, POSE_CLIPS, POSE_SLOT, type PoseClipTable, type PoseHold } from './figurePose';

/**
 * The rigged bot figures from Blender (BF1; config/figureRig.ts): each kind's file and sidecar loaded once, taken apart
 * into what every figure of that kind shares. The bones at rest (cloned per figure), the materials (copied per figure,
 * for its team colour and fade), the meshes merged per level of detail and part set into one geometry with a group per
 * material (a figure is one draw per material, not one per file mesh), the clips split into the legs' and the upper
 * body's tracks, and the sidecar's replica and magazine places in Three's axes. render/figures/riggedFigure.ts draws a figure
 * from it.
 */

const GLB_FILES = import.meta.glob<string>(['../../assets/models/characters/human.glb', '../../assets/models/characters/robot.glb'], { query: '?url', import: 'default', eager: true });
const SIDECARS = import.meta.glob<FigureSidecar>(['../../assets/models/characters/human.json', '../../assets/models/characters/robot.json'], { import: 'default' });

/** A 4x4 matrix in the sidecar: four rows. */
type Rows = readonly (readonly number[])[];

/** The export's sidecar (`<kind>.json`, tools/blender/bot-figure/README.md), the parts the game reads. */
export interface FigureSidecar {
  heightMetres: number;
  clips: readonly { name: string; seconds: number; loop: boolean; upperBodyOnly: boolean; speed: number | null }[];
  firstPerson?: { hide?: readonly string[] };
  /** Where each replica glb sits in the fist: Blender axes, in the Grip_R bone's frame. */
  replicaOnGrip: Readonly<Record<PoseHold, Rows>>;
  /** The reload clips' magazines, by clip name. */
  magazineInHand?: Readonly<
    Record<
      string,
      {
        replica: PoseHold;
        bone: string;
        from: number;
        to: number;
        magazineOnBone: Rows;
        replicaMagazineHidden: readonly [number, number];
        oldMagazine?: { from: number; release: number; releaseVelocity: readonly number[]; releaseSpin: readonly number[]; magazineOnBone: Rows; gravity: number; lifetime: number };
      }
    >
  >;
}

/** A reload's magazines in Three's axes: when they show (shares of the clip), where they sit on the hand, how the old one flies. */
export interface FigureMagazines {
  times: MagazineTimes;
  /** The bone the magazines ride on (the support hand). */
  bone: string;
  /** The fresh and the old magazine's frame on the bone (the replica magazine bone's frame, as the replica's file has it). */
  fresh: THREE.Matrix4;
  old: THREE.Matrix4;
  /** The old magazine's throw in the model's space (m/s, and rad/s as axis times rate), its fall and how long it lies. */
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  gravity: number;
  lifetime: number;
}

/** One kind of figure (the human or the robot), shared by every figure of it. */
export interface FigureRig {
  kind: FigureRigKind;
  /** The bone tree at rest (the file's `Rig` with its meshes taken out), cloned for each figure. */
  rig: THREE.Object3D;
  /** The skin's bones by name, in its order, with their inverse bind matrices; the skinned meshes' bind matrix. */
  boneNames: readonly string[];
  boneInverses: readonly THREE.Matrix4[];
  bindMatrix: THREE.Matrix4;
  /** The file's materials; each figure copies them. Merged geometries' groups index this list. */
  materials: readonly THREE.Material[];
  /** The parts there are, by role (FIGURE_RIG.parts): what geometry() takes. */
  parts: readonly string[];
  /**
   * The parts `names` at level of detail `lod` (0 the full meshes) merged into one geometry, a group per material; made
   * once per set and kept. A part a level lacks (the radio has no LOD2) is left out there.
   */
  geometry(lod: number, names: readonly string[]): THREE.BufferGeometry;
  /**
   * Per clip slot (figurePose.ts POSE_CLIPS): the legs' tracks and the upper body's, or null where there are none (or
   * the file lacks an optional clip: OPTIONAL_CLIPS).
   */
  lower: readonly (THREE.AnimationClip | null)[];
  upper: readonly (THREE.AnimationClip | null)[];
  /** The slots' lengths and paces. */
  table: PoseClipTable;
  /** Each replica's place in the fist, as a child of the grip bone (Three's axes). */
  replicaOnGrip: Readonly<Record<PoseHold, THREE.Matrix4>>;
  /** Each reload's magazines, by the replica it reloads; null when the sidecar has none. */
  magazines: Readonly<Record<PoseHold, FigureMagazines | null>>;
  /** The hips' turn under the aim clips (their still pelvis), and the turn of the hips' parent in the model. */
  hipsUnderAim: THREE.Quaternion;
  aboveHips: THREE.Quaternion;
  /**
   * How far each aim clip turns the replica's bore off straight ahead, about the model's up (radians; the rifle's
   * bladed stance points it a few degrees to the side): the figure twists the upper body back by it, so it points where
   * the shot goes.
   */
  aimYaw: Readonly<Record<PoseHold, number>>;
  /** Triangles at each level of detail, every part shown. */
  triangles: readonly number[];
  /** Its legs' clips as plain numbers, for the hit volume (IM8, render/figures/figureLegs.ts). */
  legs: FigureLegs;
  /** Its upper body's hit shape through the same clips, for the hit volume (HV1, render/figures/figureBody.ts). */
  body: FigureBody;
  dispose(): void;
}

/**
 * Both kinds, loaded together, with the drawing that plays them: this module and the ones below it are a chunk of
 * their own, loaded with the figure files as the game starts (ModelFiles), so the game's own chunk doesn't carry them.
 */
export interface FigureRigs {
  readonly human: FigureRig;
  readonly robot: FigureRig;
  /**
   * The legs a match's hit volume takes (IM8, matchSession.ts): the human's, which the robot shares but for a couple of
   * centimetres crouched, with any clip the human's file lacks from the robot's.
   */
  readonly legs: FigureLegs;
  /** The upper bodies a match's hit volume takes (HV1), by figure kind (Character.figure: the human's, then the robot's). */
  readonly bodies: readonly FigureBody[];
  /** One figure drawn from a rig (render/figures/riggedFigure.ts). */
  figure(setup: RiggedFigureSetup): RiggedFigure;
  /** The thrown-away magazines of a match's figures (render/figures/thrownMagazines.ts). */
  thrownMagazines(): ThrownMagazines;
  dispose(): void;
}

/** Both kinds as FigureRigs, with `dispose` freeing them (or whatever the caller says, for shared test files). */
export function figureRigs(human: FigureRig, robot: FigureRig, dispose: () => void): FigureRigs {
  return { human, robot, legs: legsWithSpares(human.legs, robot.legs), bodies: [human.body, robot.body], figure: (setup) => new RiggedFigure(setup), thrownMagazines: () => new ThrownMagazines(), dispose };
}

/** The URLs of `kind`'s file and sidecar loader in this build, or null when it lacks either. */
function filesOf(kind: FigureRigKind): { glb: string; sidecar: () => Promise<FigureSidecar> } | null {
  const glb = Object.entries(GLB_FILES).find(([path]) => path.endsWith(`/${kind}.glb`))?.[1];
  const sidecar = Object.entries(SIDECARS).find(([path]) => path.endsWith(`/${kind}.json`))?.[1];
  return glb && sidecar ? { glb, sidecar } : null;
}

/**
 * Loads both figure kinds. Resolves to null (with a warning) when either is missing or can't be used: the built-in
 * figures are drawn then.
 */
export async function loadFigureRigs(): Promise<FigureRigs | null> {
  const made: FigureRig[] = [];
  try {
    for (const kind of FIGURE_RIG_KINDS) {
      const files = filesOf(kind);
      if (!files) throw new Error(`no ${kind}.glb and ${kind}.json in src/assets/models/characters/`);
      const [scene, sidecar] = await Promise.all([loadGltfScene(files.glb, FIGURE_RIG.warnBytes, `The ${kind} figure`), files.sidecar()]);
      made.push(prepareFigureRig(kind, scene, sidecar));
    }
  } catch (err) {
    for (const r of made) r.dispose();
    console.warn('The rigged figures could not be used, so the built-in figures are drawn instead:', err);
    return null;
  }
  const [human, robot] = made as [FigureRig, FigureRig];
  return figureRigs(human, robot, () => {
    human.dispose();
    robot.dispose();
  });
}

/** Sidecar rows (Blender axes) as a matrix. */
const rows = (r: Rows): THREE.Matrix4 => new THREE.Matrix4().set(...(r.flat() as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));
/** A replica file's own axes (Three's: Y up, bore along -Z) into Blender's (Z up, bore along +Y). */
const THREE_TO_BLENDER = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
/** A vector in Blender's axes (the sidecar's figure space) in Three's. */
const fromBlender = (v: readonly number[]): THREE.Vector3 => new THREE.Vector3(v[0] ?? 0, v[2] ?? 0, -(v[1] ?? 0));

/** Track values that never leave `rest` (a quaternion's sign aside). */
function stillAt(track: THREE.KeyframeTrack, rest: readonly number[]): boolean {
  const v = track.values;
  const n = rest.length;
  if (v.length % n !== 0) return false;
  const quaternion = n === 4;
  for (let k = 0; k < v.length; k += n) {
    let same = true;
    let flipped = quaternion;
    for (let j = 0; j < n; j++) {
      if (Math.abs(v[k + j]! - rest[j]!) > 1e-5) same = false;
      if (flipped && Math.abs(-v[k + j]! - rest[j]!) > 1e-5) flipped = false;
    }
    if (!same && !flipped) return false;
  }
  return true;
}

/** The rest value of `property` on `bone`, as the track lays it out. */
function restOf(bone: THREE.Object3D, property: string): number[] | null {
  if (property === 'position') return bone.position.toArray();
  if (property === 'quaternion') return bone.quaternion.toArray();
  if (property === 'scale') return bone.scale.toArray();
  return null;
}

/** A track whose values all sit within `eps` of `value` per component (an additive clip's untouched bones). */
function flatAt(track: THREE.KeyframeTrack, value: readonly number[], eps = 1e-5): boolean {
  const v = track.values;
  const n = value.length;
  for (let k = 0; k < v.length; k++) if (Math.abs(v[k]! - value[k % n]!) > eps) return false;
  return true;
}

/**
 * Takes a loaded figure file (`scene`, its clips on `scene.animations`) and its sidecar apart into the shared parts of
 * every figure of `kind`. Throws when a part, bone or clip the game needs is missing. Exported for the tests.
 */
export function prepareFigureRig(kind: FigureRigKind, scene: THREE.Object3D, sidecar: FigureSidecar): FigureRig {
  scene.updateMatrixWorld(true);
  const skinned: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) skinned.push(o);
  });
  const first = skinned[0];
  if (!first) throw new Error(`the ${kind} figure has no skinned mesh`);
  const skeleton = first.skeleton;
  const rootBone = skeleton.bones.find((b) => !(b.parent instanceof THREE.Bone));
  if (!rootBone?.parent) throw new Error(`the ${kind} figure's skeleton has no root`);
  for (const name of [FIGURE_RIG.bones.hips, FIGURE_RIG.bones.spine, FIGURE_RIG.bones.grip, FIGURE_RIG.bones.hand, ...FIGURE_RIG.bones.arms]) {
    if (!skeleton.getBoneByName(name)) throw new Error(`the ${kind} figure has no "${name}" bone`);
  }

  // The meshes of each part, by its name (a node per part, each primitive a mesh of its own).
  const meshesOf = new Map<string, THREE.SkinnedMesh[]>();
  for (const mesh of skinned) {
    let node: THREE.Object3D | null = mesh;
    while (node && node.parent && !(node.parent instanceof THREE.Bone) && node.parent !== rootBone.parent) node = node.parent;
    const name = node?.name ?? mesh.name;
    const list = meshesOf.get(name) ?? [];
    list.push(mesh);
    meshesOf.set(name, list);
    if (mesh.skeleton !== skeleton) throw new Error(`the ${kind} figure's "${name}" has a skeleton of its own`);
  }
  const roles = FIGURE_RIG.parts[kind] as { body: readonly string[]; head: readonly string[]; pack?: string; radio?: string };
  const parts = [...roles.body, ...roles.head, ...(roles.pack ? [roles.pack] : []), ...(roles.radio ? [roles.radio] : [])];
  for (const part of [...roles.body, roles.head[0]!]) if (!meshesOf.has(part)) throw new Error(`the ${kind} figure has no "${part}"`);

  // The materials, in a fixed order, each once; the plain ones drawn as one (render/figures/figureRigFinish.ts, BD1).
  const fileMaterials: THREE.Material[] = [];
  for (const mesh of skinned) {
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (!fileMaterials.includes(m)) fileMaterials.push(m);
  }
  const finish = figureFinish(fileMaterials, FIGURE_RIG.teamMaterialPrefix);
  const materials = finish ? [...finish.materials] : fileMaterials;
  const indexOf = (m: THREE.Material): number => (finish ? finish.indexOf(m) : materials.indexOf(m));
  const geometryOf = (mesh: THREE.SkinnedMesh): THREE.BufferGeometry => (finish ? finish.geometryOf(mesh) : mesh.geometry);

  const merged = new Map<string, THREE.BufferGeometry>();
  const suffix = (lod: number): string => (lod === 0 ? '' : `_LOD${lod}`);
  const geometry = (lod: number, names: readonly string[]): THREE.BufferGeometry => {
    const key = `${lod}|${names.join(',')}`;
    const kept = merged.get(key);
    if (kept) return kept;
    const byMaterial = new Map<number, THREE.BufferGeometry[]>();
    for (const name of names) {
      for (const mesh of meshesOf.get(name + suffix(lod)) ?? []) {
        const index = indexOf(mesh.material as THREE.Material);
        const list = byMaterial.get(index) ?? [];
        list.push(geometryOf(mesh));
        byMaterial.set(index, list);
      }
    }
    const order = [...byMaterial.keys()].sort((a, b) => a - b);
    const each = order.map((i) => mergeGeometries(byMaterial.get(i)!, false));
    if (each.some((g) => !g)) throw new Error(`the ${kind} figure's ${names.join(', ')} can't be merged (their attributes differ)`);
    const one = mergeGeometries(each as THREE.BufferGeometry[], true);
    for (const g of each) g?.dispose();
    if (!one) throw new Error(`the ${kind} figure's ${names.join(', ')} can't be merged`);
    one.groups.forEach((g, k) => (g.materialIndex = order[k]!));
    merged.set(key, one);
    return one;
  };

  // The clips, by slot: tracks at their bone's rest value are dropped (the mixer leaves an undriven bone at rest, so
  // nothing changes, at a third of the work); the whole-body clips split into legs and upper body; the trigger presses
  // made additive on their first frame. A file without an optional clip leaves its slot empty.
  const lowerBones = new Set(FIGURE_RIG.lowerBones);
  const clipOf = new Map(scene.animations.map((c) => [c.name, c] as const));
  const infoOf = new Map(sidecar.clips.map((c) => [c.name, c] as const));
  const boneOf = (name: string): THREE.Bone | undefined => skeleton.getBoneByName(name);
  const lower: (THREE.AnimationClip | null)[] = [];
  const upper: (THREE.AnimationClip | null)[] = [];
  const table: { seconds: number; speed: number | null }[] = [];
  POSE_CLIPS.forEach((name, slot) => {
    const clip = clipOf.get(name);
    if (!clip && OPTIONAL_CLIPS.has(name)) {
      table.push({ seconds: 0, speed: null });
      lower.push(null);
      upper.push(null);
      return;
    }
    if (!clip) throw new Error(`the ${kind} figure has no "${name}" clip`);
    const info = infoOf.get(name);
    table.push({ seconds: info?.seconds ?? clip.duration, speed: info?.speed ?? null });
    const legs: THREE.KeyframeTrack[] = [];
    const body: THREE.KeyframeTrack[] = [];
    for (const track of clip.tracks) {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const bone = boneOf(nodeName);
      const rest = bone ? restOf(bone, propertyName) : null;
      if (!bone || (rest && stillAt(track, rest))) continue;
      (lowerBones.has(nodeName) ? legs : body).push(track.clone());
    }
    const fire = slot >= POSE_CLIPS.length - FIRE_CLIPS;
    lower.push(slot < BODY_CLIPS && legs.length > 0 ? new THREE.AnimationClip(`${name}:legs`, clip.duration, legs) : null);
    if (fire) {
      const additive = THREE.AnimationUtils.makeClipAdditive(new THREE.AnimationClip(`${name}:press`, clip.duration, body), 0);
      additive.tracks = additive.tracks.filter((t) => !flatAt(t, t.getValueSize() === 4 ? [0, 0, 0, 1] : [0, 0, 0]));
      upper.push(additive.tracks.length > 0 ? additive : null);
    } else upper.push(body.length > 0 ? new THREE.AnimationClip(`${name}:upper`, clip.duration, body) : null);
  });

  // The hips under the aim clips: the still pelvis their upper body was posed over.
  const hipsBone = boneOf(FIGURE_RIG.bones.hips)!;
  const hipsUnderAim = hipsBone.quaternion.clone();
  const aimHips = clipOf.get('Rifle_Aim')?.tracks.find((t) => t.name === `${FIGURE_RIG.bones.hips}.quaternion`);
  if (aimHips) hipsUnderAim.fromArray(aimHips.values, 0).normalize();
  const aboveHips = new THREE.Quaternion();
  hipsBone.parent!.getWorldQuaternion(aboveHips);
  const sceneTurn = scene.getWorldQuaternion(new THREE.Quaternion()).invert();
  aboveHips.premultiply(sceneTurn);

  const hold = (h: PoseHold): THREE.Matrix4 => {
    const r = sidecar.replicaOnGrip[h];
    if (!r) throw new Error(`the ${kind} figure's sidecar has no replicaOnGrip.${h}`);
    return rows(r).multiply(THREE_TO_BLENDER);
  };
  const magazinesFor = (clipName: string): FigureMagazines | null => {
    const m = sidecar.magazineInHand?.[clipName];
    const old = m?.oldMagazine;
    if (!m || !old) return null;
    return {
      times: { from: m.from, to: m.to, hidden: [m.replicaMagazineHidden[0], m.replicaMagazineHidden[1]], oldFrom: old.from, release: old.release },
      bone: m.bone,
      fresh: rows(m.magazineOnBone),
      old: rows(old.magazineOnBone),
      velocity: fromBlender(old.releaseVelocity),
      spin: fromBlender(old.releaseSpin),
      gravity: old.gravity,
      lifetime: old.lifetime,
    };
  };

  // The bone tree alone: the meshes are made per figure from the merged geometry.
  const rig = rootBone.parent.clone(false);
  rig.position.set(0, 0, 0);
  rig.quaternion.identity();
  rig.scale.set(1, 1, 1);
  rootBone.parent.updateMatrixWorld(true);
  const rigInScene = new THREE.Matrix4().copy(scene.matrixWorld).invert().multiply(rootBone.parent.matrixWorld);
  rigInScene.decompose(rig.position, rig.quaternion, rig.scale);
  rig.add(rootBone.clone(true));

  const replicaOnGrip = { rifle: hold('rifle'), pistol: hold('pistol') };
  // Posed as a figure poses it: the aim's upper-body clip over the still pelvis the clip was made over.
  const boreYaw = (slot: number, onGrip: THREE.Matrix4): number => {
    const posed = rig.clone(true);
    const clip = upper[slot];
    const mixer = new THREE.AnimationMixer(posed);
    if (clip) mixer.clipAction(clip).play();
    mixer.update(0);
    posed.getObjectByName(FIGURE_RIG.bones.hips)?.quaternion.copy(hipsUnderAim);
    posed.updateMatrixWorld(true);
    const grip = posed.getObjectByName(FIGURE_RIG.bones.grip)!;
    const bore = new THREE.Vector3(0, 0, -1).transformDirection(new THREE.Matrix4().multiplyMatrices(grip.matrixWorld, onGrip));
    // Freed after reading: freeing puts the bones back at rest.
    mixer.uncacheRoot(posed);
    // The model faces +Z: the bore's turn from it about +Y, undone by turning the other way.
    return -Math.atan2(bore.x, bore.z);
  };
  const aimYaw = { rifle: boreYaw(POSE_SLOT.Rifle_Aim, replicaOnGrip.rifle), pistol: boreYaw(POSE_SLOT.Pistol_Aim, replicaOnGrip.pistol) };

  const boneNames = skeleton.bones.map((b) => b.name);
  const bindMatrix = first.bindMatrix.clone();
  const legs = figureLegsFrom({ rig, boneNames, boneInverses: skeleton.boneInverses, bindMatrix, bodies: roles.body.flatMap((p) => (meshesOf.get(p) ?? []).map((m) => m.geometry)), lower, table });
  const body = figureBodyFrom({ rig, lower, upper, table, hipsUnderAim, shape: FIGURE_HIT_SHAPES[kind] });

  const triangles = [0, 1, 2].map((lod) => {
    const g = geometry(lod, parts.filter((p) => meshesOf.has(p + suffix(lod))));
    return (g.index?.count ?? g.getAttribute('position').count) / 3;
  });

  return {
    kind,
    rig,
    boneNames,
    boneInverses: skeleton.boneInverses,
    bindMatrix,
    materials,
    parts,
    geometry,
    lower,
    upper,
    table,
    replicaOnGrip,
    magazines: { rifle: magazinesFor('Rifle_Reload'), pistol: magazinesFor('Pistol_Reload') },
    hipsUnderAim,
    aboveHips,
    aimYaw,
    triangles,
    legs,
    body,
    dispose: () => {
      for (const g of merged.values()) g.dispose();
      merged.clear();
      for (const mesh of skinned) mesh.geometry.dispose();
      finish?.dispose();
      for (const m of fileMaterials) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      }
      skeleton.dispose();
    },
  };
}

import * as THREE from 'three';
import { FIGURE } from '../config/characters';
import type { ReplicaConfig } from '../config/replicas';
import type { ReplicaPaint } from '../config/schemes';
import { PartBuilder, type PartLook } from '../render/figures/figureParts';
import { addPistol, addRifle, BARE_KIT, type FigureReplicaColours } from '../render/figures/figureReplicas';
import { flatColour, type MaterialKey, PAINTED, type ReplicaDetail } from '../render/replicas/replicaBuilder';
import { fitParts } from '../render/replicas/itemPictures';
import { NO_REPLICA_FILES, type ReplicaFiles } from '../render/replicas/replicaFiles';
import { buildReplicaModels, LOW_DETAIL } from '../render/replicas/replicaModels';

/**
 * What a skin looks like once drawn (CT4, the skin checks' measurements): a replica built by the game's own builders in a
 * scheme, and how much of its surface each colour covers, in first person (the viewmodel, at Low and High, from its
 * model file when one is given) and on a figure (what a bot carries, seen at a distance). Runs in Node with three.js, no
 * browser. The checks judge what these hand back (skinFit.ts, skinSpec.ts).
 */

export const HIGH: ReplicaDetail = { replica: 'high', hands: 'high' };
export const DETAILS: readonly { id: 'low' | 'high'; label: string; detail: ReplicaDetail }[] = [
  { id: 'low', label: 'Low', detail: LOW_DETAIL },
  { id: 'high', label: 'High', detail: HIGH },
];

/** One material of a drawn replica: its key, the colour a flat face of it shows, and the surface it covers (m²). */
export interface DrawnPart {
  key: MaterialKey;
  colour: number;
  /** It glows (an accent line lit from within): `colour` is its light. */
  glow: boolean;
  area: number;
}

/** A replica drawn in first person, as it comes (no parts fitted), with the orange tip setting on. */
export interface ViewmodelSurvey {
  parts: DrawnPart[];
  /** The orange tip, when drawn: the colours of the parts within SKIN_RULES.tipReach of its centre. */
  tip: { around: number[] } | null;
  /** Texture memory on its painted materials (bytes at 4 a texel, mips a third more). */
  textureBytes: number;
}

/** A triangle's area in world space. */
const A = new THREE.Vector3();
const B = new THREE.Vector3();
const C = new THREE.Vector3();
function meshArea(mesh: THREE.Mesh, group?: { start: number; count: number }): number {
  const g = mesh.geometry;
  const pos = g.getAttribute('position');
  const index = g.index;
  const start = group?.start ?? 0;
  const end = Math.min(group ? group.start + group.count : Infinity, index ? index.count : pos.count);
  let area = 0;
  for (let i = start; i + 2 < end; i += 3) {
    const [a, b, c] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
    A.fromBufferAttribute(pos, a).applyMatrix4(mesh.matrixWorld);
    B.fromBufferAttribute(pos, b).applyMatrix4(mesh.matrixWorld);
    C.fromBufferAttribute(pos, c).applyMatrix4(mesh.matrixWorld);
    area += B.sub(A).cross(C.sub(A)).length() / 2;
  }
  return area;
}

/** The meshes that show under `root` (a hidden group hides what is in it), with each of their materials. */
function shownMeshes(root: THREE.Object3D): { mesh: THREE.Mesh; material: THREE.Material; group?: { start: number; count: number } }[] {
  const out: { mesh: THREE.Mesh; material: THREE.Material; group?: { start: number; count: number } }[] = [];
  const visit = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    if (o instanceof THREE.Mesh) {
      if (Array.isArray(o.material)) for (const g of o.geometry.groups) out.push({ mesh: o, material: o.material[g.materialIndex ?? 0]!, group: g });
      else out.push({ mesh: o, material: o.material });
    }
    for (const c of o.children) visit(c);
  };
  visit(root);
  return out;
}

/** The colour a material's flat face shows: its own (brightening undone), or its light when it glows. */
function shownColour(mat: THREE.Material): { colour: number; glow: boolean } {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return { colour: (mat as THREE.MeshBasicMaterial).color?.getHex() ?? 0, glow: false };
  const glow = mat.emissiveIntensity > 0 && mat.emissive.getHex() !== 0;
  return glow ? { colour: mat.emissive.getHex(), glow } : { colour: flatColour(mat), glow };
}

/** Bytes of GPU memory a texture holds (as pipeline/perf-run.mjs counts it). */
function textureBytes(t: THREE.Texture): number {
  const img = t.image as { width?: number; height?: number; data?: { width?: number; height?: number } } | undefined;
  const w = img?.width ?? img?.data?.width ?? 0;
  const h = img?.height ?? img?.data?.height ?? 0;
  return w * h * 4 * (t.generateMipmaps ? 4 / 3 : 1);
}

/** The textures a material samples. */
function texturesOf(mat: THREE.Material): THREE.Texture[] {
  return Object.values(mat).filter((v): v is THREE.Texture => v instanceof THREE.Texture);
}

const PAINTED_KEYS = new Set<string>(PAINTED);

/** Every vertex of `mesh` (world space) within `reach` of `p`. */
function near(mesh: THREE.Mesh, p: THREE.Vector3, reach: number): boolean {
  const pos = mesh.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (A.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).distanceTo(p) <= reach) return true;
  return false;
}

/**
 * `replica` drawn in first person in `paint` (null: unpainted, the builders' own colours) at `detail`, from its model
 * file when `files` has one, with the orange tip setting on, its hands left out and no part fitted. `tipReach` (m) is
 * how near the tip a part counts as around it.
 */
export function surveyViewmodel(replica: ReplicaConfig, paint: ReplicaPaint | null, detail: ReplicaDetail, tipReach: number, files: ReplicaFiles = NO_REPLICA_FILES): ViewmodelSurvey {
  const built = buildReplicaModels([replica], 0x3a7bd5, true, detail, paint, 'bare', undefined, files);
  try {
    const model = built.models.get(replica.id)!;
    fitParts(model, {});
    model.group.updateMatrixWorld(true);
    const shown = shownMeshes(model.group);
    const byKey = new Map<string, DrawnPart>();
    const seen = new Set<string>();
    let bytes = 0;
    for (const { mesh, material, group } of shown) {
      const key = material.name as MaterialKey;
      const area = meshArea(mesh, group);
      const part = byKey.get(key);
      if (part) part.area += area;
      else byKey.set(key, { key, ...shownColour(material), area });
      if (PAINTED_KEYS.has(key)) {
        for (const t of texturesOf(material)) {
          if (seen.has(t.uuid)) continue;
          seen.add(t.uuid);
          bytes += textureBytes(t);
        }
      }
    }
    const tipMeshes = shown.filter((s) => s.material.name === 'orange');
    let tip: ViewmodelSurvey['tip'] = null;
    if (tipMeshes.length > 0) {
      const box = new THREE.Box3();
      for (const t of tipMeshes) box.expandByObject(t.mesh);
      const centre = box.getCenter(new THREE.Vector3());
      const around = new Set<number>();
      for (const s of shown) if (PAINTED_KEYS.has(s.material.name) && near(s.mesh, centre, tipReach + box.getSize(B).length() / 2)) around.add(shownColour(s.material).colour);
      tip = { around: [...around] };
    }
    return { parts: [...byKey.values()], tip, textureBytes: bytes };
  } finally {
    built.dispose();
  }
}

/** The colour roles of a replica on a figure (render/figures/figureReplicas.ts). */
export type FigureRole = keyof FigureReplicaColours;
export const FIGURE_ROLES: readonly FigureRole[] = ['body', 'furniture', 'detail', 'accent', 'steel'];

/** A PartBuilder that also keeps each shape it is given, placed, by its colour. */
class Surveyor extends PartBuilder {
  readonly pieces: { colour: number; geo: THREE.BufferGeometry }[] = [];

  override add(geo: THREE.BufferGeometry, color: number, look: PartLook = {}, shadow: THREE.BufferGeometry | null = null): this {
    this.pieces.push({ colour: color, geo: geo.clone() });
    return super.add(geo, color, look, shadow);
  }
}

/** The directions a figure's replica is looked at from: the six faces and the eight corners of a cube round it. */
const LOOKS: readonly THREE.Vector3[] = [-1, 0, 1].flatMap((x) => [-1, 0, 1].flatMap((y) => [-1, 0, 1].map((z) => new THREE.Vector3(x, y, z)))).filter((v) => v.lengthSq() === 1 || v.lengthSq() === 3).map((v) => v.normalize());
/** Rays a side, per direction. */
const RAYS = 32;

const roleShares = new Map<string, Readonly<Record<FigureRole, number>>>();

/**
 * How much of a figure's replica each colour role shows (CT4): the share of rays, cast at it from the six sides and
 * eight corners on an even grid, whose first hit is that role. What shows, not what is built: a line set into the body
 * shows its edge only. Memoised per replica, detail and shape (the roles' places never depend on the colours).
 */
export function figureRoleShares(replica: ReplicaConfig, high: boolean, files: ReplicaFiles = NO_REPLICA_FILES): Readonly<Record<FigureRole, number>> {
  const shape = files.get(replica.id)?.figure ?? null;
  const key = `${replica.id}|${high}|${shape ? 'file' : 'built'}`;
  const known = roleShares.get(key);
  if (known) return known;
  // Each role in a colour of its own (1 to 5), so a hit names its role.
  const marks = Object.fromEntries(FIGURE_ROLES.map((r, i) => [r, i + 1])) as Record<FigureRole, number>;
  const b = new Surveyor(high ? FIGURE.detail.high : FIGURE.detail.low);
  (replica.look.model === 'pistol' ? addPistol : addRifle)(b, new THREE.Matrix4(), marks, BARE_KIT, shape);
  b.build(new THREE.MeshBasicMaterial()).geometry.dispose();
  const scene = new THREE.Group();
  for (const p of b.pieces) {
    const mesh = new THREE.Mesh(p.geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.userData.role = FIGURE_ROLES[p.colour - 1];
    scene.add(mesh);
  }
  scene.updateMatrixWorld(true);
  const sphere = new THREE.Box3().setFromObject(scene).getBoundingSphere(new THREE.Sphere());
  const hits = Object.fromEntries(FIGURE_ROLES.map((r) => [r, 0])) as Record<FigureRole, number>;
  const ray = new THREE.Raycaster();
  const up = new THREE.Vector3();
  const side = new THREE.Vector3();
  const origin = new THREE.Vector3();
  let total = 0;
  for (const look of LOOKS) {
    up.set(0, 1, 0);
    if (Math.abs(look.y) > 0.9) up.set(1, 0, 0);
    side.crossVectors(look, up).normalize();
    up.crossVectors(side, look).normalize();
    for (let i = 0; i < RAYS; i++) {
      for (let j = 0; j < RAYS; j++) {
        const u = ((i + 0.5) / RAYS - 0.5) * 2 * sphere.radius;
        const v = ((j + 0.5) / RAYS - 0.5) * 2 * sphere.radius;
        origin.copy(sphere.center).addScaledVector(look, -2 * sphere.radius).addScaledVector(side, u).addScaledVector(up, v);
        ray.set(origin, look);
        const hit = ray.intersectObject(scene, true)[0];
        if (!hit) continue;
        hits[hit.object.userData.role as FigureRole]++;
        total++;
      }
    }
  }
  for (const p of b.pieces) p.geo.dispose();
  const shares = Object.fromEntries(FIGURE_ROLES.map((r) => [r, total > 0 ? hits[r] / total : 0])) as Record<FigureRole, number>;
  roleShares.set(key, shares);
  return shares;
}

/**
 * A replica as a figure carries it (a bot) in `colours`, at Low or High figure detail: each colour and the share of it
 * that shows (roles in the same colour together), most first.
 */
export function surveyFigure(replica: ReplicaConfig, colours: FigureReplicaColours, high: boolean, files: ReplicaFiles = NO_REPLICA_FILES): { colour: number; share: number }[] {
  const shares = figureRoleShares(replica, high, files);
  const by = new Map<number, number>();
  for (const r of FIGURE_ROLES) by.set(colours[r], (by.get(colours[r]) ?? 0) + shares[r]);
  return [...by.entries()].map(([colour, share]) => ({ colour, share })).filter((c) => c.share > 0).sort((x, y) => y.share - x.share);
}

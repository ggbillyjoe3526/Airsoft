import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIGURE, type FigureLook } from '../config/characters';
import type { HitConfig } from '../config/hits';
import type { Character } from '../sim/character';
import type { Vec3 } from '../sim/vec';
import type { FigurePart } from '../config/assets';
import { type FigureModel, instanceModelPart } from './externalModels';
import { FINISH_ATTRIBUTE } from './figureFinish';

/**
 * Third-person figures (M14 art pass, reworked): stylised players at a weekend airsoft game: casual clothes under a
 * chest rig or a plate carrier, full-seal goggles (a mesh mask on some, the face showing on most), a cap, a bump
 * helmet with a headset or bare hair, pads, gloves, and the team colour as tape (a broad band round the torso, shoulder
 * straps, armbands, a band on the headgear and on each thigh). Each moving part is one merged mesh with flat vertex
 * colours, all on the figure's one material. Figures face -Z with their feet at the origin.
 *
 * A figure model (M25a, render/externalModels.ts) replaces whichever of these parts it names, posed the same way; the
 * built-in parts fill in the rest.
 */

type Color = number;

const UP = new THREE.Vector3(0, 1, 0);
/** Small parts on the detailed figure (fingers, a thumb, a boom, a tube, ears, the goggles' rims): few sides read the same at range. */
const SMALL_SIDES = 6;
const RIM_SEGMENTS = 10;

/** A figure's detail level (QualitySettings.figureDetail, FA8): segment counts and whether the overhaul's pieces show. */
export type FigureDetail = (typeof FIGURE.detail)[keyof typeof FIGURE.detail];
/** [roughness, metalness] of a vertex on the detailed figure (FIGURE.finish). */
type Finish = readonly [roughness: number, metalness: number];

/** How a part is coloured on the detailed figure: its finish, a lighter bevel, a shade by position. Ignored on `low`. */
interface PartLook {
  finish?: Finish;
  /** Lighten the bevel faces of a rounded box (FIGURE.edgeLight): the CS edge highlight. Never on team tape. */
  edge?: boolean;
  /** A colour multiplier by vertex position (a baked shade: the torso's lower third, a cuff). */
  shade?: (x: number, y: number, z: number) => number;
}

/** True for a vertex normal between two faces of a rounded box (a bevel), not on a flat face. */
function onBevel(nx: number, ny: number, nz: number): boolean {
  let axes = 0;
  if (Math.abs(nx) > 0.2) axes++;
  if (Math.abs(ny) > 0.2) axes++;
  if (Math.abs(nz) > 0.2) axes++;
  return axes >= 2;
}

/**
 * Collects coloured primitives and merges them into one geometry with a `color` attribute. On the detailed figure every
 * part also carries a per-vertex finish (render/figureFinish.ts) and its colour takes edge highlights and baked shade.
 */
class PartBuilder {
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(readonly detail: FigureDetail = FIGURE.detail.low) {}

  /** The overhaul's extra pieces and finishes are drawn (figureDetail 'high'). */
  get overhaul(): boolean {
    return this.detail.overhaul;
  }

  add(geo: THREE.BufferGeometry, color: Color, look: PartLook = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    if (!this.overhaul) {
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    } else {
      const pos = g.getAttribute('position');
      const nor = g.getAttribute('normal');
      const finish = new Float32Array(n * 2);
      const [rough, metal] = look.finish ?? FIGURE.finish.fabric;
      for (let i = 0; i < n; i++) {
        let k = 1;
        if (look.edge && onBevel(nor.getX(i), nor.getY(i), nor.getZ(i))) k *= FIGURE.edgeLight;
        if (look.shade) k *= look.shade(pos.getX(i), pos.getY(i), pos.getZ(i));
        colors[i * 3] = Math.min(1, c.r * k);
        colors[i * 3 + 1] = Math.min(1, c.g * k);
        colors[i * 3 + 2] = Math.min(1, c.b * k);
        finish[i * 2] = rough;
        finish[i * 2 + 1] = metal;
      }
      g.setAttribute(FINISH_ATTRIBUTE, new THREE.BufferAttribute(finish, 2));
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geos.push(g);
    return this;
  }

  box(color: Color, w: number, h: number, d: number, x: number, y: number, z: number, look?: PartLook): this {
    return this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color, look);
  }

  /** A box with chamfered edges (one segment of rounding): kit, plates and boots. Detailed, its bevels catch the light. */
  rounded(color: Color, w: number, h: number, d: number, x: number, y: number, z: number, radius = 0.02, look: PartLook = { edge: true }): this {
    return this.add(new RoundedBoxGeometry(w, h, d, 1, radius).translate(x, y, z), color, look);
  }

  /** Capsule from a to b; small ones (fingers, a thumb, a tube) take fewer `sides` and cap rings. */
  limb(color: Color, radius: number, a: THREE.Vector3, b: THREE.Vector3, look?: PartLook, sides: number = this.detail.radialSegments, capRings = 3): this {
    const dir = b.clone().sub(a);
    const geo = new THREE.CapsuleGeometry(radius, Math.max(1e-3, dir.length()), capRings, sides);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
    geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return this.add(geo, color, look);
  }

  /** A limb tapering from radius `ra` at a to `rb` at b, with a rounded joint at each end. */
  taper(color: Color, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): this {
    const dir = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(rb, ra, Math.max(1e-3, dir.length()), this.detail.radialSegments, 1, true);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
    geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(geo, color);
    this.sphere(color, ra, a.x, a.y, a.z, 6);
    return this.sphere(color, rb, b.x, b.y, b.z, 6);
  }

  /** A band of tape (or a pad's strap) round the limb from a to b, at `t` (0..1) along it: `radius` round, `width` wide. */
  band(color: Color, a: THREE.Vector3, b: THREE.Vector3, t: number, radius: number, width: number, look?: PartLook): this {
    const dir = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(radius, radius, width, this.detail.radialSegments);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
    const at = a.clone().addScaledVector(dir, t);
    geo.translate(at.x, at.y, at.z);
    return this.add(geo, color, look);
  }

  sphere(color: Color, r: number, x: number, y: number, z: number, segments: number = this.detail.sphereSegments, look?: PartLook): this {
    return this.add(new THREE.SphereGeometry(r, segments, Math.max(4, segments - 4)).translate(x, y, z), color, look);
  }

  /**
   * An upright curved strip round the head (goggles, the mask, a band): radius `r`, `height` tall, centred at height
   * `y`, covering `arc` radians round the front (2π: all the way round).
   */
  wrap(color: Color, r: number, height: number, y: number, arc: number, z = 0, look?: PartLook): this {
    const full = arc >= Math.PI * 2;
    // CylinderGeometry measures its angle from +Z towards +X: π is straight ahead (-Z).
    const geo = new THREE.CylinderGeometry(r, r, height, full ? this.detail.wrap[1] : this.detail.wrap[0], 1, !full, Math.PI - arc / 2, arc);
    return this.add(geo.translate(0, y, z), color, look);
  }

  /** A horizontal rim (a torus arc of tube radius `tube`) round the front of the head over `arc` radians, at height `y`. */
  rim(color: Color, r: number, tube: number, y: number, arc: number, look?: PartLook): this {
    // The torus lies in XY from +X; turned so the arc is centred on the front (-Z) and laid flat.
    const geo = new THREE.TorusGeometry(r, tube, 4, RIM_SEGMENTS, arc).rotateZ(Math.PI / 2 - arc / 2).rotateX(-Math.PI / 2);
    return this.add(geo.translate(0, y, 0), color, look);
  }

  /** Adds another builder's merged, already coloured parts transformed by `m`. */
  addPart(part: PartBuilder, m: THREE.Matrix4): this {
    this.geos.push(part.geometry().applyMatrix4(m));
    return this;
  }

  geometry(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.geos);
    for (const g of this.geos) g.dispose();
    this.geos.length = 0;
    if (!merged) throw new Error('empty figure part');
    return merged;
  }

  build(material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry(), material);
    mesh.castShadow = true;
    return mesh;
  }
}

/**
 * Whether every mesh under `root` is shaded by other things' shadows (QualitySettings.figureShadows, audit REN-07). Each
 * material's shader is rebuilt once on the next frame (Three.js keys programs on it); nothing changes while shadows are off.
 */
export function setReceiveShadows(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = on;
  });
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const C = FIGURE.colors;
const FIN = FIGURE.finish;

/** A colour `k` times as bright (clamped): the detailed figure's lids, cuffs and soles. */
const tone = (color: Color, k: number): Color => new THREE.Color(color).multiplyScalar(k).getHex();

/** The parts a figure shows on its replicas (FA8, Player detail `high`): a silencer on the rifle (M29b). */
export interface FigureKit {
  rifleSilencer: boolean;
}

/** As every replica comes. */
export const BARE_KIT: FigureKit = { rifleSilencer: false };

/** A simple two-tone toy rifle along -Z from `z0` (butt) with its bore at height y; `kit` (detailed only): its silencer. */
function addRifle(b: PartBuilder, x: number, y: number, z0: number, kit: FigureKit = BARE_KIT): void {
  const polymer: PartLook = { finish: FIN.polymer, edge: true };
  b.rounded(C.furniture, 0.05, 0.1, 0.2, x, y - 0.02, z0 - 0.1, 0.012, polymer); // stock
  b.rounded(C.replica, 0.055, 0.08, 0.34, x, y, z0 - 0.37, 0.012, polymer); // receiver
  b.box(C.furniture, 0.04, 0.14, 0.06, x, y - 0.1, z0 - 0.42, polymer); // magazine
  b.rounded(C.furniture, 0.06, 0.07, 0.24, x, y, z0 - 0.66, 0.015, polymer); // handguard
  b.box(C.replica, 0.025, 0.025, 0.2, x, y, z0 - 0.88, { finish: FIN.steel }); // barrel
  b.box(C.replica, 0.02, 0.04, 0.03, x, y + 0.06, z0 - 0.24, polymer); // flip-up rear sight (optics aren't drawn on figures)
  if (!b.overhaul) return;
  // Detailed: a top rail along the receiver and handguard, the pistol grip, and a flash hider at the muzzle, or a fitted
  // silencer over the barrel's end (its front at the muzzle, where BBs leave).
  b.box(C.replica, 0.024, 0.012, 0.56, x, y + 0.045, z0 - 0.54, polymer);
  b.rounded(C.replica, 0.032, 0.09, 0.045, x, y - 0.075, z0 - 0.27, 0.01, polymer);
  const muzzle = z0 - FIGURE.rifle.length;
  if (kit.rifleSilencer) {
    const S = FIGURE.silencer;
    b.add(new THREE.CylinderGeometry(S.radius, S.radius, S.length, b.detail.radialSegments).rotateX(Math.PI / 2).translate(x, y, muzzle + S.length / 2), C.replica, polymer);
  } else b.add(new THREE.CylinderGeometry(0.018, 0.018, 0.045, b.detail.radialSegments).rotateX(Math.PI / 2).translate(x, y, muzzle + 0.0225), C.replica, { finish: FIN.steel });
}

/** A compact pistol along -Z from `z0` (the back of the slide) with its bore at height y. */
function addPistol(b: PartBuilder, x: number, y: number, z0: number): void {
  const polymer: PartLook = { finish: FIN.polymer, edge: true };
  b.rounded(C.replica, 0.032, 0.038, FIGURE.pistol.length, x, y, z0 - FIGURE.pistol.length / 2, 0.008, polymer); // slide
  b.box(C.replica, 0.028, 0.1, 0.04, x, y - 0.06, z0 - 0.035, polymer); // grip
  if (!b.overhaul) return;
  // Detailed: the tan frame under the slide and its trigger guard.
  b.rounded(C.furniture, 0.03, 0.014, FIGURE.pistol.length * 0.8, x, y - 0.024, z0 - FIGURE.pistol.length * 0.45, 0.005, polymer);
  b.box(C.furniture, 0.008, 0.024, 0.036, x, y - 0.04, z0 - 0.075, polymer);
}

/** A gloved hand gripping something at `at`. Detailed: a thumb along the grip and a lighter knuckle pad. */
function glove(b: PartBuilder, at: THREE.Vector3): void {
  b.rounded(C.gloves, 0.07, 0.075, 0.09, at.x, at.y, at.z, 0.025);
  if (!b.overhaul) return;
  b.limb(C.gloves, 0.013, v(at.x - 0.036, at.y + 0.005, at.z), v(at.x - 0.036, at.y + 0.018, at.z - 0.045), undefined, SMALL_SIDES, 1);
  b.rounded(tone(C.gloves, FIGURE.lidLight), 0.074, 0.022, 0.05, at.x, at.y + 0.03, at.z - 0.015, 0.008);
}

/**
 * One arm from the shoulder `s` through the elbow `e` to the hand `h`: sleeve, elbow pad, forearm, glove, and the team
 * armband round the upper arm. Detailed: a darker cuff round the wrist.
 */
function arm(b: PartBuilder, look: FigureLook, team: Color, s: THREE.Vector3, e: THREE.Vector3, h: THREE.Vector3): void {
  const F = FIGURE;
  b.taper(look.top, s, e, F.armRadius, F.armRadius * 0.85);
  b.band(team, s, e, 0.42, F.armRadius * 1.12, 0.13);
  b.taper(look.top, e, h, F.forearmRadius, F.forearmRadius * 0.8);
  b.sphere(C.pads, F.armRadius * 0.95, e.x, e.y, e.z, 6);
  if (b.overhaul) b.band(tone(look.top, F.cuffShade), e, h, 0.8, F.forearmRadius * 0.86, 0.035);
  glove(b, h);
}

/** A figure's looks, from its id (FIGURE.looks): clothes, vest, headgear and face vary so a team doesn't look cloned. */
export function figureLooks(id: number): FigureLook {
  const n = FIGURE.looks.length;
  return FIGURE.looks[((Math.floor(id) % n) + n) % n]!;
}

export interface Figure {
  root: THREE.Group;
  /** Everything above the hips; drops when crouching. */
  upper: THREE.Group;
  /** The legs, each pivoting at its hip. */
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** Arms and replica in the aiming pose; pitches with the view about the shoulders. */
  aim: THREE.Group;
  /** The aim group's two holds: the rifle shouldered, or the pistol out in both hands (one shows at a time). */
  aimRifle: THREE.Object3D;
  aimPistol: THREE.Object3D;
  /** Hit-calling pose: one hand raised high, replica held muzzle-down. */
  hitPose: THREE.Object3D;
  callout: THREE.Sprite;
  /** This figure's own copies of a figure model's materials (none for a built-in figure): they fade with it. */
  modelMaterials: THREE.Material[];
  /** A figure model drawn whole (no named parts), standing on the root; null otherwise. */
  whole: THREE.Object3D | null;
}

/**
 * The head: face, full-seal goggles with their strap, a mesh mask if the look has one, and a cap, a helmet with a
 * headset, or hair with a team sweatband. `y`: head centre. Detailed (FA8): an oval head with a jaw and ears, goggles
 * in a framed band with a glossy lens, a glossy helmet shell with a cover seam and a headset boom, a bevelled brim.
 */
function head(b: PartBuilder, look: FigureLook, team: Color, y: number): void {
  const F = FIGURE;
  const r = F.headRadius;
  const skin: PartLook = { finish: FIN.skin };
  if (b.overhaul) {
    const [sides, rings] = b.detail.head;
    b.add(new THREE.SphereGeometry(r, sides, rings).scale(0.92, 1.1, 1).translate(0, y, 0), look.skin, skin);
    b.rounded(look.skin, 0.11, 0.05, 0.1, 0, y - 0.07, -0.015, 0.02, skin); // jaw
    for (const side of [-1, 1]) b.add(new THREE.SphereGeometry(0.022, SMALL_SIDES, 4).scale(0.5, 1, 0.8).translate(side * r * 0.92, y - 0.008, 0.005), look.skin, skin); // ears
  } else b.sphere(look.skin, r, 0, y, 0);
  b.sphere(look.skin, 0.022, 0, y - 0.035, -r * 0.97, 6, skin); // nose
  // Full-seal goggles: a dark frame wrapping the eyes, a tinted lens across it, the strap round the back.
  b.wrap(C.goggles, r * 1.05, 0.062, y + 0.005, Math.PI * 0.95, 0, { finish: FIN.rubber });
  b.wrap(C.lens, r * 1.1, 0.04, y + 0.006, Math.PI * 0.62, 0, { finish: FIN.lens });
  b.wrap(C.goggles, r * 1.01, 0.026, y + 0.01, Math.PI * 2, 0, { finish: FIN.rubber });
  if (b.overhaul) {
    // The frame as a band round the lens: a lip above and below, so the goggles read as goggles at 15 m.
    for (const dy of [-0.024, 0.036]) b.rim(C.goggles, r * 1.1, 0.007, y + dy, Math.PI * 0.66, { finish: FIN.rubber });
  }
  // Mesh lower-face mask over the nose and mouth, on some looks only.
  if (look.mask !== null) b.wrap(look.mask, r * 1.03, 0.075, y - 0.06, Math.PI * 0.8);
  if (look.headgear === 'helmet') {
    b.add(new THREE.SphereGeometry(r * 1.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1.05).translate(0, y + 0.015, 0), look.hat, { finish: FIN.shell });
    // Team tape round the shell. Detailed: as oval as the shell (its 1.05 depth) and wide enough that its flat sides clear
    // the shell's corners, so no shell shows through it at the front and back.
    if (b.overhaul) b.add(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.045, b.detail.wrap[1]).scale(1, 1, 1.05).translate(0, y + 0.045, 0), team);
    else b.wrap(team, r * 1.19, 0.045, y + 0.045, Math.PI * 2);
    for (const side of [-1, 1]) {
      b.box(look.hat, 0.02, 0.028, 0.12, side * r * 1.13, y + 0.02, 0, { finish: FIN.shell }); // side rails
      b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 10).rotateZ(Math.PI / 2).translate(side * r * 1.05, y - 0.015, 0.005), C.headset, { finish: FIN.polymer });
    }
    b.box(C.headset, 0.06, 0.03, 0.015, 0, y + 0.075, -r * 1.12); // front mount
    if (b.overhaul) {
      b.wrap(tone(look.hat, F.cuffShade), r * 1.2, 0.012, y + 0.018, Math.PI * 2, 0, { finish: FIN.shell }); // the cover's seam at the rim
      b.limb(C.headset, 0.006, v(-r * 1.08, y - 0.03, -0.01), v(-0.045, y - 0.075, -r * 1.02), { finish: FIN.polymer }, SMALL_SIDES, 1); // headset boom
      b.sphere(C.headset, 0.012, -0.045, y - 0.075, -r * 1.02, SMALL_SIDES, { finish: FIN.rubber });
    }
  } else if (look.headgear === 'cap') {
    b.add(new THREE.SphereGeometry(r * 1.07, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, y + 0.02, 0), look.hat);
    b.wrap(team, r * 1.09, 0.035, y + 0.035, Math.PI * 2); // team tape round the cap
    b.rounded(look.hat, 0.17, 0.016, 0.11, 0, y + 0.03, -r * 1.2, 0.006); // brim
  } else {
    // Hair over the crown and down the back, a team sweatband round it above the goggles.
    b.add(new THREE.SphereGeometry(r * 1.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.1, 1).translate(0, y + 0.02, 0), look.hat);
    b.add(new THREE.SphereGeometry(r * 1.04, 10, 4, Math.PI * 0.2, Math.PI * 0.6, Math.PI / 2, Math.PI * 0.22).translate(0, y + 0.02, 0), look.hat);
    b.wrap(team, r * 1.08, 0.035, y + 0.05, Math.PI * 2);
  }
}

/**
 * Builds one figure in its team colour, using `material` (vertex colours) and the shared `calloutMaterial`. `id`
 * picks its looks (figureLooks). `detail` is FIGURE.detail.low unless the Player detail setting asks for more (FA8);
 * `kit` is what the detailed figure shows fitted (a silencer on its rifle).
 */
export function buildFigure(
  teamColor: Color,
  material: THREE.Material,
  calloutMaterial: THREE.SpriteMaterial,
  id = 0,
  model: FigureModel | null = null,
  detail: FigureDetail = FIGURE.detail.low,
  kit: FigureKit = BARE_KIT,
): Figure {
  const F = FIGURE;
  const look = figureLooks(id);
  const root = new THREE.Group();
  const knee = F.hipHeight * 0.48; // height of the knee below the hip
  const modelMaterials: THREE.Material[] = [];
  /**
   * The model's `name` part for this figure, set in its pivot (which sits at `pivot` in the figure), or null when the
   * model doesn't have it. A model drawn whole replaces the body and legs and leaves them empty.
   */
  const fromModel = (name: FigurePart, pivot: THREE.Vector3): THREE.Object3D | null => {
    const part = model?.parts[name];
    if (!part) return model?.whole && (name === 'body' || name === 'legL' || name === 'legR') ? new THREE.Group() : null;
    const copy = instanceModelPart(part, teamColor, modelMaterials);
    copy.position.sub(pivot);
    const holder = new THREE.Group();
    holder.add(copy);
    return holder;
  };

  // Legs pivot at the hips so they can swing: thigh with a team band, knee pad, shin, boot.
  const leg = (side: number): THREE.Object3D => {
    const pivot = v(side * F.hipSpread, F.hipHeight, 0);
    const own = fromModel(side < 0 ? 'legL' : 'legR', pivot);
    if (own) {
      own.position.copy(pivot);
      return own;
    }
    const b = new PartBuilder(detail);
    const hip = v(0, 0, 0);
    const kneeAt = v(0, -knee, -0.015);
    const ankle = v(0, -F.hipHeight + 0.11, 0);
    b.taper(look.trousers, hip, kneeAt, F.legRadius, F.kneeRadius);
    b.band(teamColor, hip, kneeAt, 0.35, F.legRadius * 1.04, 0.1);
    b.taper(look.trousers, kneeAt, ankle, F.kneeRadius, F.shinRadius * 0.85);
    b.rounded(C.pads, 0.1, 0.12, 0.05, 0, -knee - 0.02, -0.06, 0.02, { finish: FIN.rubber, edge: true }); // knee pad
    b.rounded(C.boots, 0.12, 0.12, 0.26, 0, -F.hipHeight + 0.06, -0.04, 0.03, { finish: FIN.rubber, edge: true });
    if (b.overhaul) {
      // A darker sole under the boot, the trouser cuff over it, and a lighter cap on the knee pad.
      b.rounded(tone(C.boots, F.soleShade), 0.126, 0.024, 0.27, 0, -F.hipHeight + 0.012, -0.04, 0.008, { finish: FIN.rubber });
      b.band(tone(look.trousers, F.cuffShade), kneeAt, ankle, 0.9, F.shinRadius * 0.92, 0.03);
      b.rounded(tone(C.pads, F.lidLight), 0.08, 0.06, 0.016, 0, -knee - 0.02, -0.086, 0.008, { finish: FIN.rubber, edge: true });
    }
    const mesh = b.build(material);
    mesh.position.set(side * F.hipSpread, F.hipHeight, 0);
    return mesh;
  };
  const legL = leg(-1);
  const legR = leg(1);

  // Upper body is built with the hips at y = 0 so crouching just lowers the group.
  const upper = new THREE.Group();
  upper.position.y = F.hipHeight;
  const hy = -F.hipHeight; // add this to world heights to get upper-body local heights
  const hips = v(0, F.hipHeight, 0);
  const modelBody = fromModel('body', hips);
  if (modelBody) upper.add(modelBody);
  else upper.add(builtBody(look, teamColor, material, hy, detail));

  // Aiming pose: pivot at the shoulder line. Rifle shouldered on the right, or the pistol held out in both hands.
  const aim = new THREE.Group();
  aim.position.y = F.shoulderHeight + hy;
  const shoulders = v(0, F.shoulderHeight, 0);
  const aimRifle = fromModel('aimRifle', shoulders) ?? builtAimRifle(look, teamColor, material, detail, kit);
  const aimPistol = fromModel('aimPistol', shoulders) ?? builtAimPistol(look, teamColor, material, detail);
  aimPistol.visible = false;
  aim.add(aimRifle, aimPistol);
  upper.add(aim);

  const hitPose = fromModel('hitPose', hips) ?? builtHitPose(look, teamColor, material, hy, detail, kit);
  hitPose.visible = false;
  upper.add(hitPose);

  const callout = new THREE.Sprite(calloutMaterial);
  callout.scale.set(F.callout.width, F.callout.width * F.callout.aspect, 1);
  callout.position.y = F.callout.height;
  callout.visible = false;

  // In a holder of its own, so crouching can scale it without touching the model's fit.
  const whole = model?.whole ? new THREE.Group().add(instanceModelPart(model.whole, teamColor, modelMaterials)) : null;
  if (whole) root.add(whole);
  root.add(legL, legR, upper, callout);
  return { root, upper, legL, legR, aim, aimRifle, aimPistol, hitPose, callout, modelMaterials, whole };
}

/**
 * The built-in body: torso with the team tape, vest, pouches, neck and head, in upper-body space (`hy`: see buildFigure).
 * Detailed: the torso's lower third and hem shade darker (baked occlusion), pouch lids catch the light, a hydration tube
 * runs from the carrier's pack over the shoulder, and a hoodie's hood lies behind the neck.
 */
function builtBody(look: FigureLook, teamColor: Color, material: THREE.Material, hy: number, detail: FigureDetail): THREE.Mesh {
  const F = FIGURE;
  const t = F.torso;
  const body = new PartBuilder(detail);
  const mid = t.bottom + hy; // the torso's bottom, local
  const occlusion = (_x: number, y: number): number => F.hemShade + (1 - F.hemShade) * THREE.MathUtils.smoothstep(y, mid, mid + t.height * 0.45);
  if (body.overhaul) body.add(new RoundedBoxGeometry(t.width, t.height, t.depth, 2, 0.05).translate(0, mid + t.height / 2, 0), look.top, { shade: occlusion });
  else body.rounded(look.top, t.width, t.height, t.depth, 0, mid + t.height / 2, 0, 0.05);
  body.rounded(look.trousers, t.width + 0.01, 0.07, t.depth + 0.01, 0, mid + 0.03, 0, 0.02, { edge: true, shade: () => F.cuffShade }); // belt
  // Team tape round the torso, a quarter of a metre tall and under the arms whatever the pose: the main way to tell
  // teams apart at range (enemies carry no marker). Never shaded or edge-lit: the team colour stays exact.
  const band = F.teamBand;
  body.rounded(teamColor, t.width + 0.035, band.height, t.depth + 0.11, 0, mid + band.centre, 0, 0.03, {});
  const bandTop = mid + band.centre + band.height / 2;
  const front = -(t.depth / 2);
  if (look.vest === 'carrier') {
    // Plate carrier: front and back plates above the tape, a hydration pack high on the back.
    const plateH = t.height - (bandTop - mid) - 0.04;
    for (const side of [-1, 1]) body.rounded(look.vestColor, t.width - 0.06, plateH, 0.05, 0, bandTop + plateH / 2, side * (t.depth / 2 + 0.02), 0.015);
    body.rounded(look.pouches, 0.24, 0.2, 0.07, 0, bandTop + 0.13, t.depth / 2 + 0.075, 0.02);
    if (body.overhaul) {
      // The pack's drinking tube over the right shoulder to the chest.
      const tube = 0x2b2d2f;
      const over = v(0.13, mid + t.height + 0.03, 0.02);
      body.limb(tube, 0.008, v(0.09, bandTop + 0.2, t.depth / 2 + 0.09), over, { finish: FIN.rubber }, SMALL_SIDES, 1);
      body.limb(tube, 0.008, over, v(0.12, bandTop + 0.1, front - 0.05), { finish: FIN.rubber }, SMALL_SIDES, 1);
    }
  } else {
    // Chest rig: one front panel on straps; the top shows at the back.
    body.rounded(look.vestColor, t.width - 0.08, 0.2, 0.04, 0, bandTop + 0.1, front - 0.015, 0.015);
  }
  for (const side of [-1, 1]) body.box(teamColor, 0.065, 0.03, t.depth + 0.08, side * 0.11, mid + t.height + 0.005, 0); // shoulder straps
  // Three magazine pouches across the chest; detailed, each with a lid a centimetre proud whose bevel catches the light.
  for (const x of [-0.1, 0, 0.1]) {
    body.rounded(look.pouches, 0.085, 0.12, 0.055, x, bandTop + 0.08, front - 0.06, 0.012);
    if (body.overhaul) body.rounded(tone(look.pouches, F.lidLight), 0.09, 0.022, 0.062, x, bandTop + 0.135, front - 0.06, 0.006);
  }
  body.limb(look.skin, 0.05, v(0, F.shoulderHeight + hy, 0), v(0, F.headHeight - 0.08 + hy, 0), { finish: FIN.skin }); // neck
  if (body.overhaul && look.hood) {
    // The hood: a thick half-ring lying round the back of the neck.
    const hood = new THREE.TorusGeometry(0.085, 0.035, 6, 12, Math.PI).rotateZ(Math.PI).rotateX(-Math.PI / 2).scale(1.1, 1, 1);
    body.add(hood.translate(0, F.shoulderHeight + hy + 0.03, 0.02), tone(look.top, F.cuffShade));
  }
  head(body, look, teamColor, F.headHeight + hy);
  return body.build(material);
}

/** The built-in arms with the rifle shouldered on the right, in aim-group space (the shoulder line). */
function builtAimRifle(look: FigureLook, teamColor: Color, material: THREE.Material, detail: FigureDetail, kit: FigureKit): THREE.Mesh {
  const F = FIGURE;
  const rifle = new PartBuilder(detail);
  arm(rifle, look, teamColor, v(F.shoulderSpread, 0, 0), v(0.2, -0.2, -0.12), v(0.07, -0.12, -0.26));
  arm(rifle, look, teamColor, v(-F.shoulderSpread, 0, 0), v(-0.14, -0.22, -0.3), v(0.03, -0.08, -0.55));
  if (rifle.overhaul) {
    // The support hand's fingers wrapped up the handguard's far side.
    for (let i = 0; i < 4; i++) {
      const z = -0.52 - i * 0.018;
      rifle.limb(C.gloves, 0.0095, v(0.05, -0.11, z), v(0.094, -0.085, z), undefined, SMALL_SIDES, 1);
    }
  }
  addRifle(rifle, F.rifle.x, F.rifle.y, F.rifle.butt, kit);
  return rifle.build(material);
}

/** The built-in arms with the pistol held out in both hands, in aim-group space. */
function builtAimPistol(look: FigureLook, teamColor: Color, material: THREE.Material, detail: FigureDetail): THREE.Mesh {
  const F = FIGURE;
  const P = F.pistol;
  const pistol = new PartBuilder(detail);
  arm(pistol, look, teamColor, v(F.shoulderSpread, 0, 0), v(0.17, -0.15, -0.21), v(P.x, P.y - 0.08, P.butt - 0.03));
  arm(pistol, look, teamColor, v(-F.shoulderSpread, 0, 0), v(-0.13, -0.17, -0.2), v(P.x - 0.04, P.y - 0.09, P.butt - 0.05));
  addPistol(pistol, P.x, P.y, P.butt);
  return pistol.build(material);
}

/** The built-in hit pose: right hand straight up (open glove), rifle hanging muzzle-down from the left hand. */
function builtHitPose(look: FigureLook, teamColor: Color, material: THREE.Material, hy: number, detail: FigureDetail, kit: FigureKit): THREE.Mesh {
  const F = FIGURE;
  const hit = new PartBuilder(detail);
  const top = F.shoulderHeight + hy;
  const raisedElbow = v(F.shoulderSpread + 0.04, top + 0.3, 0.02);
  const raisedHand = v(F.shoulderSpread + 0.06, top + 0.6, 0);
  hit.taper(look.top, v(F.shoulderSpread, top, 0), raisedElbow, F.armRadius, F.armRadius * 0.85);
  hit.band(teamColor, v(F.shoulderSpread, top, 0), raisedElbow, 0.42, F.armRadius * 1.12, 0.13);
  hit.taper(look.top, raisedElbow, raisedHand, F.forearmRadius, F.forearmRadius * 0.8);
  hit.rounded(C.gloves, 0.09, 0.15, 0.04, raisedHand.x, raisedHand.y + 0.07, 0, 0.015); // open hand
  if (hit.overhaul) {
    // The raised hand's thumb out to the side and a cuff at the wrist: an open hand, clearly.
    hit.rounded(C.gloves, 0.025, 0.06, 0.03, raisedHand.x - 0.055, raisedHand.y + 0.04, 0, 0.01);
    hit.band(tone(look.top, F.cuffShade), raisedElbow, raisedHand, 0.85, F.forearmRadius * 0.86, 0.035);
  }
  const hangHand = v(-F.shoulderSpread - 0.03, top - 0.55, -0.06);
  arm(hit, look, teamColor, v(-F.shoulderSpread, top, 0), v(-F.shoulderSpread - 0.02, top - 0.28, -0.02), hangHand);
  const hanging = new PartBuilder(detail);
  addRifle(hanging, 0, 0, 0.12, kit);
  // Muzzle down and slightly forward, held at the left hand.
  hit.addPart(hanging, new THREE.Matrix4().makeTranslation(hangHand.x, hangHand.y, hangHand.z).multiply(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 - 0.25))));
  return hit.build(material);
}

/** The shared "HIT!" sign texture. */
export function createCalloutTexture(): THREE.CanvasTexture {
  const c = FIGURE.callout;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = Math.round(256 * c.aspect);
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = c.background;
    const r = canvas.height * 0.3;
    g.beginPath();
    g.roundRect(4, 4, canvas.width - 8, canvas.height - 8, r);
    g.fill();
    g.fillStyle = c.color;
    g.font = `900 ${Math.round(canvas.height * 0.62)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('HIT!', canvas.width / 2, canvas.height / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Frees a figure's geometry and its own model materials (a figure model's geometry is shared: the model frees it). */
export function disposeFigure(f: Figure): void {
  f.root.traverse((o) => {
    if (o instanceof THREE.Mesh && !o.userData.sharedGeometry) o.geometry.dispose();
  });
  for (const m of f.modelMaterials) m.dispose();
  f.root.removeFromParent();
}

/** Where a replica's bore and muzzle sit in the aim group (FIGURE.rifle or FIGURE.pistol). */
export type FigureHold = { readonly x: number; readonly y: number; readonly butt: number; readonly length: number };

/**
 * Roll of the figure's upper body (about its local Z, pivoting at the hips) for a lean of `lean` (-1 left
 * .. 1 right). +Z tips the top to the figure's left, so leaning right is negative. Matches sim/lean.ts.
 */
export function figureLeanRoll(lean: number, hits: HitConfig): number {
  return -lean * hits.lean.maxAngle;
}

/**
 * World position of a character's replica muzzle in the third-person aiming pose (matches buildFigure and
 * CharacterRenderer: the aim group pivots at the shoulder line by the view pitch, the upper body rolls about the hips by
 * the lean, the figure turns by yaw). `hold`: the rifle's or the pistol's. `hits` gives the lean's angle.
 */
export function figureMuzzle(c: Character, out: Vec3, hold: FigureHold, hits: HitConfig): Vec3 {
  const F = FIGURE;
  const lx = hold.x;
  const ly = hold.y;
  const lz = hold.butt - hold.length;
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const y1 = ly * cp - lz * sp;
  const z1 = ly * sp + lz * cp;
  // Height above the hips, then the lean's roll about the hips (audit L-03).
  const dy = F.shoulderHeight - F.hipHeight + y1;
  const roll = figureLeanRoll(c.lean, hits);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const x2 = lx * cr - dy * sr;
  const dy2 = lx * sr + dy * cr;
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  out.x = c.position.x + x2 * cy + z1 * sy;
  out.y = c.position.y + F.hipHeight - F.crouchDrop * c.crouchAmount + dy2;
  out.z = c.position.z - x2 * sy + z1 * cy;
  return out;
}

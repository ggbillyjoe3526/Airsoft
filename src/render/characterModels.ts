import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIGURE, type FigureLook } from '../config/characters';
import type { HitConfig } from '../config/hits';
import type { Character } from '../sim/character';
import type { Vec3 } from '../sim/vec';

/**
 * Third-person figures (M14 art pass, reworked): stylised players at a weekend airsoft game: casual clothes under a
 * chest rig or a plate carrier, full-seal goggles (a mesh mask on some, the face showing on most), a cap, a bump
 * helmet with a headset or bare hair, pads, gloves, and the team colour as tape (a broad band round the torso, shoulder
 * straps, armbands, a band on the headgear and on each thigh). Each moving part is one merged mesh with flat vertex
 * colours, all on the figure's one material. Figures face -Z with their feet at the origin.
 */

type Color = number;

const UP = new THREE.Vector3(0, 1, 0);

/** Collects coloured primitives and merges them into one geometry with a `color` attribute. */
class PartBuilder {
  private readonly geos: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: Color): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.geos.push(g);
    return this;
  }

  box(color: Color, w: number, h: number, d: number, x: number, y: number, z: number): this {
    return this.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  }

  /** A box with chamfered edges (one segment of rounding): kit, plates and boots. */
  rounded(color: Color, w: number, h: number, d: number, x: number, y: number, z: number, radius = 0.02): this {
    return this.add(new RoundedBoxGeometry(w, h, d, 1, radius).translate(x, y, z), color);
  }

  /** Capsule from a to b. */
  limb(color: Color, radius: number, a: THREE.Vector3, b: THREE.Vector3): this {
    const dir = b.clone().sub(a);
    const geo = new THREE.CapsuleGeometry(radius, Math.max(1e-3, dir.length()), 3, FIGURE.radialSegments);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
    geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return this.add(geo, color);
  }

  /** A limb tapering from radius `ra` at a to `rb` at b, with a rounded joint at each end. */
  taper(color: Color, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): this {
    const dir = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(rb, ra, Math.max(1e-3, dir.length()), FIGURE.radialSegments, 1, true);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
    geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(geo, color);
    this.sphere(color, ra, a.x, a.y, a.z, 6);
    return this.sphere(color, rb, b.x, b.y, b.z, 6);
  }

  /** A band of tape (or a pad's strap) round the limb from a to b, at `t` (0..1) along it: `radius` round, `width` wide. */
  band(color: Color, a: THREE.Vector3, b: THREE.Vector3, t: number, radius: number, width: number): this {
    const dir = b.clone().sub(a);
    const geo = new THREE.CylinderGeometry(radius, radius, width, FIGURE.radialSegments);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
    const at = a.clone().addScaledVector(dir, t);
    geo.translate(at.x, at.y, at.z);
    return this.add(geo, color);
  }

  sphere(color: Color, r: number, x: number, y: number, z: number, segments: number = FIGURE.radialSegments + 2): this {
    return this.add(new THREE.SphereGeometry(r, segments, Math.max(4, segments - 4)).translate(x, y, z), color);
  }

  /**
   * An upright curved strip round the head (goggles, the mask, a band): radius `r`, `height` tall, centred at height
   * `y`, covering `arc` radians round the front (2π: all the way round).
   */
  wrap(color: Color, r: number, height: number, y: number, arc: number, z = 0): this {
    const full = arc >= Math.PI * 2;
    // CylinderGeometry measures its angle from +Z towards +X: π is straight ahead (-Z).
    const geo = new THREE.CylinderGeometry(r, r, height, full ? 14 : 10, 1, !full, Math.PI - arc / 2, arc);
    return this.add(geo.translate(0, y, z), color);
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

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const C = FIGURE.colors;

/** A simple two-tone toy rifle along -Z from `z0` (butt) with its bore at height y. */
function addRifle(b: PartBuilder, x: number, y: number, z0: number): void {
  b.rounded(C.furniture, 0.05, 0.1, 0.2, x, y - 0.02, z0 - 0.1, 0.012); // stock
  b.rounded(C.replica, 0.055, 0.08, 0.34, x, y, z0 - 0.37, 0.012); // receiver
  b.box(C.furniture, 0.04, 0.14, 0.06, x, y - 0.1, z0 - 0.42); // magazine
  b.rounded(C.furniture, 0.06, 0.07, 0.24, x, y, z0 - 0.66, 0.015); // handguard
  b.box(C.replica, 0.025, 0.025, 0.2, x, y, z0 - 0.88); // barrel
  b.box(C.replica, 0.02, 0.04, 0.03, x, y + 0.06, z0 - 0.24); // flip-up rear sight (optics are accessories; bots fit none)
}

/** A compact pistol along -Z from `z0` (the back of the slide) with its bore at height y. */
function addPistol(b: PartBuilder, x: number, y: number, z0: number): void {
  b.rounded(C.replica, 0.032, 0.038, FIGURE.pistol.length, x, y, z0 - FIGURE.pistol.length / 2, 0.008); // slide
  b.box(C.replica, 0.028, 0.1, 0.04, x, y - 0.06, z0 - 0.035); // grip
}

/** A gloved hand gripping something at `at`. */
function glove(b: PartBuilder, at: THREE.Vector3): void {
  b.rounded(C.gloves, 0.07, 0.075, 0.09, at.x, at.y, at.z, 0.025);
}

/**
 * One arm from the shoulder `s` through the elbow `e` to the hand `h`: sleeve, elbow pad, forearm, glove, and the team
 * armband round the upper arm.
 */
function arm(b: PartBuilder, look: FigureLook, team: Color, s: THREE.Vector3, e: THREE.Vector3, h: THREE.Vector3): void {
  const F = FIGURE;
  b.taper(look.top, s, e, F.armRadius, F.armRadius * 0.85);
  b.band(team, s, e, 0.42, F.armRadius * 1.12, 0.13);
  b.taper(look.top, e, h, F.forearmRadius, F.forearmRadius * 0.8);
  b.sphere(C.pads, F.armRadius * 0.95, e.x, e.y, e.z, 6);
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
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  /** Arms and replica in the aiming pose; pitches with the view about the shoulders. */
  aim: THREE.Group;
  /** The aim group's two holds: the rifle shouldered, or the pistol out in both hands (one shows at a time). */
  aimRifle: THREE.Mesh;
  aimPistol: THREE.Mesh;
  /** Hit-calling pose: one hand raised high, replica held muzzle-down. */
  hitPose: THREE.Mesh;
  callout: THREE.Sprite;
}

/**
 * The head: face, full-seal goggles with their strap, a mesh mask if the look has one, and a cap, a helmet with a
 * headset, or hair with a team sweatband. `y`: head centre.
 */
function head(b: PartBuilder, look: FigureLook, team: Color, y: number): void {
  const F = FIGURE;
  const r = F.headRadius;
  b.sphere(look.skin, r, 0, y, 0);
  b.sphere(look.skin, 0.022, 0, y - 0.035, -r * 0.97, 6); // nose
  // Full-seal goggles: a dark frame wrapping the eyes, a tinted lens across it, the strap round the back.
  b.wrap(C.goggles, r * 1.05, 0.062, y + 0.005, Math.PI * 0.95);
  b.wrap(C.lens, r * 1.1, 0.04, y + 0.006, Math.PI * 0.62);
  b.wrap(C.goggles, r * 1.01, 0.026, y + 0.01, Math.PI * 2);
  // Mesh lower-face mask over the nose and mouth, on some looks only.
  if (look.mask !== null) b.wrap(look.mask, r * 1.03, 0.075, y - 0.06, Math.PI * 0.8);
  if (look.headgear === 'helmet') {
    b.add(new THREE.SphereGeometry(r * 1.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1.05).translate(0, y + 0.015, 0), look.hat);
    b.wrap(team, r * 1.19, 0.045, y + 0.045, Math.PI * 2); // team tape round the shell
    for (const side of [-1, 1]) {
      b.box(look.hat, 0.02, 0.028, 0.12, side * r * 1.13, y + 0.02, 0); // side rails
      b.add(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 10).rotateZ(Math.PI / 2).translate(side * r * 1.05, y - 0.015, 0.005), C.headset);
    }
    b.box(C.headset, 0.06, 0.03, 0.015, 0, y + 0.075, -r * 1.12); // front mount
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
 * picks its looks (figureLooks).
 */
export function buildFigure(teamColor: Color, material: THREE.Material, calloutMaterial: THREE.SpriteMaterial, id = 0): Figure {
  const F = FIGURE;
  const look = figureLooks(id);
  const root = new THREE.Group();
  const knee = F.hipHeight * 0.48; // height of the knee below the hip

  // Legs pivot at the hips so they can swing: thigh with a team band, knee pad, shin, boot.
  const leg = (side: number): THREE.Mesh => {
    const b = new PartBuilder();
    const hip = v(0, 0, 0);
    const kneeAt = v(0, -knee, -0.015);
    const ankle = v(0, -F.hipHeight + 0.11, 0);
    b.taper(look.trousers, hip, kneeAt, F.legRadius, F.kneeRadius);
    b.band(teamColor, hip, kneeAt, 0.35, F.legRadius * 1.04, 0.1);
    b.taper(look.trousers, kneeAt, ankle, F.kneeRadius, F.shinRadius * 0.85);
    b.rounded(C.pads, 0.1, 0.12, 0.05, 0, -knee - 0.02, -0.06, 0.02); // knee pad
    b.rounded(C.boots, 0.12, 0.12, 0.26, 0, -F.hipHeight + 0.06, -0.04, 0.03);
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
  const t = F.torso;
  const body = new PartBuilder();
  const mid = t.bottom + hy; // the torso's bottom, local
  body.rounded(look.top, t.width, t.height, t.depth, 0, mid + t.height / 2, 0, 0.05);
  body.rounded(look.trousers, t.width + 0.01, 0.07, t.depth + 0.01, 0, mid + 0.03, 0, 0.02); // belt
  // Team tape round the torso, a quarter of a metre tall and under the arms whatever the pose: the main way to tell
  // teams apart at range (enemies carry no marker).
  const band = F.teamBand;
  body.rounded(teamColor, t.width + 0.035, band.height, t.depth + 0.11, 0, mid + band.centre, 0, 0.03);
  const bandTop = mid + band.centre + band.height / 2;
  const front = -(t.depth / 2);
  if (look.vest === 'carrier') {
    // Plate carrier: front and back plates above the tape, a hydration pack high on the back.
    const plateH = t.height - (bandTop - mid) - 0.04;
    for (const side of [-1, 1]) body.rounded(look.vestColor, t.width - 0.06, plateH, 0.05, 0, bandTop + plateH / 2, side * (t.depth / 2 + 0.02), 0.015);
    body.rounded(look.pouches, 0.24, 0.2, 0.07, 0, bandTop + 0.13, t.depth / 2 + 0.075, 0.02);
  } else {
    // Chest rig: one front panel on straps; the top shows at the back.
    body.rounded(look.vestColor, t.width - 0.08, 0.2, 0.04, 0, bandTop + 0.1, front - 0.015, 0.015);
  }
  for (const side of [-1, 1]) body.box(teamColor, 0.065, 0.03, t.depth + 0.08, side * 0.11, mid + t.height + 0.005, 0); // shoulder straps
  // Three magazine pouches across the chest.
  for (const x of [-0.1, 0, 0.1]) body.rounded(look.pouches, 0.085, 0.12, 0.055, x, bandTop + 0.08, front - 0.06, 0.012);
  body.limb(look.skin, 0.05, v(0, F.shoulderHeight + hy, 0), v(0, F.headHeight - 0.08 + hy, 0)); // neck
  head(body, look, teamColor, F.headHeight + hy);
  upper.add(body.build(material));

  // Aiming pose: pivot at the shoulder line. Rifle shouldered on the right, or the pistol held out in both hands.
  const aim = new THREE.Group();
  aim.position.y = F.shoulderHeight + hy;
  const sR = v(F.shoulderSpread, 0, 0);
  const sL = v(-F.shoulderSpread, 0, 0);
  const rifle = new PartBuilder();
  arm(rifle, look, teamColor, sR, v(0.2, -0.2, -0.12), v(0.07, -0.12, -0.26));
  arm(rifle, look, teamColor, sL, v(-0.14, -0.22, -0.3), v(0.03, -0.08, -0.55));
  addRifle(rifle, F.rifle.x, F.rifle.y, F.rifle.butt);
  const aimRifle = rifle.build(material);
  const pistol = new PartBuilder();
  const P = F.pistol;
  arm(pistol, look, teamColor, sR, v(0.17, -0.15, -0.21), v(P.x, P.y - 0.08, P.butt - 0.03));
  arm(pistol, look, teamColor, sL, v(-0.13, -0.17, -0.2), v(P.x - 0.04, P.y - 0.09, P.butt - 0.05));
  addPistol(pistol, P.x, P.y, P.butt);
  const aimPistol = pistol.build(material);
  aimPistol.visible = false;
  aim.add(aimRifle, aimPistol);
  upper.add(aim);

  // Hit pose: right hand straight up (open glove), rifle hanging muzzle-down from the left hand.
  const hit = new PartBuilder();
  const top = F.shoulderHeight + hy;
  const raisedElbow = v(F.shoulderSpread + 0.04, top + 0.3, 0.02);
  const raisedHand = v(F.shoulderSpread + 0.06, top + 0.6, 0);
  hit.taper(look.top, v(F.shoulderSpread, top, 0), raisedElbow, F.armRadius, F.armRadius * 0.85);
  hit.band(teamColor, v(F.shoulderSpread, top, 0), raisedElbow, 0.42, F.armRadius * 1.12, 0.13);
  hit.taper(look.top, raisedElbow, raisedHand, F.forearmRadius, F.forearmRadius * 0.8);
  hit.rounded(C.gloves, 0.09, 0.15, 0.04, raisedHand.x, raisedHand.y + 0.07, 0, 0.015); // open hand
  const hangHand = v(-F.shoulderSpread - 0.03, top - 0.55, -0.06);
  arm(hit, look, teamColor, v(-F.shoulderSpread, top, 0), v(-F.shoulderSpread - 0.02, top - 0.28, -0.02), hangHand);
  const hanging = new PartBuilder();
  addRifle(hanging, 0, 0, 0.12);
  // Muzzle down and slightly forward, held at the left hand.
  hit.addPart(hanging, new THREE.Matrix4().makeTranslation(hangHand.x, hangHand.y, hangHand.z).multiply(new THREE.Matrix4().makeRotationX(-(Math.PI / 2 - 0.25))));
  const hitPose = hit.build(material);
  hitPose.visible = false;
  upper.add(hitPose);

  const callout = new THREE.Sprite(calloutMaterial);
  callout.scale.set(F.callout.width, F.callout.width * F.callout.aspect, 1);
  callout.position.y = F.callout.height;
  callout.visible = false;

  root.add(legL, legR, upper, callout);
  return { root, upper, legL, legR, aim, aimRifle, aimPistol, hitPose, callout };
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

export function disposeFigure(f: Figure): void {
  f.root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
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

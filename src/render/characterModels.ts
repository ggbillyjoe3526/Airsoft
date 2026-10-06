import * as THREE from 'three';
import { FIGURE, type FigureLook } from '../config/characters';
import type { FigurePart } from '../config/assets';
import type { HitConfig } from '../config/hits';
import { BOT_SCHEMES, schemeColours } from '../config/schemes';
import type { Character } from '../sim/character';
import type { Vec3 } from '../sim/vec';
import { type FigureModel, instanceModelPart } from './externalModels';
import { gripHand, type Hand, type HandStyle, openHand, wrapIn } from './figureHands';
import { humanArm, humanBody, humanLeg } from './figureHuman';
import { type FigurePalette, figurePalette, robotShell } from './figurePalette';
import { type FigureDetail, PartBuilder } from './figureParts';
import { addPistol, addRifle, BARE_KIT, type FigureKit, type FigureReplicaColours, pistolGrips, rifleGrips } from './figureReplicas';
import { robotArm, robotBody, robotLeg } from './figureRobot';
import { V } from './figureShapes';

export { BARE_KIT, type FigureDetail, type FigureKit, type FigureReplicaColours };

/**
 * Third-person figures (graphics overhaul G7): humans and robots built in code (figureHuman.ts, figureRobot.ts) on one
 * rig: two legs pivoting at the hips, the upper body with the head, and three arm poses (the rifle shouldered, the
 * pistol out in both hands, the hand up calling a hit), each with its replica in the figure's scheme (figureReplicas.ts)
 * and hands closed round its grips (figureHands.ts). Each moving part is one merged mesh with flat vertex colours, all
 * on the figure's one material. Figures face -Z with their feet at the origin.
 *
 * A figure model (M25a, render/externalModels.ts) replaces whichever of these parts it names, posed the same way, on a
 * human or a robot alike; the built-in parts fill in the rest.
 */

/**
 * Whether every mesh under `root` is shaded by other things' shadows (QualitySettings.figureShadows, audit REN-07). Each
 * material's shader is rebuilt once on the next frame (Three.js keys programs on it); nothing changes while shadows are off.
 */
export function setReceiveShadows(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = on;
  });
}

/**
 * How a figure is dressed (G7): a human or a robot (Settings › Look › Robots, render/figureMix.ts), the robot shell its
 * team wears, and the colours of its rifle and pistol (its team's bot scheme, plain under Realistic colours).
 */
export interface FigureDress {
  robot: boolean;
  shell: number;
  rifle: FigureReplicaColours;
  pistol: FigureReplicaColours;
}

/** A human of the first team carrying that team's replicas: what a figure is dressed in unless told otherwise. */
export const HUMAN_DRESS: FigureDress = {
  robot: false,
  shell: robotShell(0),
  rifle: schemeColours(BOT_SCHEMES[0]!.rifle, false),
  pistol: schemeColours(BOT_SCHEMES[0]!.pistol, false),
};

/** A figure's looks, from its id (FIGURE.looks): headgear, pack, radio and camo tone vary so a team doesn't look cloned. */
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

/** The pieces a human or a robot is built from, each into one part's builder in that part's space. */
interface Anatomy {
  leg(b: PartBuilder, pal: FigurePalette, side: number): void;
  body(b: PartBuilder, look: FigureLook, pal: FigurePalette, hy: number): void;
  arm(b: PartBuilder, pal: FigurePalette, shoulder: THREE.Vector3, wrist: THREE.Vector3, out: THREE.Vector3, pole: THREE.Vector3, side: number): void;
  hand(pal: FigurePalette): HandStyle;
}

const HUMAN: Anatomy = {
  leg: humanLeg,
  body: humanBody,
  arm: humanArm,
  hand: () => ({ robot: false, main: FIGURE.colors.glove, joint: FIGURE.colors.glove }),
};

const ROBOT: Anatomy = {
  leg: robotLeg,
  body: robotBody,
  arm: (b, pal, sh, wrist, out, pole) => robotArm(b, pal, sh, wrist, out, pole),
  hand: (pal) => ({ robot: true, main: pal.shell, joint: FIGURE.robot.joint }),
};

/** One arm pose's two arms: each shoulder (at `top` in the pose's space) to the wrist its hand left, the elbow down and out. */
function arms(b: PartBuilder, an: Anatomy, pal: FigurePalette, top: number, hands: readonly (readonly [side: number, hand: Hand, pole?: THREE.Vector3])[]): void {
  for (const [side, hand, pole] of hands) an.arm(b, pal, V(side * FIGURE.shoulderSpread, top, 0), hand.wrist, hand.out, pole ?? V(side * 0.9, -1, 0.3), side);
}

/**
 * Builds one figure in its team colour, using `material` (vertex colours) and the shared `calloutMaterial`. `id`
 * picks its looks (figureLooks). `detail` is FIGURE.detail.low unless the Player detail setting asks for more (FA8);
 * `kit` is what its replicas show fitted (a silencer on the detailed figure's rifle, a torch); `dress` makes it a human
 * or a robot and paints its replicas.
 */
export function buildFigure(
  teamColor: number,
  material: THREE.Material,
  calloutMaterial: THREE.SpriteMaterial,
  id = 0,
  model: FigureModel | null = null,
  detail: FigureDetail = FIGURE.detail.low,
  kit: FigureKit = BARE_KIT,
  dress: FigureDress = HUMAN_DRESS,
): Figure {
  const F = FIGURE;
  const look = figureLooks(id);
  const pal = figurePalette(teamColor, look.tone, dress.shell);
  const an = dress.robot ? ROBOT : HUMAN;
  const root = new THREE.Group();
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

  // Legs pivot at the hips so they can swing.
  const leg = (side: number): THREE.Object3D => {
    const pivot = V(side * F.hipSpread, F.hipHeight, 0);
    const own = fromModel(side < 0 ? 'legL' : 'legR', pivot);
    if (own) {
      own.position.copy(pivot);
      return own;
    }
    const b = new PartBuilder(detail);
    an.leg(b, pal, side);
    const mesh = b.build(material);
    mesh.position.copy(pivot);
    return mesh;
  };
  const legL = leg(-1);
  const legR = leg(1);

  // Upper body is built with the hips at y = 0 so crouching just lowers the group.
  const upper = new THREE.Group();
  upper.position.y = F.hipHeight;
  const hy = -F.hipHeight; // add this to world heights to get upper-body local heights
  const modelBody = fromModel('body', V(0, F.hipHeight, 0));
  if (modelBody) upper.add(modelBody);
  else {
    const b = new PartBuilder(detail);
    an.body(b, look, pal, hy);
    upper.add(b.build(material));
  }

  // Aiming pose: pivot at the shoulder line. Rifle shouldered on the right, or the pistol held out in both hands.
  const aim = new THREE.Group();
  aim.position.y = F.shoulderHeight + hy;
  const shoulders = V(0, F.shoulderHeight, 0);
  const aimRifle = fromModel('aimRifle', shoulders) ?? builtAimRifle(an, pal, material, detail, kit, dress.rifle);
  const aimPistol = fromModel('aimPistol', shoulders) ?? builtAimPistol(an, pal, material, detail, kit, dress.pistol);
  aimPistol.visible = false;
  aim.add(aimRifle, aimPistol);
  upper.add(aim);

  const hitPose = fromModel('hitPose', V(0, F.hipHeight, 0)) ?? builtHitPose(an, pal, material, hy, detail, kit, dress.rifle);
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

/** The arms with the rifle shouldered on the right, in aim-group space (the shoulder line): its hands on its grips. */
function builtAimRifle(an: Anatomy, pal: FigurePalette, material: THREE.Material, detail: FigureDetail, kit: FigureKit, colours: FigureReplicaColours): THREE.Mesh {
  const R = FIGURE.rifle;
  const b = new PartBuilder(detail);
  const m = new THREE.Matrix4().makeTranslation(R.x, R.y, R.butt);
  addRifle(b, m, colours, kit);
  const g = rifleGrips();
  const style = an.hand(pal);
  const right = gripHand(b, wrapIn(g.firing, m), style, g.trigger.applyMatrix4(m));
  const left = gripHand(b, wrapIn(g.support, m), style);
  arms(b, an, pal, 0, [[1, right, V(1, -0.4, 0.5)], [-1, left]]);
  return b.build(material);
}

/** The arms with the pistol held out in both hands, in aim-group space: the support hand over the firing hand. */
function builtAimPistol(an: Anatomy, pal: FigurePalette, material: THREE.Material, detail: FigureDetail, kit: FigureKit, colours: FigureReplicaColours): THREE.Mesh {
  const P = FIGURE.pistol;
  const b = new PartBuilder(detail);
  const m = new THREE.Matrix4().makeTranslation(P.x, P.y, P.butt);
  addPistol(b, m, colours, kit);
  const g = pistolGrips();
  const style = an.hand(pal);
  const right = gripHand(b, wrapIn(g.firing, m), style, g.trigger.applyMatrix4(m));
  const left = gripHand(b, wrapIn(g.support, m), style);
  arms(b, an, pal, 0, [[1, right], [-1, left]]);
  return b.build(material);
}

/**
 * The hit pose in upper-body space: the right hand straight up (open), the rifle hanging muzzle-down from the left hand
 * by its grip.
 */
function builtHitPose(an: Anatomy, pal: FigurePalette, material: THREE.Material, hy: number, detail: FigureDetail, kit: FigureKit, colours: FigureReplicaColours): THREE.Mesh {
  const F = FIGURE;
  const b = new PartBuilder(detail);
  const top = F.shoulderHeight + hy;
  const style = an.hand(pal);
  // The raised hand, palm forward, its wrist above the shoulder.
  const wrist = V(F.shoulderSpread + 0.06, F.hitHand + hy, -0.04);
  const up = V(0.05, 1, 0);
  openHand(b, wrist, up, V(0, 0, -1), style, 1);
  // The rifle hangs muzzle down and a little forward, its grip in the left hand at the side.
  const g = rifleGrips();
  const turn = new THREE.Matrix4().makeRotationX(-(Math.PI / 2 - F.hangTilt));
  const grip = g.firing.top.clone().lerp(g.firing.bottom, 0.5).applyMatrix4(turn);
  const m = new THREE.Matrix4().makeTranslation(-F.shoulderSpread - 0.05 - grip.x, top - 0.55 - grip.y, -0.06 - grip.z).multiply(turn);
  addRifle(b, m, colours, kit);
  const left = gripHand(b, wrapIn({ ...g.firing, side: V(-1, 0, 0) }, m), style);
  arms(b, an, pal, top, [
    [1, { wrist, out: up }, V(1, 0, 0.3)],
    [-1, left, V(-0.9, -0.2, 0.4)],
  ]);
  return b.build(material);
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

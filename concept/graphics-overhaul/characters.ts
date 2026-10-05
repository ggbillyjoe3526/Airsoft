import * as THREE from 'three';
import { Kit } from './kit';
import { buildReplica, type ReplicaId, type ReplicaOpts } from './replicas';

/**
 * Players and bots built in code, in the overhaul's art direction: Marathon's blocky, near-modular kit (chamfered
 * plates, slab pouches, a full-seal visor) with Valorant's clean colour and rim light. Limbs are placed by two-bone IK
 * between joints, so any pose the game's animation gives is a set of points. Figures face -Z, feet at the origin.
 */

export type Pose = 'aim' | 'ready' | 'hit' | 'pistol' | 'run';
export interface FigureOpts {
  team: 'blue' | 'orange';
  pose: Pose;
  headgear?: 'helmet' | 'cap' | 'bump';
  face?: 'mask' | 'bare';
  pack?: boolean;
  skin?: number;
  weapon?: ReplicaId;
  weaponOpts?: ReplicaOpts;
}

const TEAM = {
  blue: { main: 0x3a7fe6, dark: 0x234a8a, cloth: 0x3a3f48, shirt: 0xe7e3d8, glow: 0x4aa8ff },
  orange: { main: 0xf07a26, dark: 0x8f4316, cloth: 0xbca57f, shirt: 0x34383f, glow: 0xff9a3c },
};
const GEAR = 0x4b5059;
const GEAR_DARK = 0x2c3037;
const BOOT = 0x2a2c30;
const SOLE = 0x6b6258;

const Y = new THREE.Vector3(0, 1, 0);

function basis(dir: THREE.Vector3, ref: THREE.Vector3): THREE.Matrix4 {
  const y = dir.clone().normalize();
  let z = ref.clone().addScaledVector(y, -ref.dot(y));
  if (z.lengthSq() < 1e-6) z = new THREE.Vector3(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

/** Two-bone IK: the middle joint for a chain root → target with lengths l1, l2, bent towards `pole`. */
function ik(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): THREE.Vector3 {
  const v = target.clone().sub(root);
  const d = Math.min(v.length(), (l1 + l2) * 0.999);
  const dir = v.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return root.clone().addScaledVector(dir, a).addScaledVector(perp, h);
}

class FigureBuilder {
  constructor(readonly k: Kit, readonly frame: THREE.Matrix4) {}

  /** A box at local (x, y, z) in the given frame. */
  part(key: string, x: number, y: number, z: number, w: number, h: number, d: number, tint: number | THREE.Color, r = 0.02, frame = this.frame, rx = 0): void {
    const m = frame.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), rx), new THREE.Vector3(1, 1, 1)));
    this.k.add(key, this.k.boxGeo(w, h, d, r), m, tint, {});
  }

  /** A limb segment from a to b (figure space), w × d thick, its front facing `ref`. */
  seg(key: string, a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, tint: number | THREE.Color, r = 0.025, ref = new THREE.Vector3(0, 0, -1), extra = 0.03, along = 0.5): THREE.Matrix4 {
    const dir = b.clone().sub(a);
    const len = dir.length() + extra;
    const m = basis(dir, ref);
    m.setPosition(a.clone().lerp(b, along));
    this.k.add(key, this.k.boxGeo(w, len, d, r), m, tint, {});
    return m;
  }

  /** A box placed in a limb's frame `m` at local offset. */
  on(key: string, m: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, tint: number | THREE.Color, r = 0.015): void {
    const mm = m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z));
    this.k.add(key, this.k.boxGeo(w, h, d, r), mm, tint, {});
  }
}

export interface Figure {
  group: THREE.Group;
}

export function buildFigure(k: Kit, o: FigureOpts): Figure {
  const t = TEAM[o.team];
  const small = k.p.smallParts;
  const skin = o.skin ?? 0xd9a77e;
  const root = new THREE.Matrix4();
  const fb = new FigureBuilder(k, root);
  const pose = o.pose;
  const weaponId: ReplicaId = o.weapon ?? (pose === 'pistol' ? 'pistol' : 'aeg');

  // Upper body yaw: bladed towards the gun on aim and ready.
  const yaw = pose === 'aim' || pose === 'ready' ? 0.42 : pose === 'run' ? 0.12 : 0;
  const lean = pose === 'aim' ? 0.08 : pose === 'run' ? 0.22 : 0.03;
  const pelvisY = pose === 'run' ? 0.92 : 0.96;
  const chest = new THREE.Matrix4().compose(new THREE.Vector3(0, pelvisY, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-lean, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  const cp = (x: number, y: number, z: number) => new THREE.Vector3(x, y - pelvisY, z).applyMatrix4(chest);
  const torso = new FigureBuilder(k, chest);
  const ty = (y: number) => y - pelvisY;

  // ---- Legs
  const hipL = new THREE.Vector3(-0.1, pelvisY - 0.02, 0);
  const hipR = new THREE.Vector3(0.1, pelvisY - 0.02, 0);
  let footL = new THREE.Vector3(-0.15, 0.1, -0.16);
  let footR = new THREE.Vector3(0.17, 0.1, 0.17);
  let yawL = -0.25;
  let yawR = 0.55;
  if (pose === 'hit' || pose === 'pistol') {
    footL = new THREE.Vector3(-0.15, 0.1, -0.05);
    footR = new THREE.Vector3(0.15, 0.1, 0.06);
    yawL = -0.1;
    yawR = 0.15;
  }
  if (pose === 'run') {
    footL = new THREE.Vector3(-0.12, 0.24, 0.32);
    footR = new THREE.Vector3(0.12, 0.1, -0.34);
    yawL = 0;
    yawR = 0;
  }
  for (const [hip, foot, side, fy] of [[hipL, footL, -1, yawL], [hipR, footR, 1, yawR]] as const) {
    const knee = ik(hip, foot, 0.45, 0.43, new THREE.Vector3(side * 0.15, 0, -1));
    const thigh = fb.seg('cloth', hip, knee, 0.16, 0.17, t.cloth, 0.04);
    const shin = fb.seg('cloth', knee, foot, 0.125, 0.13, t.cloth, 0.035);
    // Knee pad: a chunky team-colour plate in front of the knee.
    const kneeFwd = new THREE.Matrix4().copy(shin).setPosition(knee);
    fb.on('armour', kneeFwd, 0, -0.03, -0.075, 0.12, 0.14, 0.05, t.main, 0.02);
    // Thigh band in team colour and a side pocket.
    fb.on('cloth', thigh, 0, 0.06, 0, 0.168, 0.05, 0.178, t.main, 0.02);
    if (small) {
      fb.on('gear', thigh, side * 0.085, -0.05, 0, 0.03, 0.14, 0.12, GEAR, 0.012);
      fb.on('gear', thigh, side * 0.1, -0.05, 0, 0.006, 0.03, 0.08, t.dark, 0.002);
    }
    // Boots: oversized, a toe cap, a lighter sole.
    const boot = new THREE.Matrix4().compose(foot.clone().setY(foot.y - 0.04), new THREE.Quaternion().setFromAxisAngle(Y, fy * -1 + (pose === 'run' && side < 0 ? 0 : 0)), new THREE.Vector3(1, 1, 1));
    if (pose === 'run' && side < 0) boot.multiply(new THREE.Matrix4().makeRotationX(0.6));
    fb.part('figRubber', 0, 0.02, -0.04, 0.13, 0.13, 0.29, BOOT, 0.04, boot);
    fb.part('figRubber', 0, -0.045, -0.04, 0.14, 0.035, 0.305, SOLE, 0.012, boot);
    fb.part('figRubber', 0, 0.1, 0.02, 0.135, 0.07, 0.15, BOOT, 0.03, boot);
    if (small) {
      fb.part('gear', 0, 0.01, -0.16, 0.12, 0.08, 0.05, GEAR, 0.02, boot);
      for (let i = 0; i < 3; i++) fb.part('gear', 0, 0.07 + i * 0.025, -0.065 + i * 0.02, 0.07, 0.008, 0.02, 0x9aa0a8, 0.003, boot);
    }
  }

  // ---- Pelvis and torso (in the chest frame)
  torso.part('cloth', 0, ty(0.97), 0, 0.33, 0.17, 0.21, t.cloth, 0.05);
  torso.part('gear', 0, ty(1.065), 0, 0.35, 0.065, 0.235, GEAR_DARK, 0.02);
  torso.part('steel', 0, ty(1.065), -0.12, 0.06, 0.045, 0.012, 0xb8bec6, 0.005);
  torso.part('cloth', 0, ty(1.18), 0, 0.31, 0.2, 0.2, t.shirt, 0.05);
  torso.part('cloth', 0, ty(1.39), 0, 0.4, 0.27, 0.235, t.shirt, 0.06);
  // Plate carrier: front and back plates, the cummerbund, shoulder straps.
  torso.part('armour', 0, ty(1.34), -0.135, 0.33, 0.32, 0.06, t.main, 0.025);
  torso.part('armour', 0, ty(1.36), 0.135, 0.33, 0.34, 0.06, t.dark, 0.025);
  for (const s of [-1, 1]) {
    torso.part('gear', s * 0.18, ty(1.25), 0, 0.05, 0.17, 0.27, GEAR, 0.02);
    torso.part('gear', s * 0.11, ty(1.52), 0, 0.07, 0.04, 0.28, GEAR, 0.015);
  }
  if (small) {
    // MOLLE webbing: rows of loops on the back plate and the cummerbund.
    for (let r = 0; r < 5; r++) {
      torso.part('gear', 0, ty(1.24 + r * 0.05), 0.168, 0.3, 0.014, 0.008, GEAR_DARK, 0.002);
      for (const s2 of [-1, 1]) torso.part('gear', s2 * 0.207, ty(1.18 + r * 0.035), 0, 0.006, 0.012, 0.24, GEAR_DARK, 0.002);
    }
    // Plate carrier drag handle and a name tape.
    torso.part('gear', 0, ty(1.53), 0.17, 0.12, 0.03, 0.03, GEAR_DARK, 0.01);
    torso.part('gear', 0.04, ty(1.44), -0.168, 0.14, 0.03, 0.006, 0xe7e3d8, 0.002);
  }
  // A bold white stripe and a glowing strip across the plate (Marathon's graphic language).
  torso.part('armour', -0.1, ty(1.34), -0.167, 0.045, 0.3, 0.008, 0xf2f0ea, 0.003);
  if (k.p.emissive) torso.part('figGlow', 0.04, ty(1.475), -0.166, 0.2, 0.012, 0.006, new THREE.Color(t.glow).multiplyScalar(5), 0.003);
  // Magazine pouches with magazines showing, an admin pouch.
  for (let i = 0; i < 3; i++) {
    const x = -0.1 + i * 0.1;
    torso.part('gear', x, ty(1.235), -0.185, 0.088, 0.13, 0.055, GEAR, 0.012);
    torso.part('gunPolymer', x, ty(1.31), -0.185, 0.06, 0.035, 0.03, 0x24272c, 0.006);
    if (small) torso.part('gear', x, ty(1.29), -0.214, 0.07, 0.02, 0.006, t.dark, 0.002);
  }
  if (small) {
    torso.part('gear', 0.09, ty(1.415), -0.174, 0.11, 0.07, 0.03, GEAR, 0.01);
    torso.part('gear', 0.09, ty(1.415), -0.19, 0.06, 0.03, 0.004, 0xe7e3d8, 0.002); // a patch
    torso.part('gear', -0.15, ty(1.1), -0.08, 0.07, 0.1, 0.07, GEAR, 0.012); // belt pouch
    torso.part('gear', 0.17, ty(1.0), 0.02, 0.05, 0.16, 0.08, GEAR, 0.012); // dump pouch
  }
  // Back pack with an antenna.
  if (o.pack !== false) {
    torso.part('gear', 0, ty(1.33), 0.205, 0.27, 0.34, 0.09, GEAR, 0.03);
    torso.part('gear', 0, ty(1.24), 0.252, 0.22, 0.12, 0.02, t.dark, 0.008);
    if (small) {
      const ant = chest.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0.09, ty(1.66), 0.22), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.15), new THREE.Vector3(1, 1, 1)));
      k.add('gunPolymer', new THREE.CylinderGeometry(0.005, 0.007, 0.32, 6), ant, 0x1f2226, {});
      if (k.p.emissive) k.add('figGlow', new THREE.SphereGeometry(0.009, 8, 6), ant.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.165, 0)), new THREE.Color(t.glow).multiplyScalar(6), {});
    }
  }

  // ---- Head
  const head = chest.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, ty(1.58), 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(pose === 'aim' ? 0.12 : 0, -yaw * 0.8, pose === 'aim' ? 0.12 : 0, 'YXZ')), new THREE.Vector3(1, 1, 1)));
  const hb = new FigureBuilder(k, head);
  hb.part('skin', 0, 0.0, 0, 0.11, 0.09, 0.11, skin, 0.03);
  hb.part('skin', 0, 0.13, -0.005, 0.19, 0.23, 0.215, skin, 0.06);
  if ((o.face ?? 'mask') === 'mask') {
    hb.part('gear', 0, 0.065, -0.1, 0.175, 0.095, 0.05, GEAR_DARK, 0.025);
    if (small) for (let i = 0; i < 4; i++) hb.part('gear', 0, 0.035 + i * 0.02, -0.127, 0.12, 0.006, 0.004, 0x1b1d21, 0.001);
  } else if (small) {
    hb.part('skin', 0, 0.12, -0.118, 0.035, 0.05, 0.03, new THREE.Color(skin).multiplyScalar(0.95), 0.012);
  }
  // Full-seal goggles: a dark visor in a gear frame, a strap round the head, a glowing edge.
  hb.part('gear', 0, 0.16, -0.098, 0.205, 0.08, 0.04, GEAR_DARK, 0.02);
  hb.part('visor', 0, 0.162, -0.118, 0.185, 0.06, 0.012, 0x1a2a3a, 0.008);
  hb.part('gear', 0, 0.16, 0.0, 0.198, 0.03, 0.225, GEAR_DARK, 0.012);
  if (k.p.emissive) hb.part('figGlow', 0, 0.125, -0.119, 0.15, 0.006, 0.004, new THREE.Color(t.glow).multiplyScalar(5), 0.002);
  const hg = o.headgear ?? 'helmet';
  if (hg === 'helmet') {
    hb.part('armour', 0, 0.255, 0.0, 0.245, 0.12, 0.265, t.main, 0.05);
    hb.part('armour', 0, 0.205, 0.0, 0.25, 0.05, 0.27, t.dark, 0.02);
    if (small) {
      for (const s of [-1, 1]) hb.part('gear', s * 0.128, 0.215, 0.0, 0.015, 0.035, 0.16, GEAR, 0.006);
      hb.part('steel', 0, 0.255, -0.135, 0.06, 0.05, 0.02, 0x5c626b, 0.008);
      hb.part('armour', 0.06, 0.318, 0.02, 0.06, 0.008, 0.18, 0xf2f0ea, 0.003);
      hb.part('gear', -0.05, 0.316, 0.04, 0.06, 0.006, 0.07, GEAR_DARK, 0.002);
      hb.part('gear', 0, 0.06, 0.0, 0.17, 0.012, 0.012, GEAR_DARK, 0.004); // chin strap
      if (k.p.emissive) hb.part('figGlow', 0, 0.25, 0.135, 0.02, 0.02, 0.006, new THREE.Color(0xff3030).multiplyScalar(5), 0.004); // IR strobe
    }
    // Headset cups under the helmet.
    for (const s of [-1, 1]) hb.part('gear', s * 0.112, 0.13, 0.0, 0.04, 0.085, 0.085, GEAR, 0.02);
  } else if (hg === 'cap') {
    hb.part('cloth', 0, 0.245, 0.005, 0.205, 0.07, 0.225, t.main, 0.035);
    hb.part('cloth', 0, 0.218, -0.13, 0.18, 0.015, 0.09, t.dark, 0.006);
    for (const s of [-1, 1]) hb.part('gear', s * 0.105, 0.13, 0.0, 0.035, 0.08, 0.08, GEAR, 0.02);
  } else {
    hb.part('armour', 0, 0.245, 0.0, 0.225, 0.1, 0.245, t.main, 0.06);
    hb.part('armour', 0, 0.29, 0.0, 0.06, 0.03, 0.2, t.dark, 0.012);
  }

  // ---- Weapon and arms
  const k2 = new Kit(k.p);
  k2.envMap = k.envMap;
  const rep = buildReplica(k2, weaponId, o.weaponOpts ?? (weaponId === 'aeg' ? { optic: 'redDot', grip: 'vertical', accent: t.main } : { accent: t.main }));
  const wm = new THREE.Matrix4();
  const shR = cp(0.21, 1.47, 0);
  const shL = cp(-0.21, 1.47, 0);
  let handR: THREE.Vector3;
  let handL: THREE.Vector3;
  if (pose === 'aim' || pose === 'ready') {
    // The butt in the right shoulder pocket, the bore forward (pitched down for ready).
    const butt = cp(0.12, 1.44, -0.13);
    const pitch = pose === 'ready' ? -0.6 : -0.02;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, 0.02, 0, 'YXZ'));
    wm.compose(new THREE.Vector3(), q, new THREE.Vector3(1, 1, 1));
    const off = rep.butt.clone().applyQuaternion(q);
    wm.setPosition(butt.clone().sub(off));
    handR = rep.grip.clone().applyMatrix4(wm);
    handL = rep.support.clone().applyMatrix4(wm);
  } else if (pose === 'pistol') {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, 0, 0));
    wm.compose(new THREE.Vector3(0.0, 1.36, -0.55), q, new THREE.Vector3(1, 1, 1));
    handR = rep.grip.clone().applyMatrix4(wm);
    handL = rep.support.clone().applyMatrix4(wm).add(new THREE.Vector3(-0.03, 0, 0));
  } else if (pose === 'run') {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0.5, 0.2, 'YXZ'));
    wm.compose(new THREE.Vector3(0.05, 1.26, -0.3), q, new THREE.Vector3(1, 1, 1));
    handR = rep.grip.clone().applyMatrix4(wm);
    handL = rep.support.clone().applyMatrix4(wm);
  } else {
    // Hit: the right hand up high, the replica hanging muzzle-down from the left hand.
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.45, 0.25, 0, 'YXZ'));
    wm.compose(new THREE.Vector3(-0.3, 0.9, -0.12), q, new THREE.Vector3(1, 1, 1));
    handL = rep.grip.clone().applyMatrix4(wm);
    handR = new THREE.Vector3(0.24, 2.08, -0.04);
  }
  rep.group.applyMatrix4(wm);
  for (const [sh, hand, side] of [[shL, handL, -1], [shR, handR, 1]] as const) {
    const wrist = hand.clone().add(sh.clone().sub(hand).normalize().multiplyScalar(0.06));
    const pole = pose === 'hit' && side > 0 ? new THREE.Vector3(1, 0, 0.3) : new THREE.Vector3(side * 0.9, -1, 0.3);
    const elbow = ik(sh, wrist, 0.29, 0.27, pole);
    const upper = fb.seg('cloth', sh, elbow, 0.105, 0.11, t.shirt, 0.035);
    const fore = fb.seg('cloth', elbow, wrist, 0.09, 0.095, t.shirt, 0.03);
    // Shoulder plate, elbow pad, glove.
    const shoulder = new THREE.Matrix4().copy(upper).setPosition(sh);
    fb.on('armour', shoulder, 0, -0.04, 0, 0.13, 0.11, 0.13, t.main, 0.025);
    fb.on('armour', new THREE.Matrix4().copy(fore).setPosition(elbow), 0, 0.0, 0.0, 0.1, 0.07, 0.108, GEAR, 0.02);
    fb.on('cloth', fore, 0, -0.06, 0, 0.098, 0.06, 0.103, GEAR_DARK, 0.02);
    const glove = basis(hand.clone().sub(wrist), new THREE.Vector3(side, 0, 0));
    glove.setPosition(wrist.clone().lerp(hand, 0.55));
    fb.on('figRubber', glove, 0, 0, 0, 0.05, 0.1, 0.085, GEAR_DARK, 0.018);
    if (small) {
      fb.on('figRubber', glove, side * 0.02, 0.0, -0.01, 0.025, 0.07, 0.04, GEAR_DARK, 0.01);
      fb.on('gear', glove, 0, -0.02, 0.0, 0.054, 0.025, 0.088, t.main, 0.008);
      fb.on('armour', glove, -side * 0.026, 0.02, 0.0, 0.008, 0.045, 0.07, GEAR, 0.004);
      fb.on('cloth', fore, 0, 0.11, 0, 0.1, 0.025, 0.105, new THREE.Color(t.shirt).multiplyScalar(0.85), 0.01);
    }
  }
  const group = k.build();
  group.add(rep.group);
  return { group };
}

/** First-person arms and replica, in camera space (camera looks down -Z). */
export function buildViewmodel(k: Kit, team: 'blue' | 'orange', id: ReplicaId, opts: ReplicaOpts): THREE.Group {
  const t = TEAM[team];
  const fb = new FigureBuilder(k, new THREE.Matrix4());
  const k2 = new Kit(k.p);
  k2.envMap = k.envMap;
  const rep = buildReplica(k2, id, opts);
  const wm = new THREE.Matrix4().compose(new THREE.Vector3(0.23, -0.27, -0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.03, 0.07, -0.04, 'YXZ')), new THREE.Vector3(1, 1, 1));
  rep.group.applyMatrix4(wm);
  const handR = rep.grip.clone().applyMatrix4(wm);
  const handL = rep.support.clone().applyMatrix4(wm);
  for (const [sh, hand, side] of [[new THREE.Vector3(-0.2, -0.5, 0.05), handL, -1], [new THREE.Vector3(0.3, -0.5, 0.1), handR, 1]] as const) {
    const wrist = hand.clone().add(sh.clone().sub(hand).normalize().multiplyScalar(0.06));
    const elbow = ik(sh, wrist, 0.29, 0.27, new THREE.Vector3(side, -1, 0.2));
    fb.seg('cloth', sh, elbow, 0.105, 0.11, GEAR, 0.035);
    const fore = fb.seg('cloth', elbow, wrist, 0.09, 0.095, GEAR, 0.03);
    fb.on('armour', new THREE.Matrix4().copy(fore).setPosition(elbow), 0, 0.0, 0.0, 0.1, 0.07, 0.108, GEAR, 0.02);
    fb.on('cloth', fore, 0, -0.06, 0, 0.098, 0.06, 0.103, GEAR_DARK, 0.02);
    fb.on('cloth', fore, 0, 0.02, 0, 0.094, 0.025, 0.1, t.main, 0.01);
    const glove = basis(hand.clone().sub(wrist), new THREE.Vector3(side, 0, 0));
    glove.setPosition(wrist.clone().lerp(hand, 0.55));
    fb.on('figRubber', glove, 0, 0, 0, 0.05, 0.1, 0.085, GEAR_DARK, 0.018);
    if (k.p.smallParts) {
      fb.on('figRubber', glove, side * 0.02, 0.0, -0.01, 0.025, 0.07, 0.04, GEAR_DARK, 0.01);
      fb.on('gear', glove, 0, -0.02, 0.0, 0.054, 0.025, 0.088, t.main, 0.008);
    }
  }
  const g = k.build(false);
  g.add(rep.group);
  return g;
}

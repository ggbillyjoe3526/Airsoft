import * as THREE from 'three';
import { FIGURE, type FigureLook } from '../config/characters';
import type { FigurePalette } from './figurePalette';
import { type PartBuilder, type PartLook, shadowLimb } from './figureParts';
import { band, basis, ik, limbGeo, type ProfileStop, V } from './figureShapes';

/**
 * Robot figures (G7, the concept's robots; Settings › Look › Robots): a shell chassis, light or dark by team, on dark
 * joints, with team panels on the limbs and a sensor head with a visor and a light line. Airsoft first, robot second:
 * a robot wears the same plate carrier in the team colour as the humans, so a team reads the same either way. Each
 * function adds one part's pieces to a builder in that part's own space, as figureHuman.ts does.
 */

const F = FIGURE;
const G = FIGURE.colors;
const R = FIGURE.robot;
const FIN = FIGURE.finish;
const SHELL: PartLook = { finish: FIN.robot, edge: true };
const JOINT: PartLook = { finish: FIN.rubber };
const GEAR: PartLook = { finish: FIN.fabric, edge: true };
const TEAM: PartLook = { finish: FIN.robot };
const CHROME: PartLook = { finish: FIN.chrome };

/** A shell-plated limb from `a` to `b` (radius `ra` to `rb`) over a dark joint rod, a team panel down its front. */
function robotLimb(b: PartBuilder, pal: FigurePalette, a: THREE.Vector3, to: THREE.Vector3, ra: number, rb: number, pole: THREE.Vector3, panel = true): THREE.Matrix4 {
  const dir = to.clone().sub(a).normalize();
  const len = a.distanceTo(to);
  b.rod(R.joint, a, to, Math.min(ra, rb) * 0.55, JOINT, 6);
  const sides = b.overhaul ? 8 : 6;
  const prof: readonly ProfileStop[] = [[0, ra * 0.92, ra * 0.88], [0.25, ra, ra * 0.95], [1, rb, rb * 0.94]];
  const from = a.clone().addScaledVector(dir, len * 0.12);
  const place = basis(dir, pole).setPosition(from);
  b.add(limbGeo(len * 0.8, prof, sides, b.overhaul ? 4 : 1).applyMatrix4(place), pal.shell, SHELL, shadowLimb(len * 0.8, prof)?.applyMatrix4(place) ?? null);
  const frame = basis(dir, pole).setPosition(a);
  if (panel) b.box(pal.main, ra * 0.9, len * 0.32, 0.012, 0, len * 0.45, ra * 0.97, TEAM, frame);
  return frame;
}

/** A hinge at `at` across the plane of `a`, `at` and `b` (an elbow, a knee); detailed, a chrome pin through it. */
function hinge(b: PartBuilder, at: THREE.Vector3, a: THREE.Vector3, to: THREE.Vector3, r: number, wide: number): void {
  const axis = new THREE.Vector3().crossVectors(a.clone().sub(at), to.clone().sub(at));
  if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
  const frame = basis(axis.normalize(), a.clone().sub(at)).setPosition(at);
  b.cylinder(R.joint, r, wide, frame, 0, 0, 0, JOINT);
  if (b.overhaul) b.cylinder(R.chrome, r * 0.45, wide + 0.012, frame, 0, 0, 0, CHROME);
}

/** A piston from `a` to `b` (detailed only): a dark cylinder and a chrome rod. */
function piston(b: PartBuilder, a: THREE.Vector3, to: THREE.Vector3): void {
  if (!b.overhaul) return;
  const mid = a.clone().lerp(to, 0.55);
  b.rod(R.joint, a, mid, 0.011, JOINT, 6);
  b.rod(R.chrome, mid, to, 0.0065, CHROME, 6);
}

/** One leg in its own space, as humanLeg: shell thigh and shin, a knee hinge, a team knee plate, a plated foot. */
export function robotLeg(b: PartBuilder, pal: FigurePalette, side: number): void {
  const hip = V(0, 0, 0);
  const knee = V(0, -F.knee, -0.015);
  const foot = V(0, -F.foot, 0);
  const ankle = foot.clone().add(V(0, F.ankle, 0));
  const pole = V(side * 0.15, 0, -1);
  robotLimb(b, pal, hip, knee, 0.078, 0.06, pole);
  robotLimb(b, pal, knee, ankle, 0.058, 0.044, pole, false);
  hinge(b, knee, hip, ankle, 0.05, 0.1);
  b.sphere(R.joint, hip, 0.06, JOINT);
  // The knee plate in the team colour, and a calf piston.
  b.block(pal.main, 0.085, 0.11, 0.03, 0, -F.knee - 0.03, -0.075, TEAM);
  piston(b, knee.clone().add(V(0, -0.06, 0.05)), ankle.clone().add(V(0, 0.04, 0.04)));
  // The foot: a sole plate, a hinged toe, a dark tread.
  b.block(pal.shell, 0.115, 0.06, 0.2, 0, foot.y - 0.055, -0.01, SHELL);
  b.block(pal.shell, 0.105, 0.04, 0.09, 0, foot.y - 0.07, -0.16, SHELL, undefined, new THREE.Euler(0.08, 0, 0));
  b.box(R.joint, 0.125, 0.022, 0.31, 0, foot.y - 0.088, -0.05, JOINT);
  if (b.overhaul) hinge(b, ankle, knee, ankle.clone().add(V(0, 0, -0.2)), 0.034, 0.075);
}

/**
 * The chassis in upper-body space (as humanBody): a pelvis block with a team panel, a spine of rings, a shell chest
 * with a collar and shoulder caps, and over it the team's plate carrier with grey pouches (and a pack); then the head.
 */
export function robotBody(b: PartBuilder, look: FigureLook, pal: FigurePalette, hy: number): void {
  const at = (y: number): THREE.Vector3 => V(0, y + hy, 0);
  b.block(pal.shell, 0.3, 0.14, 0.2, 0, 0.95 + hy, 0, SHELL);
  b.box(pal.main, 0.14, 0.08, 0.01, 0, 0.95 + hy, -0.103, TEAM);
  b.rod(R.joint, at(0.98), at(1.25), 0.06, JOINT, b.overhaul ? 12 : 6);
  for (const [y, r] of [[1.06, 0.105], [1.115, 0.1]] as const) b.cylinder(R.joint, r, 0.035, new THREE.Matrix4(), 0, y + hy, 0, JOINT, undefined, false);
  b.block(pal.shell, 0.38, 0.27, 0.24, 0, 1.36 + hy, 0, SHELL);
  b.block(pal.shell, 0.22, 0.05, 0.16, 0, 1.5 + hy, 0, SHELL);
  // The carrier: front and back plates and a cummerbund in the team colour, over the chest's lower half.
  b.block(pal.main, 0.3, 0.24, 0.05, 0, 1.3 + hy, -0.14, TEAM);
  b.block(pal.main, 0.3, 0.26, 0.05, 0, 1.31 + hy, 0.14, TEAM);
  for (const side of [-1, 1]) {
    const cummerbund = band(0.26, 0.15, 0.022, 0.2, b.detail.band[0]).rotateY((side * Math.PI) / 2).scale(1, 1, 0.68);
    const cast = band(0.26, 0.15, 0.022, 0.2, 2).rotateY((side * Math.PI) / 2).scale(1, 1, 0.68);
    b.addIn(new THREE.Matrix4(), cummerbund, 0, 1.26 + hy, 0, pal.main, TEAM, undefined, undefined, cast);
    b.box(G.gearDark, 0.06, 0.26, 0.27, side * 0.11, 1.38 + hy, 0, GEAR); // the straps over the shoulders
    b.block(pal.shell, 0.12, 0.05, 0.14, side * 0.235, 1.5 + hy, 0, SHELL, undefined, new THREE.Euler(0, 0, -side * 0.35)); // shoulder caps
    b.box(pal.main, 0.11, 0.06, 0.012, side * 0.12, 1.44 + hy, -0.122, TEAM); // the chest's team panels
  }
  for (let i = 0; i < 3; i++) {
    const x = -0.095 + i * 0.095;
    b.block(G.gear, 0.082, 0.13, 0.05, x, 1.255 + hy, -0.19, GEAR);
    b.box(G.polymer, 0.06, 0.03, 0.028, x, 1.33 + hy, -0.19, GEAR);
  }
  b.rod(R.joint, at(1.5), at(1.61), 0.04, JOINT, 8); // the neck
  if (look.pack) b.block(G.gear, 0.24, 0.3, 0.07, 0, 1.33 + hy, 0.2, GEAR);
  if (b.overhaul) {
    b.cylinder(R.joint, 0.108, 0.035, new THREE.Matrix4(), 0, 1.17 + hy, 0, JOINT);
    for (const x of [-0.06, 0.06]) b.rod(G.rubber, at(1).add(V(x, 0, 0.07)), at(1.25).add(V(x * 1.2, 0, 0.08)), 0.009, JOINT, 6); // cables
    for (const y of [1.53, 1.56, 1.59]) b.cylinder(0x3a3f46, 0.048, 0.012, new THREE.Matrix4(), 0, y + hy, 0, JOINT);
    b.box(G.polymer, 0.08, 0.022, 0.004, -0.12, 1.47 + hy, -0.122, GEAR); // a serial plate
  }
  robotHead(b, look, pal, new THREE.Matrix4().makeTranslation(0, F.headHeight - F.neckBelowHead + hy, 0));
}

/** The sensor head in frame `H` (as humanHead's): a rounded skull, a face plate, a visor with a light line, ear pods. */
export function robotHead(b: PartBuilder, _look: FigureLook, pal: FigurePalette, H: THREE.Matrix4): void {
  b.block(pal.shell, 0.17, 0.19, 0.2, 0, 0.15, 0.01, SHELL, H);
  b.block(pal.shell, 0.16, 0.03, 0.04, 0, 0.192, -0.088, SHELL, H, new THREE.Euler(0.3, 0, 0)); // brow
  b.block(R.joint, 0.13, 0.07, 0.07, 0, 0.078, -0.07, JOINT, H); // the face plate
  const segs = Math.max(3, b.detail.band[0] / 2);
  b.addIn(H, band(0.2, 0.05, 0.012, 0.104, segs), 0, 0.155, 0, R.visor, { finish: FIN.lens });
  // The light line across the visor: the team's glow (a bright paint: the figures' material has no emission).
  b.addIn(H, band(0.16, 0.009, 0.003, 0.111, segs), 0, 0.155, 0, pal.glow, { finish: FIN.lens });
  for (const side of [-1, 1]) {
    b.cylinder(R.joint, 0.036, 0.03, H, side * 0.094, 0.14, 0.015, JOINT, new THREE.Euler(0, 0, Math.PI / 2));
    b.cylinder(pal.main, 0.026, 0.008, H, side * 0.112, 0.14, 0.015, TEAM, new THREE.Euler(0, 0, Math.PI / 2));
  }
  b.box(pal.main, 0.05, 0.016, 0.15, 0, 0.248, 0.02, TEAM, H); // the crest stripe
  if (!b.overhaul) return;
  for (let i = 0; i < 4; i++) b.box(0x0e0f11, 0.08, 0.004, 0.004, 0, 0.06 + i * 0.012, -0.106, JOINT, H); // vents
  b.rod(G.polymer, V(-0.1, 0.16, 0.03).applyMatrix4(H), V(-0.12, 0.3, 0.08).applyMatrix4(H), 0.004, JOINT, 5); // antenna
  b.sphere(pal.glow, V(-0.12, 0.3, 0.08).applyMatrix4(H), 0.008, { finish: FIN.lens });
}

/**
 * One robot arm from the shoulder to the wrist (as humanArm): shell upper arm with a team panel, a hinged elbow, a
 * shell forearm with a team plate, a wrist joint. Detailed: a forearm piston.
 */
export function robotArm(b: PartBuilder, pal: FigurePalette, sh: THREE.Vector3, wrist: THREE.Vector3, _out: THREE.Vector3, pole: THREE.Vector3): void {
  const elbow = ik(sh, wrist, F.upperArm, F.forearm, pole);
  robotLimb(b, pal, sh, elbow, 0.056, 0.046, pole);
  robotLimb(b, pal, elbow, wrist, 0.05, 0.038, pole, false);
  hinge(b, elbow, sh, wrist, 0.042, 0.085);
  b.sphere(R.joint, sh, 0.06, JOINT);
  const fd = wrist.clone().sub(elbow).normalize();
  const pn = pole.clone().addScaledVector(fd, -pole.dot(fd)).normalize();
  piston(b, elbow.clone().addScaledVector(fd, 0.05).addScaledVector(pn, 0.05), wrist.clone().addScaledVector(fd, -0.05).addScaledVector(pn, 0.035));
  const plate = basis(fd, pn.clone().negate()).setPosition(elbow.clone().lerp(wrist, 0.45));
  b.box(pal.main, 0.05, 0.12, 0.012, 0, 0, 0.048, TEAM, plate);
  b.cylinder(R.joint, 0.036, 0.03, basis(fd, pn).setPosition(wrist.clone().addScaledVector(fd, -0.012)), 0, 0, 0, JOINT);
}

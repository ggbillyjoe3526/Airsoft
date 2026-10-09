import * as THREE from 'three';
import { FIGURE, type FigureLook } from '../config/characters';
import { FIGURE_SHADOW_PROXY } from '../config/render';
import type { FigurePalette } from './figurePalette';
import type { PartBuilder, PartLook } from './figureParts';
import { band, ik, insideOf, type ProfileStop, shapedBand, shellGeo, V } from './figureShapes';

/**
 * Human figures (G7, the concept's v3 humans): camo trousers and shirt under a plate carrier in the team colour, padded
 * knees in the team colour, shaped boots, and a covered head: a high-cut or bump helmet, a balaclava or a full-face
 * visor, goggles and a mesh mask (the visor covers both) and a neck gaiter. No skin shows anywhere: under every helmet
 * is a hood. Each function adds one part's pieces to a builder in that part's own space (see characterModels.ts).
 */

const F = FIGURE;
const G = FIGURE.colors;
const FIN = FIGURE.finish;
const FWD = V(0, 0, -1);
const RUBBER: PartLook = { finish: FIN.rubber, edge: true };
const GEAR: PartLook = { finish: FIN.fabric, edge: true };
const POLY: PartLook = { finish: FIN.polymer, edge: true };
const SHELL: PartLook = { finish: FIN.shell };
const LENS: PartLook = { finish: FIN.lens };
/** The team colour itself: never shaded, so it stays exact. */
const TEAM: PartLook = { finish: FIN.shell };

/** A colour `k` times as bright (clamped). */
export const tone = (color: number, k: number): number => new THREE.Color(color).multiplyScalar(k).getHex();

/** Each camo part's own pattern (render/figureCamo.ts seeds, at least 1), added to the figure's (FigurePalette.camoSeed). */
const CAMO = { legL: 1, legR: 2, body: 3, armL: 4, armR: 5 } as const;
const THIGH: readonly ProfileStop[] = [[0, 0.092, 0.096], [0.45, 0.08, 0.085], [1, 0.062, 0.066]];
const SHIN: readonly ProfileStop[] = [[0, 0.062, 0.064], [0.3, 0.058, 0.062], [0.8, 0.048, 0.05], [1, 0.054, 0.056]];
const BOOT_SHAFT: readonly ProfileStop[] = [[0, 0.056, 0.064], [1, 0.058, 0.064]];
const HIPS: readonly ProfileStop[] = [[0, 0.15, 0.1], [0.5, 0.165, 0.11], [1, 0.155, 0.103]];
const BELT: readonly ProfileStop[] = [[0, 0.17, 0.115], [1, 0.168, 0.113]];
const SHIRT: readonly ProfileStop[] = [[0, 0.15, 0.102], [0.25, 0.148, 0.1], [0.55, 0.178, 0.116], [0.82, 0.19, 0.112], [1, 0.08, 0.075]];
const UPPER_ARM: readonly ProfileStop[] = [[0, 0.06, 0.058], [0.45, 0.054, 0.052], [1, 0.046, 0.045]];
const FOREARM: readonly ProfileStop[] = [[0, 0.048, 0.047], [0.3, 0.048, 0.046], [0.85, 0.038, 0.035], [1, 0.041, 0.038]];
const ARMBAND: readonly ProfileStop[] = [[0, 0.0585, 0.0565], [1, 0.0555, 0.0535]];
const CUFF: readonly ProfileStop[] = [[0, 0.042, 0.04], [1, 0.038, 0.036]];

/** One leg in its own space: the hip at the origin, the foot FIGURE.foot below. `side`: -1 left, 1 right. */
export function humanLeg(b: PartBuilder, pal: FigurePalette, side: number): void {
  const camo: PartLook = { camo: pal.camoSeed + (side < 0 ? CAMO.legL : CAMO.legR) };
  const hip = V(0, 0.03, 0);
  const knee = V(0, -F.knee, -0.015);
  const foot = V(0, -F.foot, 0);
  const ankle = foot.clone().add(V(0, F.ankle, 0));
  const thigh = b.limb(pal.camo, hip, knee, THIGH, camo);
  b.limb(pal.camo, knee, ankle, SHIN, camo);
  // A cargo pocket with its flap on the outside of the thigh.
  const tl = hip.distanceTo(knee);
  b.block(tone(pal.camo, 0.94), 0.03, 0.14, 0.12, side * 0.08, tl * 0.58, 0.005, { ...camo, edge: true }, thigh);
  // The knee pad, a moulded cap in the team colour.
  const pad = knee.clone().add(V(0, -0.03, -0.066));
  if (b.overhaul) {
    const dome = new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2);
    b.addIn(new THREE.Matrix4(), dome, pad.x, pad.y, pad.z + 0.022, pal.main, TEAM, undefined, V(0.056, 0.07, 0.036));
    b.block(G.gearDark, 0.03, 0.042, 0.012, pad.x, pad.y, pad.z - 0.012, RUBBER);
    for (const dy of [-0.06, 0.045]) b.limb(G.gearDark, knee.clone().add(V(0, dy - 0.013, 0)), knee.clone().add(V(0, dy + 0.013, 0)), [[0, 0.064, 0.067], [1, 0.063, 0.066]], RUBBER, FWD, 0);
  } else b.box(pal.main, 0.1, 0.11, 0.046, pad.x, pad.y, pad.z, TEAM);
  // The boot: a shaft, an upper narrowing to the toe, a darker sole.
  b.limb(G.boots, foot.clone().add(V(0, -0.055, 0)), foot.clone().add(V(0, 0.11, 0)), BOOT_SHAFT, RUBBER, FWD, 0);
  const upper = new THREE.BoxGeometry(0.11, 0.085, 0.29, b.overhaul ? 3 : 1, b.overhaul ? 2 : 1, b.overhaul ? 6 : 2);
  const p = upper.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const toe = Math.max(0, -z - 0.04);
    const heel = Math.max(0, z - 0.1);
    p.setX(i, p.getX(i) * (1 - toe * 1.6) * (1 - heel * 2));
    p.setY(i, p.getY(i) - (p.getY(i) > 0 ? toe * 0.42 : 0));
  }
  upper.deleteAttribute('normal');
  b.addIn(new THREE.Matrix4(), upper, foot.x, foot.y - 0.05, foot.z - 0.045, G.boots, RUBBER, undefined, undefined, new THREE.BoxGeometry(0.11, 0.085, 0.29));
  b.box(G.sole, 0.118, 0.026, 0.305, foot.x, foot.y - 0.088, foot.z - 0.045, { finish: FIN.rubber });
  if (b.overhaul) for (let i = 0; i < 4; i++) b.box(G.rubber, 0.05, 0.006, 0.012, 0, foot.y - 0.01 + i * 0.03, -0.062 - (i < 1 ? 0.02 : 0), RUBBER, undefined, new THREE.Euler(0.2, 0, 0)); // laces
}

/**
 * The body in upper-body space (`hy` added to a world height gives its height here): camo trousers' seat and a belt,
 * the shirt, and the plate carrier in the team colour all the way round (front and back plates, the cummerbund), with
 * grey pouches, an admin pouch with a team patch, a radio and a pack as the look has them; then the head.
 */
export function humanBody(b: PartBuilder, look: FigureLook, pal: FigurePalette, hy: number): void {
  const at = (y: number): THREE.Vector3 => V(0, y + hy, 0);
  const camo: PartLook = { camo: pal.camoSeed + CAMO.body };
  b.limb(pal.camo, at(0.84), at(1.08), HIPS, camo, FWD, 0, true);
  b.limb(G.gearDark, at(1.02), at(1.085), BELT, RUBBER, FWD, 0);
  b.box(G.buckle, 0.055, 0.04, 0.012, 0, 1.052 + hy, -0.116, { finish: FIN.steel });
  b.limb(pal.shirt, at(1.06), at(1.5), SHIRT, camo, FWD, 0, true);
  // The carrier: the team's colour, exact, on both plates and the cummerbund between them.
  b.block(pal.main, 0.3, 0.32, 0.058, 0, 1.33 + hy, -0.138, TEAM);
  b.block(pal.main, 0.3, 0.34, 0.058, 0, 1.35 + hy, 0.135, TEAM);
  for (const side of [-1, 1]) {
    const cummerbund = band(0.26, 0.15, 0.022, 0.155, b.detail.band[0]).rotateY((side * Math.PI) / 2).scale(1.25, 1, 0.82); // wider than the torso's hit box (FIGURE.torso)
    const cast = band(0.26, 0.15, 0.022, 0.155, 2).rotateY((side * Math.PI) / 2).scale(1.25, 1, 0.82);
    b.addIn(new THREE.Matrix4(), cummerbund, 0, 1.22 + hy, 0, pal.main, TEAM, undefined, undefined, cast);
    b.box(G.gear, 0.06, 0.022, 0.25, side * 0.1, 1.505 + hy, 0, GEAR); // shoulder straps
  }
  // Three magazine pouches with the magazines' tops showing, an admin pouch with the team's patch.
  for (let i = 0; i < 3; i++) {
    const x = -0.095 + i * 0.095;
    b.block(G.gear, 0.082, 0.13, 0.05, x, 1.235 + hy, -0.188, GEAR);
    b.box(G.polymer, 0.06, 0.03, 0.028, x, 1.31 + hy, -0.188, POLY);
    if (b.overhaul) b.box(G.rubber, 0.066, 0.006, 0.006, x, 1.3 + hy, -0.214, RUBBER); // bungee
  }
  b.block(G.gear, 0.14, 0.085, 0.032, 0, 1.41 + hy, -0.175, GEAR);
  b.box(pal.dark, 0.07, 0.045, 0.004, 0, 1.425 + hy, -0.193);
  if (look.radio) {
    b.block(G.gear, 0.05, 0.13, 0.07, -0.205, 1.22 + hy, -0.02, GEAR);
    if (b.overhaul) b.rod(G.polymer, V(-0.205, 1.28 + hy, -0.01), V(-0.24, 1.62 + hy, 0.02), 0.004, POLY, 5);
  }
  if (look.pack) {
    b.block(G.gear, 0.24, 0.32, 0.07, 0, 1.33 + hy, 0.2, GEAR);
    b.box(pal.dark, 0.2, 0.1, 0.012, 0, 1.24 + hy, 0.238);
    if (b.overhaul) b.rod(G.rubber, V(0.11, 1.48 + hy, 0.18), V(0.15, 1.5 + hy, -0.1), 0.006, RUBBER, 6); // drinking tube
  }
  if (b.overhaul) {
    // Webbing rows on the back plate, its drag handle, a name tape, a dump pouch on the right hip.
    for (let r = 0; r < 4; r++) b.box(G.gearDark, 0.28, 0.014, 0.006, 0, 1.24 + r * 0.06 + hy, 0.166, GEAR);
    b.box(G.gearDark, 0.11, 0.03, 0.03, 0, 1.53 + hy, 0.15, GEAR);
    b.box(0xe7e3d8, 0.16, 0.022, 0.004, 0, 1.465 + hy, -0.169);
    b.block(G.gear, 0.05, 0.15, 0.09, 0.17, 0.98 + hy, 0.04, GEAR);
  }
  humanHead(b, look, pal, new THREE.Matrix4().makeTranslation(0, F.headHeight - F.neckBelowHead + hy, 0));
}

/**
 * The head in frame `H` (at the base of the neck; the head's centre FIGURE.neckBelowHead above it): a hood (a balaclava
 * in the team's dark, or a dark hood under a helmet) and a neck gaiter, then the headgear, the goggles and the mesh
 * mask, or the visor.
 */
export function humanHead(b: PartBuilder, look: FigureLook, pal: FigurePalette, H: THREE.Matrix4): void {
  const [ws, hs] = b.detail.head;
  const hood = look.headgear === 'balaclava';
  const cloth = hood ? pal.dark : G.gearDark;
  const fabric: PartLook = { finish: FIN.fabric };
  b.addIn(H, new THREE.SphereGeometry(1, ws, hs), 0, 0.15, 0.012, cloth, fabric, undefined, hood ? V(0.096, 0.118, 0.108) : V(0.09, 0.108, 0.102));
  if (b.overhaul) b.addIn(H, new THREE.SphereGeometry(1, ws, hs), 0, 0.083, -0.018, cloth, fabric, new THREE.Euler(0.25, 0, 0), V(0.074, 0.066, 0.086)); // the jaw
  const gaiter = hood ? tone(pal.dark, 0.85) : tone(pal.shirt, F.palette.gaiter);
  b.addIn(H, new THREE.CylinderGeometry(0.064, 0.086, 0.115, ws, 1, true), 0, -0.005, 0.008, gaiter, fabric);
  if (look.headgear === 'visor') visor(b, H, pal);
  else {
    goggles(b, H, pal);
    mask(b, H);
  }
  if (hood) {
    if (b.overhaul) b.addIn(H, band(0.06, 0.035, 0.004, 0.118, 4), 0, 0.235, -0.01, pal.main, TEAM, new THREE.Euler(-0.9, 0, 0)); // team patch
    return;
  }
  helmet(b, look, pal, H);
}

/** A helmet shell in the team colour: high-cut (cut high over the ears, rails, a headset, a mount) or a bump helmet. */
function helmet(b: PartBuilder, look: FigureLook, pal: FigurePalette, H: THREE.Matrix4): void {
  const highCut = look.headgear === 'highCut';
  // Down low at the back, high over the ears, to the brow at the front; a high-cut shell cut higher still at the sides.
  const cut = (f: number, side: number): number => (f >= 0 ? 1.66 - 0.36 * f : 1.66 + 0.5 * -f) - (highCut ? 0.16 * THREE.MathUtils.smoothstep(side, 0.75, 0.97) * (1 - Math.abs(f)) : 0);
  const [ws, hs] = b.detail.shell;
  const shell = shellGeo(ws, hs, cut);
  const scale = V(0.118, 0.122, 0.128);
  if (b.overhaul) b.addIn(H, insideOf(shell, 0.95), 0, 0.148, 0.012, G.gearDark, { finish: FIN.fabric }, undefined, scale);
  b.addIn(H, shell, 0, 0.148, 0.012, pal.main, SHELL, undefined, scale, shellGeo(FIGURE_SHADOW_PROXY.dome[0], FIGURE_SHADOW_PROXY.dome[1], cut));
  const cup = (x: number): void => {
    b.cylinder(G.gear, 0.04, 0.034, H, x, 0.128, 0.012, GEAR, new THREE.Euler(0, 0, Math.PI / 2));
  };
  if (highCut) {
    for (const side of [-1, 1]) {
      const rail = band(0.14, 0.018, 0.012, 0.13, Math.max(3, b.detail.band[0] / 2)).rotateY((side * Math.PI) / 2);
      b.addIn(H, rail, 0, 0.165, 0.012, G.polymer, POLY, new THREE.Euler(0, 0, -side * 0.05));
      cup(side * 0.104);
    }
    b.box(G.polymer, 0.05, 0.03, 0.02, 0, 0.212, -0.118, POLY, H, new THREE.Euler(-0.55, 0, 0)); // the mount
    if (b.overhaul) {
      // A boom mic on the left, a battery pack on the back, a velcro panel and a strobe on top.
      b.rod(G.rubber, V(-0.112, 0.12, -0.01).applyMatrix4(H), V(-0.05, 0.075, -0.115).applyMatrix4(H), 0.004, RUBBER, 5);
      b.block(G.gear, 0.08, 0.05, 0.03, 0, 0.13, 0.142, GEAR, H, new THREE.Euler(0.25, 0, 0));
      b.box(pal.dark, 0.07, 0.006, 0.09, 0, 0.266, 0.02, {}, H, new THREE.Euler(0.1, 0, 0));
      b.box(G.rubber, 0.022, 0.018, 0.026, 0, 0.262, 0.075, RUBBER, H);
    }
    return;
  }
  for (const side of [-1, 1]) cup(side * 0.1);
  if (b.overhaul && look.headgear === 'bump') for (const z of [-0.04, 0, 0.04]) for (const side of [-1, 1]) b.box(0x111214, 0.012, 0.006, 0.028, side * 0.04, 0.258 - Math.abs(z) * 0.4, z, RUBBER, H); // vents
}

/** Goggles: a strap round the head, a rubber frame dipping over the nose, a lens in the team's tint. */
function goggles(b: PartBuilder, H: THREE.Matrix4, pal: FigurePalette): void {
  const [segs, rows] = b.detail.band;
  b.addIn(H, new THREE.CylinderGeometry(0.104, 0.104, 0.026, b.detail.head[0], 1, true), 0, 0.152, 0.012, G.gearDark, { finish: FIN.fabric });
  const noseCut = (xn: number, w: number, depth: number): number => depth * Math.max(0, 1 - (xn / w) ** 2) ** 1.5;
  const frameLo = (xn: number): number => -0.029 + noseCut(xn, 0.19, 0.024) + 0.016 * xn ** 8;
  const frameHi = (xn: number): number => 0.029 - 0.004 * xn * xn - 0.014 * xn ** 8;
  b.addIn(H, shapedBand(0.25, 0.02, 0.112, segs, rows, frameLo, frameHi), 0, 0.15, 0.004, G.rubber, RUBBER);
  const lensLo = (xn: number): number => -0.021 + noseCut(xn, 0.22, 0.02) + 0.012 * xn ** 8;
  const lensHi = (xn: number): number => 0.021 - 0.003 * xn * xn - 0.01 * xn ** 8;
  b.addIn(H, shapedBand(0.218, 0.004, 0.124, segs, rows, lensLo, lensHi, 0.003), 0, 0.151, 0.004, pal.lens, LENS);
  if (b.overhaul) for (const side of [-1, 1]) b.box(0x15161a, 0.008, 0.026, 0.02, side * 0.111, 0.151, -0.02, POLY, H, new THREE.Euler(0, side * 0.35, 0)); // strap clips
}

/** A perforated steel mesh mask cupped over the nose and mouth, its edges trimmed in rubber (detailed). */
function mask(b: PartBuilder, H: THREE.Matrix4): void {
  const [segs, rows] = b.detail.band;
  const lo = (xn: number): number => -0.04 + 0.03 * xn * xn;
  const hi = (xn: number): number => 0.03 + 0.014 * Math.max(0, 1 - (xn / 0.3) ** 2) - 0.006 * xn * xn;
  b.addIn(H, shapedBand(0.29, 0.005, 0.098, segs, rows, lo, hi, 0.018), 0, 0.085, -0.004, G.mask, { finish: FIN.mesh });
  if (!b.overhaul) return;
  for (const edge of [hi, lo]) b.addIn(H, shapedBand(0.296, 0.01, 0.098, segs, 1, (xn) => edge(xn) - 0.004, (xn) => edge(xn) + 0.004, 0.011), 0, 0.085, -0.004, G.rubber, RUBBER);
}

/** A full-face visor: a tinted shield from brow to chin on pivots in the team colour, a brow seal and a chin guard. */
function visor(b: PartBuilder, H: THREE.Matrix4, pal: FigurePalette): void {
  const [segs, rows] = b.detail.band;
  const lo = (xn: number): number => -0.066 + 0.05 * xn * xn;
  const hi = (xn: number): number => 0.054 - 0.01 * xn ** 6;
  b.addIn(H, shapedBand(0.3, 0.004, 0.126, segs, rows + 1, lo, hi, 0.016), 0, 0.12, 0.006, pal.lens, LENS);
  b.addIn(H, shapedBand(0.31, 0.012, 0.122, segs, 1, (xn) => hi(xn) - 0.004, (xn) => hi(xn) + 0.008, 0.01), 0, 0.12, 0.006, G.rubber, RUBBER);
  b.addIn(H, shapedBand(0.24, 0.014, 0.12, segs, 1, (xn) => lo(xn) - 0.026, (xn) => lo(xn) + 0.004, 0.014), 0, 0.12, 0.006, G.polymer, POLY);
  for (const side of [-1, 1]) b.cylinder(pal.main, 0.018, 0.012, H, side * 0.122, 0.15, 0.012, TEAM, new THREE.Euler(0, 0, Math.PI / 2));
}

/**
 * One arm from the shoulder `sh` to the wrist (the hand is placed first, see figureHands.ts): camo sleeves with the elbow
 * bent towards `pole` (two-bone IK), the team armband, a glove cuff. Detailed: a velcro patch on the upper arm and a team
 * tab on the cuff.
 */
export function humanArm(b: PartBuilder, pal: FigurePalette, sh: THREE.Vector3, wrist: THREE.Vector3, out: THREE.Vector3, pole: THREE.Vector3, side: number): void {
  const elbow = ik(sh, wrist, F.upperArm, F.forearm, pole);
  const camo: PartLook = { camo: pal.camoSeed + (side < 0 ? CAMO.armL : CAMO.armR) };
  const upper = b.limb(pal.camo, sh, elbow, UPPER_ARM, camo, pole);
  b.limb(pal.camo, elbow, wrist.clone().addScaledVector(out, -0.02), FOREARM, camo, pole);
  b.sphere(pal.camo, elbow, 0.047, camo);
  b.sphere(pal.camo, sh, 0.062, camo);
  const ul = sh.distanceTo(elbow);
  const ad = elbow.clone().sub(sh).normalize();
  b.limb(pal.main, sh.clone().addScaledVector(ad, ul * 0.42), sh.clone().addScaledVector(ad, ul * 0.62), ARMBAND, TEAM, pole, 0);
  const fd = wrist.clone().sub(elbow).normalize();
  b.limb(G.glove, wrist.clone().addScaledVector(fd, -0.05), wrist.clone().addScaledVector(fd, 0.012), CUFF, RUBBER, pole, 0);
  if (!b.overhaul) return;
  b.box(pal.dark, 0.012, 0.055, 0.07, side * 0.05, ul * 0.25, 0, {}, upper);
  b.limb(pal.main, wrist.clone().addScaledVector(fd, -0.044), wrist.clone().addScaledVector(fd, -0.03), [[0, 0.0435, 0.0415], [1, 0.0435, 0.0415]], TEAM, pole, 0);
}

import * as THREE from 'three';
import type { MagazineId } from '../config/attachments';
import { REPLICA_FINISH } from '../config/replicaFinish';
import { type MaterialKey, ModelBuilder, type Pt, roundedRect } from './replicaBuilder';

const F = REPLICA_FINISH;

/**
 * The replicas' fittable parts (split from replicaModels.ts, G2): optics, grips, magazines, lasers, torches, barrels and
 * muzzle devices, each drawn on demand into its own builder, and the layouts the viewmodel aims and fires by.
 */

/**
 * The red dot fitted to the rifle's receiver rail (an accessory, never part of the rifle: owner, 2026-10-03):
 * where its axis sits above the model's origin, where its hood starts and ends along the forward axis, and the hood's
 * half width outside and its window's inside (G2: an enclosed sight, square where it was a round tube).
 * The rifle's aiming hold (config/replicas.ts aimHold) puts this axis on the view's centre line.
 */
export const RIFLE_OPTIC = { axisUp: 0.126, from: -0.005, length: 0.056, outer: 0.022, inner: 0.018 } as const;

/** The 2× scope's body on the same axis (M17b): main tube, objective bell in front, eyepiece behind (metres). */
export const RIFLE_SCOPE = { from: -0.01, length: 0.11, outer: 0.014, inner: 0.012, bellLength: 0.035, bellOuter: 0.022, eyeLength: 0.03 } as const;

/**
 * Where a model's muzzle end is (M29b), forward from its origin (m): where its standard barrel ends and how high its bore
 * sits, how much further a longer barrel reaches, and how far beyond the barrel's end each muzzle device ('none': as it
 * comes) puts the muzzle.
 */
export interface MuzzleLayout {
  barrelEnd: number;
  up: number;
  extensions: Readonly<Record<string, number>>;
  tips: Readonly<Record<string, number>>;
}

/** The AEG's: a 0.1 m longer barrel; the flash hider 4.6 cm long, a silencer 12 cm. */
export const AEG_MUZZLE = { barrelEnd: 0.565, up: 0.034, extensions: { long: 0.1 }, tips: { none: 0.046, silencer: 0.12 } } satisfies MuzzleLayout;
/** The pistol's: no barrel swap; a silencer 10 cm. */
export const PISTOL_MUZZLE = { barrelEnd: 0.104, up: 0.015, extensions: {}, tips: { none: 0, silencer: 0.1 } } satisfies MuzzleLayout;
/** The Cyber Pistol's (M32): a longer slide, and nothing fits its muzzle. */
export const CYBER_MUZZLE = { barrelEnd: 0.114, up: 0.015, extensions: {}, tips: { none: 0 } } satisfies MuzzleLayout;

/**
 * Draws one fitted part (an optic, a grip, a magazine, the laser, a barrel) into its own builder. Every part the Loadout
 * can fit has an entry in its replica's table below, by name (the table keys are the viewmodel's 'kind:id' names); muzzle
 * devices have their own table, drawn on the muzzle mount.
 */
export type PartDraw = (b: ModelBuilder) => void;

/**
 * Draws a muzzle device (M29b) on the mount: from 0 (the fitted barrel's end) forward along the bore (`up` high), its
 * tip painted orange with `orangeTip`.
 */
export type MuzzleDraw = (b: ModelBuilder, orangeTip: boolean) => void;

/**
 * The red dot (G2: an enclosed reflex sight, as the concept): a squared hood you look through along the bore, a tinted
 * lens across its window two-thirds of the way forward, a sunshade lip over the front, on a low mount and riser clamped
 * to the rail. High: the dot on the lens, brightness buttons and a battery cap on the right, a windage turret on top
 * and the clamp's cross-bolt.
 */
function redDot(b: ModelBuilder): void {
  const o = RIFLE_OPTIC;
  const front = o.from + o.length;
  const steps = b.high ? 4 : 1;
  b.box('detail', o.from - 0.002, front + 0.002, 0.074, 0.082, 0.032);
  // The riser keeps the receiver and the folded sights well below the dot in the aimed view (a lower-third co-witness).
  b.box('detail', o.from + 0.008, front - 0.008, 0.082, o.axisUp - o.inner, 0.026);
  b.hood('detail', roundedRect(o.outer * 2, o.outer * 2 + 0.004, 0.008, o.axisUp + 0.001, steps), [roundedRect(o.inner * 2, o.inner * 2, 0.005, o.axisUp, steps)], o.from, front);
  b.box('detail', front - 0.004, front + 0.006, o.axisUp + o.outer + 0.003, o.axisUp + o.outer + 0.007, o.outer * 2 - 0.006);
  const lens = o.from + o.length * 0.66;
  b.box('lens', lens - 0.0005, lens + 0.0005, o.axisUp - o.inner, o.axisUp + o.inner, o.inner * 2);
  if (!b.high) return;
  b.ball('laserLens', lens - 0.0012, o.axisUp, F.dot.radius);
  for (const at of [o.from + 0.012, o.from + 0.024]) b.box('detail', at, at + 0.008, o.axisUp - 0.016, o.axisUp - 0.01, 0.006, o.outer + 0.002);
  b.crossTube('metal', o.from + 0.036, o.axisUp - 0.004, 0.0075, 0.006, o.outer + 0.002, 16);
  b.uprightTube('metal', o.from + 0.022, o.axisUp + o.outer + 0.0045, 0.006, 0.005, 0, 16);
  b.crossTube('metal', (o.from + front) / 2, 0.078, 0.0035, 0.036, 0, 8);
}

/** The 2× scope (M17b): a longer tube on two rings, a wider objective bell in front, on the red dot's axis. */
function scope2x(b: ModelBuilder): void {
  const o = RIFLE_OPTIC;
  const sc = RIFLE_SCOPE;
  for (const x of [0.0, 0.07]) {
    b.box('detail', x, x + 0.024, 0.074, 0.084, 0.034);
    b.box('detail', x + 0.004, x + 0.02, 0.084, o.axisUp - sc.outer + 0.004, 0.022);
  }
  b.ringTube('detail', sc.from, sc.length, o.axisUp, sc.outer, sc.inner);
  b.ringTube('detail', sc.from + sc.length, sc.bellLength, o.axisUp, sc.bellOuter, sc.bellOuter - 0.003);
  b.ringTube('detail', sc.from - sc.eyeLength, sc.eyeLength, o.axisUp, sc.outer + 0.004, sc.inner);
  if (!b.high) b.box('detail', 0.03, 0.05, o.axisUp + sc.outer - 0.002, o.axisUp + sc.outer + 0.012, 0.016); // turret
  b.tube('lens', sc.from + sc.length + sc.bellLength - 0.004, 0.002, o.axisUp, sc.bellOuter - 0.003, 24);
  if (!b.high) return;
  // Turrets on top and on the right with their caps; a rubber eye cup; a dark inner tube in the bell, so the objective
  // reads as glass over black; scope rings round the tube with two screws a side.
  const turret = sc.from + sc.length / 2;
  b.box('detail', turret - 0.012, turret + 0.012, o.axisUp + sc.outer - 0.003, o.axisUp + sc.outer + 0.004, 0.02);
  b.uprightTube('detail', turret, o.axisUp + sc.outer + 0.009, 0.0085, 0.01, 0, 12);
  b.uprightTube('rubber', turret, o.axisUp + sc.outer + 0.0145, 0.0088, 0.002, 0, 12);
  b.crossTube('detail', turret, o.axisUp, 0.0085, 0.01, sc.outer + 0.004, 12);
  b.ringTube('rubber', sc.from - sc.eyeLength - 0.008, 0.01, o.axisUp, sc.outer + 0.006, sc.inner + 0.001);
  b.ringTube('rubber', sc.from + sc.length + 0.004, sc.bellLength - 0.01, o.axisUp, sc.bellOuter - 0.003, sc.bellOuter - 0.005);
  for (const x of [0.0, 0.07]) {
    b.ringTube('detail', x + 0.004, 0.016, o.axisUp, sc.outer + 0.003, sc.outer);
    for (const side of [-1, 1]) for (const dy of [-0.006, 0.006]) b.crossTube('detail', x + 0.012, o.axisUp + dy, 0.0018, 0.003, side * (sc.outer + 0.004), 6);
  }
}

/** The vertical grip on the handguard rail, behind the support hand: a squared, tapering block. High: three rubber bands. */
function verticalGrip(b: ModelBuilder): void {
  b.box('detail', 0.196, 0.244, -0.008, 0.002, 0.03);
  b.profile('furniture', [[0.202, -0.008], [0.238, -0.008], [0.234, -0.088], [0.228, -0.096], [0.21, -0.096], [0.204, -0.088]], 0.032, b.high ? 0.003 : 0.006);
  if (!b.high) return;
  for (let i = 0; i < 3; i++) b.box('stipple', 0.2045, 0.2345, -0.03 - i * 0.02, -0.024 - i * 0.02, 0.0335);
}

/** The angled grip: a flat wedge whose bevelled ridge catches the light (high). */
function angledGrip(b: ModelBuilder): void {
  b.profile('furniture', [[0.165, -0.002], [0.262, -0.002], [0.262, -0.014], [0.188, -0.046], [0.172, -0.04]], 0.03, 0.004);
  if (!b.high) return;
  // Thumb ribs along its back edge.
  for (let i = 0; i < 4; i++) b.box('detail', 0.2 + i * 0.012, 0.206 + i * 0.012, -0.03 + i * 0.0045, -0.026 + i * 0.0045, 0.032);
}

/** The rifle's angular, gently forward-curved magazine (G2), and its base plate's outline. */
const AEG_MAG: readonly Pt[] = [[0.03, -0.076], [0.094, -0.076], [0.112, -0.2], [0.106, -0.236], [0.042, -0.234], [0.034, -0.2]];
const AEG_MAG_BASE: readonly Pt[] = [[0.038, -0.23], [0.11, -0.232], [0.112, -0.246], [0.04, -0.244]];

/** The magazine's back and front edges at height `up` (the outline's first and last edges, as drawn). */
function magSpan(back: readonly Pt[], front: readonly Pt[], up: number): [number, number] {
  const at = (edge: readonly Pt[]): number => {
    for (let i = 1; i < edge.length; i++) {
      const [a, b] = [edge[i - 1]!, edge[i]!];
      if (up <= a[1] && up >= b[1]) return a[0] + ((b[0] - a[0]) * (up - a[1])) / (b[1] - a[1]);
    }
    return edge.at(-1)![0];
  };
  return [at(back), at(front)];
}

/** A rib round a magazine's body at `up`, `height` tall, set in `inset` from its edges and `proud` past its sides. */
function magRib(b: ModelBuilder, key: MaterialKey, back: readonly Pt[], front: readonly Pt[], up: number, height: number, width: number): void {
  const inset = 0.002;
  const [b0, f0] = magSpan(back, front, up);
  const [b1, f1] = magSpan(back, front, up - height);
  b.profile(key, [[b0 + inset, up], [f0 - inset, up], [f1 - inset, up - height], [b1 + inset, up - height]], width, 0.0015);
}

/** The rifle magazine's back and front edges (top to bottom), from AEG_MAG. */
const AEG_MAG_BACK: readonly Pt[] = [[0.03, -0.076], [0.034, -0.2], [0.042, -0.234]];
const AEG_MAG_FRONT: readonly Pt[] = [[0.094, -0.076], [0.112, -0.2], [0.106, -0.236]];

/** The standard (mid-cap) magazine: a detail-coloured body on a base plate in the body colour. High: four ribs and a witness window showing BBs. */
function aegStandardMag(b: ModelBuilder): void {
  b.profile('detail', AEG_MAG, 0.034, 0.004);
  b.profile('polymer', AEG_MAG_BASE, 0.038, 0.003);
  if (!b.high) return;
  for (const up of [-0.11, -0.135, -0.16, -0.185]) magRib(b, 'detail', AEG_MAG_BACK, AEG_MAG_FRONT, up, 0.005, 0.0365);
  // The witness window on the side you see: a dark slot down the body with four BBs behind it.
  b.profile('rubber', [[0.05, -0.09], [0.058, -0.09], [0.064, -0.106], [0.056, -0.106]], 0.0355, 0.0015);
  for (let i = 0; i < 2; i++) b.ball('bb', 0.055 + i * 0.003, -0.094 - i * 0.008, 0.0026, -0.0165);
}

/** The hi-cap: the same shape, wider and bulged, with a winding wheel under its base. High: a ribbed base, a notched wheel. */
function aegHiCap(b: ModelBuilder): void {
  b.profile('detail', [[0.03, -0.076], [0.094, -0.076], [0.112, -0.2], [0.118, -0.215], [0.106, -0.236], [0.042, -0.234], [0.03, -0.215], [0.034, -0.2]], 0.042, 0.004);
  b.profile('polymer', AEG_MAG_BASE, 0.046, 0.003);
  const wheel = { from: 0.06, length: 0.03, up: -0.256, radius: 0.013 };
  b.tube('metal', wheel.from, wheel.length, wheel.up, wheel.radius, 12); // the winding wheel
  if (!b.high) return;
  b.profile('polymer', [[0.046, -0.244], [0.104, -0.245], [0.105, -0.249], [0.047, -0.248]], 0.048, 0.0015);
  // Six notches round the wheel's rim, for a thumb to wind it.
  for (let i = 0; i < 6; i++) {
    const notch = new THREE.BoxGeometry(0.004, 0.004, wheel.length + 0.002).translate(0, wheel.radius - 0.0005, 0).rotateZ((i / 6) * Math.PI * 2);
    b.addGeometry('metal', notch.translate(0, wheel.up, -(wheel.from + wheel.length / 2)));
  }
}

/** The low-cap: short and straight. High: a steel body with three ribs on its base plate. */
function aegLowCap(b: ModelBuilder): void {
  const body: readonly Pt[] = [[0.03, -0.076], [0.094, -0.076], [0.104, -0.13], [0.108, -0.168], [0.042, -0.172], [0.034, -0.13]];
  b.profile(b.high ? 'metal' : 'detail', body, 0.034, 0.004);
  b.profile('polymer', [[0.04, -0.168], [0.11, -0.166], [0.112, -0.18], [0.042, -0.182]], 0.038, 0.003);
  if (!b.high) return;
  const back: readonly Pt[] = [[0.03, -0.076], [0.034, -0.13], [0.042, -0.172]];
  const front: readonly Pt[] = [[0.094, -0.076], [0.104, -0.13], [0.108, -0.168]];
  for (const up of [-0.098, -0.12, -0.142]) magRib(b, 'metal', back, front, up, 0.004, 0.0365);
}

/** The pistol's magazine outline (hidden in the grip until a reload drops it out). */
const PISTOL_MAG: readonly Pt[] = [[-0.058, -0.02], [-0.076, -0.02], [-0.1, -0.118], [-0.078, -0.12]];
/** The pistol magazine's base pad, squared to the grip (G2). */
const PISTOL_MAG_BASE: readonly Pt[] = [[-0.05, -0.13], [-0.112, -0.13], [-0.114, -0.143], [-0.052, -0.143]];

/** The pistol's standard magazine and base pad. High: a rim round the pad, worn lighter. */
function pistolStandardMag(b: ModelBuilder): void {
  b.profile('detail', PISTOL_MAG, 0.022, 0.003);
  b.profile('detail', PISTOL_MAG_BASE, 0.034, 0.003);
  if (b.high) b.worn(() => b.box('detail', -0.11, -0.054, -0.146, -0.141, 0.036));
}

/** The extended magazine (M17b): a sleeve standing out of the grip with a longer pad. Its accent line round the pad's top. */
function pistolExtendedMag(b: ModelBuilder): void {
  b.profile('detail', PISTOL_MAG, 0.022, 0.003);
  b.profile('furniture', [[-0.108, -0.13], [-0.052, -0.13], [-0.05, -0.162], [-0.11, -0.162]], 0.031, 0.003);
  b.profile('detail', PISTOL_MAG_BASE.map(([f, u]) => [f, u - 0.032] as const), 0.034, 0.003);
  b.box('accent', -0.108, -0.054, -0.166, -0.163, 0.0346);
  if (b.high) b.worn(() => b.box('detail', -0.11, -0.054, -0.178, -0.173, 0.036));
}

/** The Cyber Pistol's magazine (G2): hidden in the grip, its white base pad with a line of the core's colour round it (high). */
function cyberMag(b: ModelBuilder): void {
  b.profile('polymer', PISTOL_MAG, 0.022, 0.003);
  b.box('cyberSlab', -0.112, -0.05, -0.142, -0.13, 0.035);
  if (!b.high) return;
  b.box('cyberCore', -0.108, -0.054, -0.137, -0.135, 0.0356);
  b.worn(() => b.box('cyberSlab', -0.114, -0.048, -0.145, -0.141, 0.036));
}

/** The red laser (M26b): a chamfered module clipped to the dust cover's rail, its lens at the front. High: a clamp, a thumb screw, a switch cap. */
function redLaser(b: ModelBuilder): void {
  b.profile('detail', [[0.046, -0.026], [0.09, -0.026], [0.09, -0.042], [0.054, -0.042], [0.046, -0.036]], 0.022, 0.003);
  b.box('laserLens', 0.09, 0.093, -0.038, -0.03, 0.009);
  if (!b.high) return;
  b.box('metal', 0.05, 0.072, -0.028, -0.02, 0.026);
  b.crossTube('metal', 0.061, -0.024, 0.0035, 0.006, 0.016, 8);
  b.tube('rubber', 0.034, 0.012, -0.034, 0.006, 10);
}

/**
 * Where a weapon torch sits on a replica (M33h), in the model's (forward, up) and across (`x`): its body tube from
 * `from`, `length` long and `radius` round, a wider head in front of it with the lens, and the mount to the rail (a box
 * `mount` from forward → to, up y0 → y1, `width` wide at `mountX`).
 */
interface TorchLayout {
  from: number;
  length: number;
  up: number;
  x: number;
  radius: number;
  head: number;
  headRadius: number;
  mount: { from: number; to: number; y0: number; y1: number; width: number; x: number };
}

/** The AEG's: on the right of the handguard, ahead of the support hand, on the side rail. */
const AEG_TORCH: TorchLayout = { from: 0.325, length: 0.07, up: 0.034, x: 0.049, radius: 0.012, head: 0.024, headRadius: 0.016, mount: { from: 0.34, to: 0.375, y0: 0.026, y1: 0.042, width: 0.016, x: 0.036 } };
/** The Gas Pistol's: under the dust cover, below where the Red Laser clips on, so the two read as one unit. */
const PISTOL_TORCH: TorchLayout = { from: 0.042, length: 0.044, up: -0.058, x: 0, radius: 0.0105, head: 0.014, headRadius: 0.0135, mount: { from: 0.05, to: 0.08, y0: -0.05, y1: -0.026, width: 0.014, x: 0 } };
/** The Cyber Pistol's: a clamp under its slab dust cover. */
const CYBER_TORCH: TorchLayout = { from: 0.046, length: 0.046, up: -0.042, x: 0, radius: 0.0105, head: 0.014, headRadius: 0.0135, mount: { from: 0.056, to: 0.084, y0: -0.034, y1: -0.027, width: 0.014, x: 0 } };

/**
 * A weapon torch (M33h) at `t`: Low a six-sided body and head and a lens disc; High round, with a knurled bezel
 * (REPLICA_FINISH.torch.knurls rubber rings), a rubber tailcap switch and a steel clamp screw. Its lens is `torchLens`.
 */
function weaponTorch(t: TorchLayout): PartDraw {
  return (b) => {
    const seg = b.high ? 16 : 6;
    const m = t.mount;
    b.box('detail', m.from, m.to, m.y0, m.y1, m.width, m.x);
    b.tube('detail', t.from, t.length, t.up, t.radius, seg, t.x);
    const head = t.from + t.length;
    b.tube('detail', head, t.head, t.up, t.headRadius, seg, t.x);
    b.tube('torchLens', head + t.head, 0.0015, t.up, t.headRadius * 0.82, seg, t.x);
    if (!b.high) return;
    const step = t.head / (F.torch.knurls + 1);
    for (let i = 1; i <= F.torch.knurls; i++) b.tube('rubber', head + i * step - 0.001, 0.002, t.up, t.headRadius + 0.0008, seg, t.x);
    b.tube('rubber', t.from - 0.007, 0.007, t.up, t.radius * 0.8, seg, t.x);
    b.crossTube('metal', (m.from + m.to) / 2, (m.y0 + m.y1) / 2, 0.003, m.width + 0.004, m.x, 8);
  };
}

/** Where the laser's lens is (forward, up): the beam starts there. */
export const PISTOL_LASER_LENS: Pt = [0.093, -0.034];

/** Where the AEG's gas block ends and its bare outer barrel shows, forward (m). */
export const AEG_GAS_BLOCK_END = 0.455;

/** Dark flutes cut along a barrel from `from` to `to`: one on top, one each side (high detail). */
function flutes(b: ModelBuilder, from: number, to: number, up: number, radius: number): void {
  const B = F.barrel;
  b.box('rubber', from, to, up + radius - B.fluteDepth, up + radius + B.fluteDepth, B.fluteWidth);
  for (const side of [-1, 1]) b.box('rubber', from, to, up - B.fluteWidth / 2, up + B.fluteWidth / 2, B.fluteDepth * 2, side * radius);
}

/**
 * The long barrel (M29b): the outer barrel carried 0.1 m further, the muzzle mount moved to its end. High: a steel
 * coupling collar with two wrench flats where it joins, and fluting along it.
 */
function longBarrel(b: ModelBuilder): void {
  const { barrelEnd: end, up, extensions } = AEG_MUZZLE;
  const B = F.barrel;
  b.tube('metal', end, extensions.long, up, B.radius);
  if (!b.high) return;
  b.tube('metal', end - B.collar / 2, B.collar, up, B.collarRadius, B.segments);
  for (const side of [-1, 1]) b.box('rubber', end - B.collar / 2 + 0.002, end + B.collar / 2 - 0.002, up - 0.004, up + 0.004, 0.001, side * B.collarRadius);
  flutes(b, end + B.collar, end + extensions.long - B.collar, up, B.radius);
}

/**
 * The tight-bore barrel (M29b): a precision inner barrel the same length. Low draws nothing for it (as M29b did: the
 * outer barrel looks the same, and Low gains no draw call); high shows it by a heavier fluted steel sleeve over the outer
 * barrel between the gas block and the flash hider, an index band in the furniture colour at the gas block and a crown ring.
 */
function tightBoreBarrel(b: ModelBuilder): void {
  if (!b.high) return;
  const { barrelEnd: end, up } = AEG_MUZZLE;
  const B = F.barrel;
  const from = AEG_GAS_BLOCK_END;
  b.tube('metal', from, end - from, up, B.sleeveRadius, B.segments);
  b.tube('furniture', from + 0.004, 0.005, up, B.sleeveRadius + 0.0006, B.segments);
  flutes(b, from + 0.014, end - B.collar - 0.004, up, B.sleeveRadius);
  b.tube('metal', end - B.collar, B.collar, up, B.collarRadius, B.segments);
}

/** The AEG's birdcage flash hider (as it comes: 'muzzle:none'). High: its slots. */
function flashHider(b: ModelBuilder, orangeTip: boolean): void {
  const up = AEG_MUZZLE.up;
  b.tube(orangeTip ? 'orange' : 'metal', 0, 0.016, up, 0.013, 10);
  b.tube(orangeTip ? 'orange' : 'detail', 0.016, 0.03, up, 0.012, 6);
  if (b.high) for (const side of [-1, 1]) b.box('rubber', 0.021, 0.041, up - 0.003, up + 0.003, 0.002, side * 0.0115);
}

/**
 * A silencer (M29b; G2 the concept's): a six-sided body `length` long and `radius` across its corners in the detail
 * colour with an accent ring near the back, its front `cap` steel (orange with `orangeTip`). High adds a steel thread
 * adapter, a stepped back cap, steel grooves and the dark bore at the front.
 */
function silencer(layout: MuzzleLayout, radius: number, cap: number): MuzzleDraw {
  const length = layout.tips.silencer ?? 0;
  const up = layout.up;
  const S = F.silencer;
  return (b, orangeTip) => {
    const from = b.high ? S.adapter + cap : 0;
    const body = length - cap - from;
    const capRadius = radius - S.capStep;
    b.tube('detail', from, body, up, radius, 6);
    b.tube('accent', from + body * S.ringAt, S.ring, up, radius * S.ringProud, 6);
    b.tube(orangeTip ? 'orange' : 'metal', length - cap, cap, up, capRadius, b.high ? S.segments : 12);
    if (!b.high) return;
    b.tube('metal', 0, S.adapter, up, radius * S.adapterShare, S.segments);
    b.tube('metal', S.adapter, cap, up, capRadius, S.segments);
    for (let i = 0; i < S.grooves; i++) b.tube('metal', from + body * S.ringAt + S.ring + S.groovePitch * (i + 0.5), S.groovePitch / 2, up, radius * (S.ringProud - 0.02), 6);
    b.tube('rubber', length - S.boreDepth, S.boreDepth + 0.0005, up, radius * S.boreShare, 12);
  };
}

/** The rifle's parts by name (M17b), each drawn on demand; the Loadout's names are the keys. */
export const AEG_PARTS: Readonly<Record<string, PartDraw>> = {
  'optic:redDot': redDot,
  'optic:scope2x': scope2x,
  'grip:vertical': verticalGrip,
  'grip:angled': angledGrip,
  'barrel:long': longBarrel,
  'barrel:tightBore': tightBoreBarrel,
  'light:weaponTorch': weaponTorch(AEG_TORCH),
};
export const AEG_MAGAZINES: Partial<Record<MagazineId, PartDraw>> = { standard: aegStandardMag, hiCap: aegHiCap, lowCap: aegLowCap };
/** The muzzle devices by id ('none': the bare muzzle's own), drawn on the mount. */
export const AEG_MUZZLE_DEVICES: Readonly<Record<string, MuzzleDraw>> = { none: flashHider, silencer: silencer(AEG_MUZZLE, 0.021, 0.006) };
export const PISTOL_PARTS: Readonly<Record<string, PartDraw>> = { 'laser:redLaser': redLaser, 'light:weaponTorch': weaponTorch(PISTOL_TORCH) };
export const PISTOL_MAGAZINES: Partial<Record<MagazineId, PartDraw>> = { standard: pistolStandardMag, extended: pistolExtendedMag };
/** A silencer a little narrower than the slide; the bare muzzle has no device of its own. */
export const PISTOL_MUZZLE_DEVICES: Readonly<Record<string, MuzzleDraw>> = { silencer: silencer(PISTOL_MUZZLE, 0.0155, 0.005) };

/** Nothing but a weapon torch (M33h) fits the Cyber Pistol (M32): its table is that and its own magazine. */
export const CYBER_PARTS: Readonly<Record<string, PartDraw>> = { 'light:weaponTorch': weaponTorch(CYBER_TORCH) };
export const CYBER_MAGAZINES: Partial<Record<MagazineId, PartDraw>> = { standard: cyberMag };

/** Every part a replica's table draws, built and named (exported for the tests: one builder per entry). */
export const REPLICA_PART_TABLES = {
  aeg: { parts: AEG_PARTS, magazines: AEG_MAGAZINES, muzzles: AEG_MUZZLE_DEVICES },
  pistol: { parts: PISTOL_PARTS, magazines: PISTOL_MAGAZINES, muzzles: PISTOL_MUZZLE_DEVICES },
  cyber: { parts: CYBER_PARTS, magazines: CYBER_MAGAZINES, muzzles: {} },
} as const;


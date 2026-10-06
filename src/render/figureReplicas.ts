import * as THREE from 'three';
import { FIGURE } from '../config/characters';
import type { Scheme } from '../config/schemes';
import type { GripWrap } from './figureHands';
import type { PartBuilder, PartLook } from './figureParts';
import { V } from './figureShapes';

/**
 * The replicas figures carry (G7): the first-person replicas' blocky two-tone look (G2) cut down to a handful of
 * blocks, in a scheme's colours: the body (receiver, slide), the furniture (stock, grip, handguard), the details
 * (magazine, sights, rail), the accent line and the steel barrel. Built along -Z from the butt (the rifle) or the back of
 * the slide (the pistol), the bore on the frame's axis, into whatever frame `m` places them in.
 */

/** A replica's colours on a figure (a scheme, or the Cyber Pistol's own). */
export type FigureReplicaColours = Pick<Scheme, 'body' | 'furniture' | 'detail' | 'accent' | 'steel'>;

/** The parts a figure shows on its replicas: a silencer on the rifle (M29b; Player detail `high` only), a weapon torch. */
export interface FigureKit {
  rifleSilencer: boolean;
  rifleTorch?: boolean;
  pistolTorch?: boolean;
}

/** As every replica comes. */
export const BARE_KIT: FigureKit = { rifleSilencer: false };

const FIN = FIGURE.finish;
const POLYMER: PartLook = { finish: FIN.polymer, edge: true };
const STEEL: PartLook = { finish: FIN.steel };
const RIGHT = V(1, 0, 0);
const LEFT = V(-1, 0, 0);
const FORWARD = V(0, 0, -1);
const DOWN = V(0, -1, 0);

/** The rifle's pistol grip (its centre, rake and half sizes) and handguard, in the rifle's own space. */
const RIFLE_GRIP = { at: V(0, -0.085, -0.27), rake: -0.35, half: 0.045, hx: 0.016, hd: 0.0225, trigger: V(0, -0.03, -0.315) };
const HANDGUARD = { at: V(0, -0.002, -0.66), w: 0.06, h: 0.07, d: 0.24 };
/** The pistol's grip, in its own space. */
const PISTOL_GRIP = { at: V(0, -0.075, -0.03), rake: -0.3, half: 0.04, hx: 0.015, hd: 0.021, trigger: V(0, -0.028, -0.06) };

/** A raked grip's axis, from its top to its bottom. */
function gripAxis(at: THREE.Vector3, rake: number, half: number): [THREE.Vector3, THREE.Vector3] {
  const down = DOWN.clone().applyEuler(new THREE.Euler(rake, 0, 0));
  return [at.clone().addScaledVector(down, -half), at.clone().addScaledVector(down, half)];
}

/**
 * Where the hands close on the rifle, in its own space: the firing hand round the pistol grip (its index finger on the
 * trigger), the support hand palm up under the handguard, its fingers up the far side.
 */
export function rifleGrips(): { firing: GripWrap; trigger: THREE.Vector3; support: GripWrap } {
  const G = RIFLE_GRIP;
  const [top, bottom] = gripAxis(G.at, G.rake, G.half);
  const H = HANDGUARD;
  return {
    firing: { top, bottom, hx: G.hx, hd: G.hd, side: RIGHT, front: FORWARD },
    trigger: G.trigger.clone(),
    support: { top: H.at.clone().add(V(0, 0, -H.d / 6)), bottom: H.at.clone().add(V(0, 0, H.d / 6)), hx: H.h / 2, hd: H.w / 2, side: DOWN, front: RIGHT },
  };
}

/** Where the hands close on the pistol: the firing hand round the grip, the support hand over its fingers. */
export function pistolGrips(): { firing: GripWrap; trigger: THREE.Vector3; support: GripWrap } {
  const G = PISTOL_GRIP;
  const [top, bottom] = gripAxis(G.at, G.rake, G.half);
  const firing: GripWrap = { top, bottom, hx: G.hx, hd: G.hd, side: RIGHT, front: FORWARD };
  return { firing, trigger: G.trigger.clone(), support: { ...firing, side: LEFT, extra: 0.021, shift: 0.7 } };
}

/** A weapon torch along -Z (M33h): a body `length` long ending in a pale lens, centred at (x, y, z); two plain boxes. */
function addTorch(b: PartBuilder, m: THREE.Matrix4, colours: FigureReplicaColours, x: number, y: number, z: number, size: number, length: number): void {
  const T = FIGURE.torch;
  b.box(colours.detail, size, size, length, x, y, z, { finish: FIN.polymer }, m);
  b.box(FIGURE.colors.torchLens, size * T.lensSize, size * T.lensSize, T.lensDepth, x, y, z - length / 2 - T.lensDepth / 2, {}, m);
}

/**
 * The rifle, its butt at the frame's origin and its muzzle FIGURE.rifle.length ahead: a hard-angled stock, the receiver
 * with its accent line, a raked grip, the magazine, a squared handguard with its own line, a gas block and the barrel.
 * Detailed: a top rail, a magwell, a cheek riser, the trigger guard and a flash hider, or a fitted silencer at the muzzle.
 */
export function addRifle(b: PartBuilder, m: THREE.Matrix4, colours: FigureReplicaColours, kit: FigureKit = BARE_KIT): void {
  const c = colours;
  const L = FIGURE.rifle.length;
  b.block(c.furniture, 0.046, 0.12, 0.2, 0, -0.026, -0.1, POLYMER, m); // stock
  b.block(c.body, 0.056, 0.084, 0.34, 0, 0, -0.37, POLYMER, m); // receiver
  b.box(c.accent, 0.0584, 0.008, 0.2, 0, -0.022, -0.39, {}, m);
  b.block(c.detail, 0.034, 0.14, 0.064, 0, -0.11, -0.43, POLYMER, m, new THREE.Euler(0.15, 0, 0)); // magazine
  b.block(c.furniture, 0.032, RIFLE_GRIP.half * 2 + 0.006, 0.044, RIFLE_GRIP.at.x, RIFLE_GRIP.at.y, RIFLE_GRIP.at.z, POLYMER, m, new THREE.Euler(RIFLE_GRIP.rake, 0, 0));
  const H = HANDGUARD;
  b.block(c.furniture, H.w, H.h, H.d, H.at.x, H.at.y, H.at.z, POLYMER, m);
  b.box(c.accent, H.w + 0.0014, 0.006, H.d * 0.7, 0, 0.014, H.at.z - 0.01, {}, m);
  b.box(c.detail, 0.022, 0.034, 0.03, 0, 0.056, -0.24, POLYMER, m); // flip-up rear sight
  b.box(c.detail, 0.03, 0.04, 0.025, 0, 0.022, -0.79, POLYMER, m); // gas block and front sight
  // The barrel's back end is under the handguard, its front end the muzzle: no vertex in between (BBs leave its end).
  b.box(c.steel, 0.022, 0.022, 0.2, 0, 0, -(L - 0.1), STEEL, m);
  const T = FIGURE.torch;
  if (kit.rifleTorch) addTorch(b, m, c, T.rifleSide, 0, -T.rifleAt, T.size, T.length);
  if (!b.overhaul) return;
  b.box(c.detail, 0.024, 0.012, 0.3, 0, 0.048, -0.39, POLYMER, m); // top rail
  b.block(c.body, 0.05, 0.03, 0.08, 0, -0.05, -0.43, POLYMER, m); // magwell
  b.block(c.furniture, 0.04, 0.016, 0.12, 0, 0.04, -0.12, POLYMER, m); // cheek riser
  b.box(c.detail, 0.008, 0.012, 0.06, 0, -0.05, -0.32, POLYMER, m); // trigger guard
  const S = FIGURE.silencer;
  const r = kit.rifleSilencer ? S.radius : 0.018;
  const length = kit.rifleSilencer ? S.length : 0.045;
  b.cylinder(kit.rifleSilencer ? c.body : c.steel, r, length, m, 0, 0, -L + length / 2, kit.rifleSilencer ? POLYMER : STEEL, new THREE.Euler(Math.PI / 2, 0, 0));
}

/**
 * The pistol, the back of its slide at the frame's origin and its muzzle FIGURE.pistol.length ahead: the slide with its
 * accent line, the frame under it and a raked grip. Detailed: the trigger guard, sights and a base pad.
 */
export function addPistol(b: PartBuilder, m: THREE.Matrix4, colours: FigureReplicaColours, kit: FigureKit = BARE_KIT): void {
  const c = colours;
  const L = FIGURE.pistol.length;
  b.block(c.body, 0.032, 0.036, L, 0, 0.004, -L / 2, POLYMER, m); // slide
  b.box(c.accent, 0.0336, 0.005, L * 0.85, 0, 0.002, -L / 2, {}, m);
  b.block(c.furniture, 0.03, 0.016, L * 0.85, 0, -0.022, -L * 0.48, POLYMER, m); // frame
  const G = PISTOL_GRIP;
  b.block(c.furniture, 0.03, G.half * 2 + 0.02, 0.042, G.at.x, G.at.y, G.at.z, POLYMER, m, new THREE.Euler(G.rake, 0, 0));
  const T = FIGURE.torch;
  if (kit.pistolTorch) addTorch(b, m, c, 0, -T.pistolBelow, -L + T.pistolLength / 2, T.size * T.pistolSize, T.pistolLength);
  if (!b.overhaul) return;
  b.box(c.furniture, 0.008, 0.024, 0.036, 0, -0.04, -0.075, POLYMER, m); // trigger guard
  b.box(c.detail, 0.022, 0.009, 0.012, 0, 0.026, -0.008, POLYMER, m); // rear sight
  b.box(c.detail, 0.006, 0.008, 0.008, 0, 0.026, -L + 0.008, POLYMER, m); // front sight
  b.box(c.detail, 0.032, 0.01, 0.046, 0, -0.118, -0.015, POLYMER, m, new THREE.Euler(G.rake, 0, 0)); // base pad
}

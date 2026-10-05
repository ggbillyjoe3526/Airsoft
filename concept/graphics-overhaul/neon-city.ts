import * as THREE from 'three';
import { NEON_HEIGHTS } from '../../src/map/neonHeights';
import type { MapBlock, MapSign } from '../../src/map/mapTypes';
import type { Kit } from './kit';
import { decalCell, ICONS, rng, screenCell, strokeText } from './neon-assets';

/**
 * Neon Heights re-dressed for the overhaul at night, built from the game's own map data (src/map/neonHeights.ts, read
 * only): every block keeps its exact bounds and is drawn as what it is inside its box (walls with plinths, storey bands
 * and shopfronts set into their thickness, stairs as treads inside the ramp's wedge, rails as solid perforated
 * balustrades, the city props). The map's signs become neon tubes, lightboxes and lit windows; its lamps hang from
 * cables. Everything is added to one Kit, so it merges into a mesh per material.
 */

export const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const Z = V(0, 0, 1);

/** World rectangles [x0, x1, z0, z1] of the map's buildings and walkways (mirrors of neonHeights.ts, plan z flipped). */
export const AREA = {
  arcade: [-15, -3.5, -10, 2],
  block: [-12, -3.5, 5, 15],
  tower: [4, 17, -11, 10],
  balcony: [-3.5, -2, -10, 2],
  road: [-2, 2.5, -15, 15],
} as const;
export const HALF_X = 23;
export const HALF_Z = 15;
export const STOREY = 3;

/** The neon colours of the map's signs (neonHeights.ts NEON), for matching and light spill. */
export const NEON = { magenta: 0xff2bd6, cyan: 0x22e6ff, amber: 0xffa531, lime: 0x8dff3a, violet: 0x9a6bff, red: 0xff3b4a } as const;

export interface Bx {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
}
export const bx = (b: MapBlock): Bx => ({
  x0: b.center.x - b.size.x / 2,
  x1: b.center.x + b.size.x / 2,
  y0: b.center.y - b.size.y / 2,
  y1: b.center.y + b.size.y / 2,
  z0: b.center.z - b.size.z / 2,
  z1: b.center.z + b.size.z / 2,
  cx: b.center.x,
  cy: b.center.y,
  cz: b.center.z,
  w: b.size.x,
  h: b.size.y,
  d: b.size.z,
});

const hashPos = (x: number, z: number): number => {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
export { hashPos };

// ---------------------------------------------------------------------------------------------------------------- helpers

/** A plain unbevelled box centred at (x, y, z). */
export function bar(k: Kit, key: string, x: number, y: number, z: number, w: number, h: number, d: number, tint: number | THREE.Color, ry = 0, ground?: number): void {
  const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), V(1, 1, 1));
  k.add(key, new THREE.BoxGeometry(w, h, d), m, tint, ground !== undefined ? { ground } : {});
}

/** A box from min to max corners (bevelled on presets with bevels). */
export function span(k: Kit, key: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, tint: number | THREE.Color, opts: { ground?: number; radius?: number; uvRot?: boolean } = {}): void {
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return;
  k.box(key, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, tint, { radius: 0.012, ...opts });
}

const unitCyl = new Map<number, THREE.BufferGeometry>();
/** A round bar from a to b, radius r. */
export function rod(k: Kit, key: string, a: THREE.Vector3, b: THREE.Vector3, r: number, tint: number | THREE.Color, radial = 6, open = true): void {
  const d = b.clone().sub(a);
  const len = d.length();
  if (len < 1e-4) return;
  const ck = radial * (open ? 1 : -1);
  let g = unitCyl.get(ck);
  if (!g) unitCyl.set(ck, (g = new THREE.CylinderGeometry(1, 1, 1, radial, 1, open)));
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  k.add(key, g, new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), q, V(r, len, r)), tint, {});
}

/** A sagging cable from a to b (a catenary drawn as a tube). */
export function cable(k: Kit, a: THREE.Vector3, b: THREE.Vector3, sag: number, r: number, tint = 0x15161a): void {
  const n = k.p.smallParts ? 14 : 6;
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t).add(V(0, -sag * 4 * t * (1 - t), 0));
    rod(k, 'dark', prev, p, r, tint, k.p.smallParts ? 5 : 3);
    prev = p;
  }
}

/** A flat textured quad from an atlas cell: centre c, facing n, w × h, turned rot about n. */
export function panel(k: Kit, key: string, cell: [number, number, number, number], c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, tint: number | THREE.Color, rot = 0): void {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, cell[0] + uv.getX(i) * cell[2], cell[1] + uv.getY(i) * cell[3]);
  const nn = n.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(Z, nn);
  if (Math.abs(nn.y) > 0.99) q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.PI));
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(nn, rot));
  k.add(key, g, new THREE.Matrix4().compose(c, q, V(1, 1, 1)), tint, { worldUv: false });
}

/** A decal from the lit atlas, lifted a hair off its surface. */
export function decal(k: Kit, cell: string, c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, tint: number | THREE.Color, rot = 0): void {
  panel(k, 'nhDecal', decalCell(cell), c.clone().addScaledVector(n.clone().normalize(), 0.004), n, w, h, tint, rot);
}

/** An unlit panel from the screen atlas (screens, lightboxes, rooms): `glow` scales its brightness. */
export function screen(k: Kit, cell: string, c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, glow: number | THREE.Color, rot = 0): void {
  const tint = glow instanceof THREE.Color ? glow : new THREE.Color(1, 1, 1).multiplyScalar(glow);
  panel(k, 'nhScreen', screenCell(cell), c.clone().addScaledVector(n.clone().normalize(), 0.003), n, w, h, tint, rot);
}

const HALO_CELL: [number, number, number, number] = [0, 0, 1, 1];
/** A soft additive glow: round lights, light splashed on a wall or on the ground. */
export function halo(k: Kit, c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, colour: number | THREE.Color, strength: number, rot = 0): void {
  const col = new THREE.Color(colour).multiplyScalar(strength);
  panel(k, 'nhHalo', HALO_CELL, c, n, w, h, col, rot);
}

/** A neon colour bright enough to bloom (Ultra) or to read as lit after tone mapping (Low). */
export function hdr(hex: number, k: Kit, boost = 1): THREE.Color {
  const c = new THREE.Color(hex);
  const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  const target = (k.p.bloom ? 2.4 : 0.75) * boost;
  return c.multiplyScalar(target / Math.max(0.12, lum));
}

/** A light the shot may turn into a real point light, nearest the view first. */
export interface Spot {
  pos: THREE.Vector3;
  colour: number;
  power: number;
  range: number;
}

/** What the city build hands the shot. */
export interface City {
  lights: Spot[];
  /** Bright things on the street's sides, for the wet road's reflection streaks: position and colour. */
  glows: { pos: THREE.Vector3; colour: number; size: number }[];
}

// ---------------------------------------------------------------------------------------------------------------- palette

const PAL = {
  plinth: 0x3a3f4c,
  band: 0.88,
  coping: 0xe6e2da,
  frame: 0x2a2e38,
  sill: 0xd8d4cc,
  rail: 0x464e5e,
  kerb: 0xa8a8a6,
  dark: 0x1e2126,
  steel: 0x5a6270,
  shutters: [0x8a96a4, 0x6e7f8e, 0xb0a890, 0x7a6e8a],
  timber: 0xa6743f,
  stallWood: 0xd8cbb8,
  van: 0xf2efe6,
};

/** Is (x, z) inside one of the buildings (grown by pad)? */
const inBuilding = (x: number, z: number, pad = 0): boolean =>
  ([AREA.arcade, AREA.block, AREA.tower] as const).some((r) => x >= r[0] - pad && x <= r[1] + pad && z >= r[2] - pad && z <= r[3] + pad);

// ---------------------------------------------------------------------------------------------------------------- walls

function isPerimeter(b: Bx): boolean {
  return b.x1 <= -HALF_X + 1e-6 || b.x0 >= HALF_X - 1e-6 || b.z1 <= -HALF_Z + 1e-6 || b.z0 >= HALF_Z - 1e-6;
}

/** A wall in its finish and paint: a dark plinth, storey bands and a sill cap, all within its box. */
function wall(k: Kit, blk: MapBlock, b: Bx): void {
  const key = blk.finish === 'cladding' ? 'cladding' : 'plaster';
  const paint = new THREE.Color(blk.paint ?? 0xcccccc).multiplyScalar(0.94 + hashPos(b.cx, b.cz) * 0.08);
  // A roof (a thin wall over a building): its sides the building's colour, a membrane on top, a parapet cap.
  if (b.h <= 0.31 && b.cy > STOREY) {
    const facade = roofFacade(b);
    span(k, facade.key, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, facade.paint, { radius: 0.01 });
    span(k, 'nhRoof', b.x0 + 0.25, b.x1 - 0.25, b.y1 - 0.01, b.y1 + 0.004, b.z0 + 0.25, b.z1 - 0.25, 0xd0d0d4, { radius: 0 });
    return;
  }
  // Spawn walls: a painted site hoarding with battens.
  const thin = Math.min(b.w, b.d);
  let y0 = b.y0;
  if (b.y0 < 0.01 && b.h > 1) {
    span(k, 'precast', b.x0, b.x1, 0, 0.32, b.z0, b.z1, PAL.plinth, { ground: 0 });
    y0 = 0.32;
  }
  // Split the body at the storey lines into bands (a panel line and a touch darker).
  const cuts = [y0];
  for (const s of [STOREY, 2 * STOREY]) if (s - 0.1 > y0 + 0.2 && s + 0.1 < b.y1 - 0.2) cuts.push(s - 0.08, s + 0.08);
  // A bridge's parapet (1.2 m, up on a deck) carries a lit strip under its cap, the line that draws the bridge at night.
  const parapet = b.y0 > 2 && b.h < 1.3 && thin <= 0.2;
  if (parapet) cuts.push(b.y1 - 0.12, b.y1 - 0.09);
  cuts.push(b.y1);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const isBand = i % 2 === 1;
    if (parapet && isBand) {
      span(k, 'glow', b.x0, b.x1, cuts[i]!, cuts[i + 1]!, b.z0, b.z1, hdr(NEON.magenta, k, 0.55));
      continue;
    }
    const t = isBand ? paint.clone().multiplyScalar(PAL.band) : paint;
    span(k, isBand ? 'paint' : key, b.x0, b.x1, cuts[i]!, cuts[i + 1]!, b.z0, b.z1, t, { ground: 0 });
  }
  // A light sill cap on the low wall pieces under windows (1.2 m tall above a floor).
  if (Math.abs(b.h - 1.2) < 0.01 && thin <= 0.31) span(k, 'paint', b.x0, b.x1, b.y1 - 0.04, b.y1, b.z0, b.z1, PAL.sill, { radius: 0.005 });
}

/** The roof's sides take the colour of the building's walls under it. */
function roofFacade(b: Bx): { key: string; paint: THREE.Color } {
  const cl = (hex: number) => new THREE.Color(hex);
  if (b.cx > AREA.tower[0] - 0.1) return { key: 'cladding', paint: cl(0xa2e9ec).multiplyScalar(0.85) };
  if (b.cz > AREA.block[2] - 0.1) return { key: 'plaster', paint: cl(0xa9e4cf).multiplyScalar(0.85) };
  return { key: 'plaster', paint: cl(0xf3b6d8).multiplyScalar(0.85) };
}

/**
 * A perimeter wall (the city's street frontage round the site, 10 m): its inner face cut into piers between the window
 * columns, the body set back 8 cm, shopfronts at street level set back further (roller shutters, a lit shop window, a
 * doorway, a blank bay with posters), a fascia and a cornice. Everything stays inside the wall's box.
 */
function perimeter(k: Kit, blk: MapBlock, b: Bx, windows: MapSign[], r: () => number): void {
  const alongX = b.w > b.d;
  const inward = alongX ? -Math.sign(b.cz) : -Math.sign(b.cx);
  const face = alongX ? (inward > 0 ? b.z1 : b.z0) : inward > 0 ? b.x1 : b.x0;
  const lo = alongX ? b.x0 : b.z0;
  const hi = alongX ? b.x1 : b.z1;
  const paint = new THREE.Color(blk.paint ?? 0x7d8aa0);
  // A box from s0..s1 along the wall, t0..t1 metres in from the face (0: the face).
  const slab = (key: string, s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, tint: number | THREE.Color, ground?: number) => {
    const a = face - inward * t0;
    const c = face - inward * t1;
    const [p0, p1] = [Math.min(a, c), Math.max(a, c)];
    const o = ground !== undefined ? { ground } : {};
    if (alongX) span(k, key, s0, s1, y0, y1, p0, p1, tint, o);
    else span(k, key, p0, p1, y0, y1, s0, s1, tint, o);
  };
  const thick = alongX ? b.d : b.w;
  // The body, set back.
  slab('plaster', lo, hi, 0, b.y1, 0.08, thick, paint);
  // Piers between window columns and at the ends; fascia, storey band and cornice across the full face.
  const cols = [...new Set(windows.map((w) => (alongX ? w.centre.x : w.centre.z)))].sort((a, c) => a - c);
  const piers: number[] = [lo + 0.25, hi - 0.25];
  for (let i = 0; i + 1 < cols.length; i++) piers.push((cols[i]! + cols[i + 1]!) / 2);
  if (cols.length) piers.push(cols[0]! - 1.3, cols[cols.length - 1]! + 1.3);
  const pierW = 0.42;
  const hidden = (s: number) => (alongX ? inBuilding(s, face + inward * 0.4, 0.2) : inBuilding(face + inward * 0.4, s, 0.2));
  for (const s of piers) {
    if (s < lo + 0.1 || s > hi - 0.1) continue;
    slab('plaster', Math.max(lo, s - pierW / 2), Math.min(hi, s + pierW / 2), 0.3, b.y1 - 0.4, 0, 0.08, paint.clone().multiplyScalar(1.06));
  }
  slab('precast', lo, hi, 0, 0.3, 0, 0.08, PAL.plinth, 0);
  slab('paint', lo, hi, 3.2, 3.55, 0, 0.08, paint.clone().multiplyScalar(0.8));
  slab('paint', lo, hi, b.y1 - 0.4, b.y1, 0, 0.08, PAL.coping);
  slab('paint', lo, hi, b.y1 - 0.55, b.y1 - 0.4, 0, 0.05, paint.clone().multiplyScalar(0.75));
  // Street-level bays between the piers.
  const bays = [...piers].filter((s) => s > lo + 0.1 && s < hi - 0.1).sort((a, c) => a - c);
  const nrm = alongX ? V(0, 0, inward) : V(inward, 0, 0);
  const at = (s: number, y: number, t: number) => (alongX ? V(s, y, face - inward * t) : V(face - inward * t, y, s));
  for (let i = 0; i + 1 < bays.length; i++) {
    const s0 = bays[i]! + pierW / 2;
    const s1 = bays[i + 1]! - pierW / 2;
    const mid = (s0 + s1) / 2;
    if (s1 - s0 < 0.8 || hidden(mid)) continue;
    const pick = r();
    const fascia = paint.clone().multiplyScalar(0.62 + r() * 0.2);
    slab('paint', s0, s1, 2.75, 3.2, 0.02, 0.08, fascia);
    if (pick < 0.55) {
      // A roller shutter in its housing, a lock bar at the foot.
      const col = PAL.shutters[Math.floor(r() * PAL.shutters.length)]!;
      slab('nhShutter', s0, s1, 0.3, 2.62, 0.14, 0.2, col);
      slab('paintSteel', s0, s1, 2.62, 2.75, 0.06, 0.14, 0x3a3e46);
      if (k.p.smallParts) slab('steel', mid - 0.25, mid + 0.25, 0.34, 0.4, 0.1, 0.14, 0x9aa0a6);
      // Sparse graffiti on some shutters.
      if (r() > 0.62) decal(k, ['tagA', 'tagB', 'tagD', 'tagC'][Math.floor(r() * 4)]!, at(mid, 1.3 + r() * 0.5, 0.14), nrm, Math.min(1.9, s1 - s0 - 0.2), 0.8, 0xffffff, (r() - 0.5) * 0.1);
    } else if (pick < 0.75) {
      // A shop window lit inside, a dark door beside it.
      slab('paintSteel', s0, s1, 0.3, 0.7, 0.08, 0.18, 0x2a2e36);
      screen(k, r() > 0.5 ? 'shopShelf' : `room${Math.floor(r() * 6)}`, at(mid - 0.3, 1.65, 0.2), nrm, s1 - s0 - 1.0, 1.85, 0.9);
      slab('dark', s1 - 0.85, s1 - 0.05, 0.3, 2.5, 0.12, 0.2, 0x15171c);
      slab('paintSteel', s0, s1, 2.58, 2.75, 0.06, 0.16, 0x2a2e36);
    } else if (pick < 0.88) {
      // A recessed doorway with a step and a dim light over it.
      slab('dark', mid - 0.55, mid + 0.55, 0.3, 2.4, 0.2, 0.28, 0x1a1c22);
      slab('paintSteel', mid - 0.62, mid + 0.62, 2.4, 2.5, 0.08, 0.2, 0x2a2e36);
      slab('plaster', s0, mid - 0.62, 0.3, 2.75, 0.06, 0.08, paint.clone().multiplyScalar(0.9));
      slab('plaster', mid + 0.62, s1, 0.3, 2.75, 0.06, 0.08, paint.clone().multiplyScalar(0.9));
      if (k.p.smallParts) {
        const lamp = at(mid, 2.62, 0.02);
        bar(k, 'glow', lamp.x, lamp.y, lamp.z, alongX ? 0.3 : 0.05, 0.05, alongX ? 0.05 : 0.3, hdr(0xffd6a0, k, 0.7));
      }
      halo(k, at(mid, 2.4, 0.07), nrm, 1.6, 1.2, 0xffc890, 0.22);
    } else {
      // A blank bay with paste-ups.
      decal(k, r() > 0.5 ? 'posterA' : 'posterC', at(mid, 1.5, 0.08), nrm, r() > 0.5 ? 0.6 : 1.4, 0.9, 0xd8d8d8, (r() - 0.5) * 0.04);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------- floors

function floor(k: Kit, blk: MapBlock, b: Bx): void {
  if (b.y1 <= 0.01 && b.y0 < -0.1 && b.w > 20) {
    // The street's paving slab.
    span(k, 'nhPaving', b.x0, b.x1, b.y1 - 0.12, b.y1, b.z0, b.z1, 0xdedcd6, { radius: 0 });
    return;
  }
  if (blk.finish === 'asphalt') {
    // The road (look only, a few millimetres proud of the paving), kerb stones flush along both edges.
    span(k, 'nhAsphalt', b.x0, b.x1, b.y1 - 0.03, b.y1, b.z0, b.z1, 0xffffff, { radius: 0 });
    for (const x of [b.x0 - 0.15, b.x1 + 0.15]) span(k, 'precast', x - 0.15, x + 0.15, -0.02, 0.008, b.z0, b.z1, PAL.kerb, { radius: 0.01 });
    // A darker, wetter gutter along each kerb.
    for (const x of [b.x0 + 0.2, b.x1 - 0.2]) decal(k, 'stain', V(x, b.y1 + 0.001, 0), UP, 0.45, b.d, 0x2a2a30, 0);
    return;
  }
  const top = blk.finish === 'paving' ? 'nhPaving' : blk.finish === 'tiles' ? 'nhTiles' : 'concrete';
  const tint = new THREE.Color(blk.paint ?? 0xe4e8ec);
  span(k, top, b.x0, b.x1, b.y1 - 0.04, b.y1, b.z0, b.z1, tint, { radius: 0.004 });
  const bridge = b.y0 > 2 && Math.min(b.w, b.d) < BRIDGE_MAX_WIDTH && b.h > 0.12;
  // Under a bridge the soffit sits between its edge beams (and a touch up, so the two never share a face).
  const ix = bridge && b.d > b.w ? 0.121 : 0;
  const iz = bridge && b.w > b.d ? 0.121 : 0;
  if (b.h > 0.06) span(k, 'plaster', b.x0 + ix, b.x1 - ix, b.y0 + (bridge ? 0.004 : 0), b.y1 - 0.04, b.z0 + iz, b.z1 - iz, 0xd8d6d2, { radius: 0.01 });
  if (bridge) bridgeDeck(k, b);
}

/** Bridges are narrower than this (m); their decks get steel fascias and a lit strip under each edge. */
const BRIDGE_MAX_WIDTH = 2.6;

/** A bridge deck's look, inside its slab: dark steel edge beams, the soffit between them, a cyan strip under each edge. */
function bridgeDeck(k: Kit, b: Bx): void {
  const alongX = b.w > b.d;
  const beam = 0.12;
  const yb = b.y0;
  const yt = b.y1 - 0.04;
  for (const side of [0, 1]) {
    if (alongX) {
      const z0 = side ? b.z1 - beam : b.z0;
      span(k, 'paintSteel', b.x0, b.x1, yb, yt, z0, z0 + beam, 0x22243a, { radius: 0.01 });
      span(k, 'glow', b.x0 + 0.1, b.x1 - 0.1, yb - 0.0, yb + 0.03, side ? b.z1 - beam - 0.04 : b.z0 + beam, side ? b.z1 - beam : b.z0 + beam + 0.04, hdr(NEON.cyan, k, 0.6));
    } else {
      const x0 = side ? b.x1 - beam : b.x0;
      span(k, 'paintSteel', x0, x0 + beam, yb, yt, b.z0, b.z1, 0x22243a, { radius: 0.01 });
      span(k, 'glow', side ? b.x1 - beam - 0.04 : b.x0 + beam, side ? b.x1 - beam : b.x0 + beam + 0.04, yb, yb + 0.03, b.z0 + 0.1, b.z1 - 0.1, hdr(NEON.cyan, k, 0.6));
    }
  }
  // Cross ribs under the soffit, a bay apart.
  const L = alongX ? b.w : b.d;
  const n = Math.max(2, Math.round(L / 1.6));
  for (let i = 1; i < n; i++) {
    const t = (alongX ? b.x0 : b.z0) + (i * L) / n;
    if (alongX) span(k, 'paintSteel', t - 0.05, t + 0.05, yb, yb + 0.1, b.z0 + beam, b.z1 - beam, 0x2a2c40, { radius: 0.005 });
    else span(k, 'paintSteel', b.x0 + beam, b.x1 - beam, yb, yb + 0.1, t - 0.05, t + 0.05, 0x2a2c40, { radius: 0.005 });
  }
}

/** A stair inside its ramp's wedge: treads whose noses touch the slope, solid stringers and a closed underside. */
function stair(k: Kit, blk: MapBlock, b: Bx): void {
  const rise = blk.rise ?? '+x';
  const alongX = rise === '+x' || rise === '-x';
  const run = alongX ? b.w : b.d;
  const width = alongX ? b.d : b.w;
  const dir = rise === '+x' || rise === '+z' ? 1 : -1;
  const start = alongX ? (dir > 0 ? b.x0 : b.x1) : dir > 0 ? b.z0 : b.z1;
  const n = Math.round(b.h / 0.18);
  const step = run / n;
  const rh = b.h / n;
  const c0 = alongX ? b.z0 : b.x0;
  const put = (key: string, s0: number, s1: number, y0: number, y1: number, a0: number, a1: number, tint: number | THREE.Color) => {
    const [p, q] = [start + dir * s0, start + dir * s1];
    if (alongX) span(k, key, Math.min(p, q), Math.max(p, q), y0, y1, a0, a1, tint, { radius: 0.006 });
    else span(k, key, a0, a1, y0, y1, Math.min(p, q), Math.max(p, q), tint, { radius: 0.006 });
  };
  for (let i = 1; i < n; i++) {
    // Step i's tread stands at the slope's height under its nose, so every tread and riser stays inside the wedge.
    const top = b.y0 + rh * i;
    put('tread', step * i, step * (i + 1), top - 0.04, top, c0 + 0.06, c0 + width - 0.06, 0xaab1b8);
    put('paintSteel', step * i - 0.02, step * i, top - rh, top, c0 + 0.06, c0 + width - 0.06, 0x2e333c);
    if (k.p.smallParts) put('paint', step * i, step * i + 0.05, top, top + 0.003, c0 + 0.06, c0 + width - 0.06, 0xe8c440);
  }
  // Stringers: sloped plates along both sides; the underside closed so nothing shows through.
  const len = Math.hypot(run, b.h);
  const ang = Math.atan2(b.h, run);
  for (const side of [0.03, width - 0.03]) {
    const q = alongX ? new THREE.Quaternion().setFromAxisAngle(Z, dir * ang) : new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -dir * ang);
    const mid = alongX ? V(b.cx, b.cy - 0.14, c0 + side) : V(c0 + side, b.cy - 0.14, b.cz);
    k.add('paintSteel', new THREE.BoxGeometry(alongX ? len - 0.1 : 0.05, 0.28, alongX ? 0.05 : len - 0.1), new THREE.Matrix4().compose(mid, q, V(1, 1, 1)), 0x3a404c, {});
  }
  const g = new THREE.BoxGeometry(alongX ? b.w : b.w - 0.1, b.h, alongX ? b.d - 0.1 : b.d);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const s = alongX ? pos.getX(i) : pos.getZ(i);
    const t = dir > 0 ? s / run + 0.5 : 0.5 - s / run;
    if (pos.getY(i) > 0) pos.setY(i, Math.max(-b.h / 2 + 0.01, -b.h / 2 + b.h * t - rh - 0.02));
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  k.add('paintSteel', ng, new THREE.Matrix4().makeTranslation(b.cx, b.cy, b.cz), 0x2e333c, { ground: b.y0 });
}

/** A rail as a solid balustrade: kick plate, a perforated panel (opaque, as the game draws it), posts and a handrail. */
function rail(k: Kit, b: Bx): void {
  const alongX = b.w >= b.d;
  const len = alongX ? b.w : b.d;
  span(k, 'paintSteel', b.x0, b.x1, b.y0, b.y0 + 0.1, b.z0, b.z1, 0x2e333c);
  const inset = 0.035;
  if (alongX) span(k, 'nhPerf', b.x0 + 0.02, b.x1 - 0.02, b.y0 + 0.1, b.y1 - 0.08, b.z0 + inset, b.z1 - inset, PAL.rail, { radius: 0.004 });
  else span(k, 'nhPerf', b.x0 + inset, b.x1 - inset, b.y0 + 0.1, b.y1 - 0.08, b.z0 + 0.02, b.z1 - 0.02, PAL.rail, { radius: 0.004, uvRot: true });
  span(k, 'steel', b.x0, b.x1, b.y1 - 0.08, b.y1, b.z0, b.z1, 0x8a929c, { radius: 0.03 });
  const posts = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= posts; i++) {
    const s = -len / 2 + 0.03 + (i * (len - 0.06)) / posts;
    const x = alongX ? b.cx + s : b.cx;
    const z = alongX ? b.cz : b.cz + s;
    bar(k, 'paintSteel', x, (b.y0 + b.y1) / 2, z, alongX ? 0.05 : b.w, b.h - 0.02, alongX ? b.d : 0.05, 0x2a2e36);
  }
}

// ---------------------------------------------------------------------------------------------------------------- city props

function along(b: Bx): { ax: 'x' | 'z'; L: number; W: number; a0: number; c0: number } {
  return b.w >= b.d ? { ax: 'x', L: b.w, W: b.d, a0: b.x0, c0: b.z0 } : { ax: 'z', L: b.d, W: b.w, a0: b.z0, c0: b.x0 };
}

/** A box given along-axis and across-axis spans. */
function aspan(k: Kit, key: string, b: Bx, s0: number, s1: number, y0: number, y1: number, t0: number, t1: number, tint: number | THREE.Color, opts: { radius?: number; ground?: number } = {}): void {
  const A = along(b);
  if (A.ax === 'x') span(k, key, A.a0 + s0, A.a0 + s1, y0, y1, A.c0 + t0, A.c0 + t1, tint, opts);
  else span(k, key, A.c0 + t0, A.c0 + t1, y0, y1, A.a0 + s0, A.a0 + s1, tint, opts);
}
/** A point given along, up and across offsets, and the outward normal of the across side (side -1 or +1). */
function apt(b: Bx, s: number, y: number, t: number): THREE.Vector3 {
  const A = along(b);
  return A.ax === 'x' ? V(A.a0 + s, y, A.c0 + t) : V(A.c0 + t, y, A.a0 + s);
}
const anorm = (b: Bx, side: number): THREE.Vector3 => (along(b).ax === 'x' ? V(0, 0, side) : V(side, 0, 0));
/** The rotation that turns a panel's text along the block's long axis for a face on `side`. */

function cabinets(k: Kit, b: Bx, seed: number): void {
  const A = along(b);
  const n = Math.max(1, Math.round(A.L / 0.8));
  const w = A.L / n;
  const hues = [0x2ef2c4, 0xff3cac, 0xb07bff, 0xd8ff3a];
  aspan(k, 'plastic', b, 0, A.L, b.y0, b.y0 + 0.1, 0, A.W, PAL.dark, { ground: b.y0 });
  // A shared light box along the top (the block is taller than the cabinets): "HI-SCORE" strips.
  aspan(k, 'paintSteel', b, 0, A.L, b.y1 - 0.42, b.y1, 0, A.W, 0x1a1530, { radius: 0.01 });
  for (let i = 0; i < n; i++) {
    const s0 = i * w;
    const hue = hues[(i + seed) % hues.length]!;
    const game = (i + seed) % 4;
    // The body between its side panels, painted the cabinet's colour.
    aspan(k, 'plastic', b, s0 + 0.02, s0 + w - 0.02, b.y0 + 0.1, b.y1 - 0.42, 0.04, A.W - 0.04, 0x15161c, { radius: 0.01 });
    for (const e of [s0 + 0.02, s0 + w - 0.06]) aspan(k, 'plastic', b, e, e + 0.04, b.y0 + 0.1, b.y1 - 0.42, 0, A.W, hue, { radius: 0.012 });
    for (const side of [-1, 1]) {
      const t = side < 0 ? 0 : A.W;
      const n0 = anorm(b, side);
      const mid = s0 + w / 2;
      // Screen, marquee, control deck with stick and buttons, coin door.
      screen(k, `game${game}`, apt(b, mid, b.y0 + 1.42, t + side * 0.003), n0, w - 0.16, 0.5, k.p.bloom ? 1.6 : 1.0);
      screen(k, `marquee${game}`, apt(b, mid, b.y0 + 1.86, t + side * 0.003), n0, w - 0.12, 0.2, k.p.bloom ? 1.8 : 1.0);
      aspan(k, 'plastic', b, s0 + 0.06, s0 + w - 0.06, b.y0 + 0.96, b.y0 + 1.06, side < 0 ? 0 : A.W - 0.04, side < 0 ? 0.04 : A.W, 0x22242c, { radius: 0.01 });
      if (k.p.smallParts) {
        const deck = apt(b, mid - 0.15, b.y0 + 1.1, t - side * 0.0);
        rod(k, 'steel', deck, deck.clone().add(V(0, 0.08, 0)), 0.008, 0x111111);
        k.add('plastic', new THREE.SphereGeometry(0.022, 10, 6), new THREE.Matrix4().makeTranslation(deck.x, deck.y + 0.09, deck.z), 0xe8303c, {});
        for (let j = 0; j < 4; j++) {
          const p = apt(b, mid + j * 0.06 - 0.02, b.y0 + 1.07, t);
          k.add('glow', new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10), new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), hdr([0xff3cac, 0x2ef2c4, 0xffd23a, 0x7cf0ff][j]!, k, 0.5), {});
        }
        const door = apt(b, mid, b.y0 + 0.45, t + side * 0.002);
        screen(k, 'leds', door, n0, 0.1, 0.04, 1.2);
      }
    }
  }
}

function vending(k: Kit, b: Bx, seed: number): City['glows'] {
  const A = along(b);
  const n = Math.max(1, Math.round(A.L / 1.0));
  const w = A.L / n;
  const glows: City['glows'] = [];
  const bodies = [0xd8303c, 0x2a6ad8, 0x2a9a5a];
  // A lit header box over the bank (the block stands taller than the machines).
  aspan(k, 'paintSteel', b, 0, A.L, b.y1 - 0.38, b.y1, 0, A.W, 0x22252e, { radius: 0.015 });
  for (let i = 0; i < n; i++) {
    const s0 = i * w;
    const brand = (i + seed) % 3;
    const body = bodies[brand]!;
    aspan(k, 'plastic', b, s0 + 0.01, s0 + w - 0.01, b.y0, b.y1 - 0.38, 0.0, A.W, body, { radius: 0.03, ground: b.y0 });
    for (const side of [-1, 1]) {
      const t = side < 0 ? 0 : A.W;
      const n0 = anorm(b, side);
      const mid = s0 + w / 2;
      const win = apt(b, mid - w * 0.08, b.y0 + 1.2, t + side * 0.004);
      screen(k, `vend${brand}`, win, n0, w * 0.62, 1.25, k.p.bloom ? 1.1 : 0.95);
      screen(k, `vendHead${brand}`, apt(b, mid, b.y1 - 0.19, t + side * 0.004), n0, w * 0.9, 0.3, k.p.bloom ? 1.6 : 1.1);
      // Coin panel and the dispenser bay.
      aspan(k, 'plastic', b, s0 + w * 0.76, s0 + w * 0.94, b.y0 + 0.9, b.y0 + 1.6, side < 0 ? -0.0 : A.W - 0.03, side < 0 ? 0.03 : A.W, 0x2a2e36, { radius: 0.01 });
      aspan(k, 'dark', b, s0 + w * 0.12, s0 + w * 0.62, b.y0 + 0.2, b.y0 + 0.4, side < 0 ? 0 : A.W - 0.02, side < 0 ? 0.02 : A.W, 0x0c0d10, { radius: 0.005 });
      if (k.p.smallParts) {
        const p = apt(b, s0 + w * 0.85, b.y0 + 1.45, t + side * 0.035);
        screen(k, 'leds', p, n0, 0.12, 0.03, 1.4);
      }
      glows.push({ pos: win, colour: 0xe8f6ff, size: w * 0.6 });
    }
  }
  return glows;
}

function stall(k: Kit, b: Bx, i: number, lights: Spot[]): void {
  const A = along(b);
  const p = k.p;
  const noodle = A.L > 2;
  const shrine = !noodle && i % 2 === 0;
  if (shrine) {
    // A small street shrine: a red timber body on a stone plinth, a little curved roof, candles behind glass.
    span(k, 'precast', b.x0, b.x1, b.y0, b.y0 + 0.5, b.z0, b.z1, 0x9a968e, { ground: b.y0 });
    span(k, 'timber', b.x0 + 0.04, b.x1 - 0.04, b.y0 + 0.5, b.y1 - 0.5, b.z0 + 0.04, b.z1 - 0.04, 0xb8302a, { radius: 0.02 });
    for (const side of [-1, 1]) {
      const t = side < 0 ? 0.04 : A.W - 0.04;
      screen(k, 'shrine', apt(b, A.L / 2, b.y0 + 1.15, t + side * 0.004), anorm(b, side), A.L - 0.3, 0.6, k.p.bloom ? 1.5 : 1.0);
    }
    span(k, 'timber', b.x0, b.x1, b.y1 - 0.5, b.y1 - 0.38, b.z0, b.z1, 0x2a1a14, { radius: 0.01 });
    span(k, 'paint', b.x0 + 0.02, b.x1 - 0.02, b.y1 - 0.38, b.y1 - 0.08, b.z0 + 0.02, b.z1 - 0.02, 0x3a2a30, { radius: 0.06 });
    span(k, 'paint', b.x0, b.x1, b.y1 - 0.08, b.y1, b.z0, b.z1, 0x2a1a14, { radius: 0.03 });
    const c = V(b.cx, b.y0 + 1.15, b.cz);
    lights.push({ pos: c.clone().add(V(0, 0.2, 0)), colour: 0xffa040, power: 3, range: 4 });
    return;
  }
  // A counter of boards, shelves of goods behind it, a striped awning; a noodle stall adds a curtain, a menu, a steaming
  // pot and red lanterns under the awning (all inside the stall's box).
  const top = b.y1 - 0.3;
  aspan(k, 'planks', b, 0, A.L, b.y0, b.y0 + 1.0, 0, A.W, PAL.stallWood, { ground: b.y0 });
  aspan(k, 'timber', b, -0.0, A.L, b.y0 + 0.98, b.y0 + 1.04, 0, A.W, 0x8a5a34, { radius: 0.01 });
  aspan(k, 'plywood', b, 0.04, A.L - 0.04, b.y0 + 1.04, top, 0.06, A.W - 0.06, 0x6a5038);
  const n = Math.max(1, Math.round(A.L / 0.3));
  const sw = A.L / n;
  for (let j = 0; j < n; j++) aspan(k, 'fabric', b, j * sw, (j + 1) * sw, top, b.y1, 0, A.W, j % 2 ? 0xf4f1ea : noodle ? 0xc8302a : 0x2a8a8a, { radius: 0.02 });
  for (const side of [-1, 1]) {
    const t = side < 0 ? 0.06 : A.W - 0.06;
    const n0 = anorm(b, side);
    if (noodle) {
      screen(k, 'noren', apt(b, A.L / 2, top - 0.28, t + side * 0.005), n0, A.L - 0.2, 0.55, 0.55);
      screen(k, 'menu', apt(b, A.L * 0.3, b.y0 + 1.45, t + side * 0.005), n0, 0.8, 0.4, k.p.bloom ? 1.2 : 0.9);
    } else {
      // Goods on two shelves: jars and boxes in bright colours.
      for (const y of [1.3, 1.7]) {
        aspan(k, 'timber', b, 0.05, A.L - 0.05, b.y0 + y - 0.02, b.y0 + y, side < 0 ? 0.0 : A.W - 0.08, side < 0 ? 0.08 : A.W, 0x8a5a34);
        for (let g = 0; g < 4; g++) {
          const s = 0.15 + g * ((A.L - 0.3) / 3);
          const c = [0xe8a040, 0x3ad07a, 0xe8303c, 0x7cf0ff][(g + Math.round(y * 10)) % 4]!;
          aspan(k, 'plastic', b, s - 0.06, s + 0.06, b.y0 + y, b.y0 + y + 0.16, side < 0 ? 0.0 : A.W - 0.07, side < 0 ? 0.07 : A.W, c, { radius: 0.01 });
        }
      }
    }
  }
  if (noodle) {
    const pot = apt(b, A.L * 0.72, b.y0 + 1.12, A.W / 2);
    k.add('steel', new THREE.CylinderGeometry(0.2, 0.18, 0.2, p.curveSegments), new THREE.Matrix4().makeTranslation(pot.x, pot.y, pot.z), 0xb4b9be, {});
    if (p.smallParts) for (let j = 0; j < 4; j++) {
      // Paper lanterns under the awning.
      const l = apt(b, 0.25 + j * ((A.L - 0.5) / 3), top - 0.18, j % 2 ? 0.08 : A.W - 0.08);
      k.add('glow', new THREE.SphereGeometry(0.11, 12, 8).scale(1, 1.25, 1), new THREE.Matrix4().makeTranslation(l.x, l.y, l.z), hdr(0xff3b2a, k, 0.6), {});
      halo(k, l.clone().add(V(0, 0, 0)), V(0, 0, 1), 0.7, 0.7, 0xff4020, 0.25);
    }
    lights.push({ pos: apt(b, A.L / 2, top - 0.4, A.W / 2), colour: 0xff7a40, power: 5, range: 6 });
  }
}

function planter(k: Kit, b: Bx, r: () => number): void {
  // Boards round a timber frame, soil, a clipped shrub filling the top; a can or a cup left on the soil.
  span(k, 'timber', b.x0, b.x1, b.y0, b.y1 - 0.16, b.z0, b.z1, 0x9a6a3c, { ground: b.y0, radius: 0.02 });
  for (let i = 0; i < 4; i++) span(k, 'timber', b.x0 - 0.0, b.x1, b.y0 + 0.12 + i * 0.24, b.y0 + 0.14 + i * 0.24, b.z0, b.z1, 0x6a4424, { radius: 0.004 });
  span(k, 'dark', b.x0 + 0.06, b.x1 - 0.06, b.y1 - 0.18, b.y1 - 0.15, b.z0 + 0.06, b.z1 - 0.06, 0x2a2018);
  const lobes = k.p.smallParts ? 7 : 2;
  for (let i = 0; i < lobes; i++) {
    const g = new THREE.IcosahedronGeometry(1, k.p.smallParts ? 2 : 1);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const n = 0.85 + hashPos(pos.getX(v) * 3 + i, pos.getZ(v) * 3 + pos.getY(v)) * 0.25;
      pos.setXYZ(v, pos.getX(v) * n, pos.getY(v) * n, pos.getZ(v) * n);
    }
    g.computeVertexNormals();
    const rx = (b.w - 0.2) / 2;
    const rz = (b.d - 0.2) / 2;
    const ox = lobes > 2 ? (r() - 0.5) * rx : 0;
    const oz = lobes > 2 ? (r() - 0.5) * rz : 0;
    const s = lobes > 2 ? 0.34 : 0.5;
    // A round clipped mound, its crown just inside the box's top.
    const hy = lobes > 2 ? 0.2 + r() * 0.08 : 0.3;
    const m = new THREE.Matrix4().compose(V(b.cx + ox, b.y1 - 0.02 - hy, b.cz + oz), new THREE.Quaternion(), V(Math.min(s, rx - Math.abs(ox)), hy, Math.min(s, rz - Math.abs(oz))));
    k.add('foliage', g, m, new THREE.Color(0x3f6e34).multiplyScalar(0.8 + r() * 0.4), {});
  }
}

function booth(k: Kit, b: Bx, i: number, lights: Spot[]): City['glows'] {
  const kiosk = b.w > 2 || b.d > 1.6;
  const photo = !kiosk && b.w < 1.1;
  const frame = kiosk ? 0x2a6a6a : photo ? 0x6a2a5a : 0x2a8a7a;
  span(k, 'paintSteel', b.x0, b.x1, b.y0, b.y0 + 0.12, b.z0, b.z1, PAL.dark, { ground: b.y0 });
  // The dark core (opaque, as the game's booth), glass all round in front of it, corner posts.
  span(k, 'dark', b.x0 + 0.05, b.x1 - 0.05, b.y0 + 0.12, b.y1 - 0.4, b.z0 + 0.05, b.z1 - 0.05, 0x101218);
  const post = 0.07;
  for (const x of [b.x0, b.x1 - post]) for (const z of [b.z0, b.z1 - post]) span(k, 'paintSteel', x, x + post, b.y0 + 0.12, b.y1 - 0.14, z, z + post, frame, { radius: 0.01 });
  // A rail across each pane at waist height (the glass itself is the lit interior's face, at the box's skin).
  span(k, 'paintSteel', b.x0 + post, b.x1 - post, b.y0 + 0.92, b.y0 + 0.97, b.z0, b.z0 + 0.03, frame);
  span(k, 'paintSteel', b.x0 + post, b.x1 - post, b.y0 + 0.92, b.y0 + 0.97, b.z1 - 0.03, b.z1, frame);
  span(k, 'paintSteel', b.x0, b.x0 + 0.03, b.y0 + 0.92, b.y0 + 0.97, b.z0 + post, b.z1 - post, frame);
  span(k, 'paintSteel', b.x1 - 0.03, b.x1, b.y0 + 0.92, b.y0 + 0.97, b.z0 + post, b.z1 - post, frame);
  // Inside: a lit wash behind the glass (the core's faces), and what the booth is.
  const cell = kiosk ? 'shopShelf' : photo ? 'podGlow' : 'room4';
  const glow = kiosk ? 0.9 : photo ? 0.5 : 0.35;
  for (const [n, c, w] of [
    [V(0, 0, -1), V(b.cx, b.y0 + 0.13 + (b.h - 0.55) / 2, b.z0 + 0.04), b.w - 2 * post],
    [V(0, 0, 1), V(b.cx, b.y0 + 0.13 + (b.h - 0.55) / 2, b.z1 - 0.04), b.w - 2 * post],
    [V(-1, 0, 0), V(b.x0 + 0.04, b.y0 + 0.13 + (b.h - 0.55) / 2, b.cz), b.d - 2 * post],
    [V(1, 0, 0), V(b.x1 - 0.04, b.y0 + 0.13 + (b.h - 0.55) / 2, b.cz), b.d - 2 * post],
  ] as const) screen(k, cell, c, n, w, b.h - 0.55, glow);
  if (!kiosk && !photo && k.p.smallParts) {
    // The phone on its back panel.
    span(k, 'plastic', b.cx - 0.12, b.cx + 0.12, b.y0 + 1.1, b.y0 + 1.55, b.z0 + 0.05, b.z0 + 0.12, 0x9aa0a8, { radius: 0.02 });
  }
  // The sign band, lit, and the roof.
  const band = `band${kiosk ? 1 : photo ? 2 : 0}`;
  for (const [n, c, w] of [
    [V(0, 0, -1), V(b.cx, b.y1 - 0.27, b.z0), b.w - 0.16],
    [V(0, 0, 1), V(b.cx, b.y1 - 0.27, b.z1), b.w - 0.16],
    [V(-1, 0, 0), V(b.x0, b.y1 - 0.27, b.cz), b.d - 0.16],
    [V(1, 0, 0), V(b.x1, b.y1 - 0.27, b.cz), b.d - 0.16],
  ] as const) screen(k, band, c, n, w, 0.2, k.p.bloom ? 1.8 : 1.1);
  span(k, 'paintSteel', b.x0 + 0.02, b.x1 - 0.02, b.y1 - 0.4, b.y1 - 0.14, b.z0 + 0.02, b.z1 - 0.02, 0x14161c);
  span(k, 'paintSteel', b.x0, b.x1, b.y1 - 0.14, b.y1, b.z0, b.z1, frame, { radius: 0.03 });
  lights.push({ pos: V(b.cx, b.y1 + 0.3, b.cz), colour: kiosk ? 0xfff0d0 : 0x6fffd8, power: kiosk ? 3 : 1.5, range: 4 });
  void i;
  return [{ pos: V(b.cx, b.y1 - 0.27, b.cz), colour: kiosk ? 0xffd23a : photo ? 0xff8ad8 : 0x6fffd8, size: 0.6 }];
}

/** The parked van: a boxy delivery van on four wheels, its underside skirted (as the game's), hazard lights blinking. */
function van(k: Kit, b: Bx): City['glows'] {
  const A = along(b);
  const p = k.p;
  const front = -1; // The cab at the north end (-z): parked on the left, facing north.
  const L = A.L;
  const W = A.W;
  const y0 = b.y0;
  const s = (t: number) => (front < 0 ? t : L - t);
  const sp = (key: string, t0: number, t1: number, ya: number, yb: number, c0: number, c1: number, tint: number | THREE.Color, radius = 0.02) =>
    aspan(k, key, b, Math.min(s(t0), s(t1)), Math.max(s(t0), s(t1)), ya, yb, c0, c1, tint, { radius });
  // Skirt (dark, set in), wheels, the body (cargo box and cab), bumpers.
  sp('dark', 0.3, L - 0.3, y0, y0 + 0.4, 0.12, W - 0.12, 0x0c0d10, 0.01);
  for (const t of [0.85, L - 0.8]) for (const side of [0, W - 0.24]) {
    const c = apt(b, s(t), y0 + 0.34, side + 0.12);
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.24, p.curveSegments).rotateX(A.ax === 'z' ? 0 : Math.PI / 2);
    if (A.ax === 'z') g.rotateZ(Math.PI / 2);
    k.add('rubber', g, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), 0x16171a, {});
    const hub = new THREE.CylinderGeometry(0.18, 0.18, 0.25, p.curveSegments).rotateX(A.ax === 'z' ? 0 : Math.PI / 2);
    if (A.ax === 'z') hub.rotateZ(Math.PI / 2);
    k.add('galv', hub, new THREE.Matrix4().makeTranslation(c.x, c.y, c.z), 0x9aa0a8, {});
  }
  const paint = new THREE.Color(PAL.van);
  sp('nhCarPaint', 1.35, L - 0.05, y0 + 0.4, b.y1 - 0.02, 0.02, W - 0.02, paint, 0.08);
  sp('nhCarPaint', 0.1, 1.38, y0 + 0.4, y0 + 1.25, 0.04, W - 0.04, paint, 0.1);
  sp('nhCarPaint', 0.35, 1.38, y0 + 1.25, b.y1 - 0.12, 0.05, W - 0.05, paint, 0.1);
  // The windscreen (raked a little: two steps) and the cab's side windows.
  sp('nhGlass', 0.32, 0.38, y0 + 1.28, b.y1 - 0.18, 0.12, W - 0.12, 0x1a2230, 0.01);
  for (const side of [0.03, W - 0.05]) sp('nhGlass', 0.45, 1.25, y0 + 1.32, b.y1 - 0.2, side, side + 0.02, 0x1a2230, 0.01);
  sp('plastic', 0.0, 0.14, y0 + 0.35, y0 + 0.62, 0.02, W - 0.02, 0x1e2126, 0.03);
  sp('plastic', L - 0.08, L, y0 + 0.35, y0 + 0.6, 0.02, W - 0.02, 0x1e2126, 0.03);
  // Livery on both sides: a made-up delivery company.
  for (const side of [-1, 1]) {
    const t = side < 0 ? 0.02 : W - 0.02;
    const n0 = anorm(b, side);
    const c = apt(b, s(L * 0.62), y0 + 1.45, t + side * 0.003);
    const rot = A.ax === 'z' ? (side > 0 ? 0 : 0) : 0;
    decal(k, 'stickers', c.clone().add(V(0, 0.25, 0)), n0, 0.9, 0.45, 0xffffff, rot);
    sp('paint', 1.5, L - 0.2, y0 + 0.95, y0 + 1.08, side < 0 ? 0.0 : W - 0.02, side < 0 ? 0.02 : W, 0xff3cac, 0.005);
    sp('paint', 1.5, L - 0.2, y0 + 1.08, y0 + 1.14, side < 0 ? 0.0 : W - 0.02, side < 0 ? 0.02 : W, 0x2ef2c4, 0.005);
  }
  // Lights: headlamps off, tail lamps dim, the hazard lights on (a still of their blink).
  const glows: City['glows'] = [];
  for (const c of [0.25, W - 0.25]) {
    const hl = apt(b, s(0.0), y0 + 0.82, c);
    screen(k, 'headlight', hl.clone().add(front < 0 ? (A.ax === 'z' ? V(0, 0, -0.012) : V(-0.012, 0, 0)) : V(0, 0, 0)), A.ax === 'z' ? V(0, 0, -1) : V(-1, 0, 0), 0.22, 0.16, 0.25);
    const tl = apt(b, s(L), y0 + 0.9, c);
    screen(k, 'taillight', tl.clone().add(A.ax === 'z' ? V(0, 0, 0.012) : V(0.012, 0, 0)), A.ax === 'z' ? V(0, 0, 1) : V(1, 0, 0), 0.14, 0.3, 0.6);
    for (const [t, n] of [[0.0, -1], [L, 1]] as const) {
      const hz = apt(b, s(t), y0 + 1.12, c);
      const off = A.ax === 'z' ? V(0, 0, n * 0.02) : V(n * 0.02, 0, 0);
      k.add('glow', new THREE.BoxGeometry(0.12, 0.07, 0.04), new THREE.Matrix4().makeTranslation(hz.x + off.x, hz.y, hz.z + off.z), hdr(0xffa531, k, 1.1), {});
      halo(k, hz.clone().add(off.multiplyScalar(2)), A.ax === 'z' ? V(0, 0, n) : V(n, 0, 0), 0.6, 0.6, 0xffa531, 0.5);
      glows.push({ pos: hz.clone(), colour: 0xffa531, size: 0.2 });
    }
  }
  if (p.smallParts) {
    // Roof bars, mirrors, a wiper.
    for (const t of [1.7, L - 0.6]) sp('steel', t, t + 0.05, b.y1 - 0.02, b.y1, 0.1, W - 0.1, 0x3a3e46, 0.01);
    for (const side of [-0.0, W]) {
      const m = apt(b, s(0.6), y0 + 1.4, side);
      bar(k, 'plastic', m.x, m.y, m.z, 0.08, 0.16, 0.08, 0x1e2126);
    }
  }
  return glows;
}

/** A parcel stack: boxes of mixed sizes on a pallet under film, a strap round it. */
function parcels(k: Kit, b: Bx, r: () => number): void {
  span(k, 'timber', b.x0 + 0.02, b.x1 - 0.02, b.y0, b.y0 + 0.14, b.z0 + 0.02, b.z1 - 0.02, 0x9a7a52, { ground: b.y0 });
  let y = b.y0 + 0.14;
  while (y < b.y1 - 0.1) {
    const h = Math.min(b.y1 - y, 0.32 + r() * 0.3);
    const nx = Math.max(1, Math.round(b.w / (0.5 + r() * 0.3)));
    const nz = Math.max(1, Math.round(b.d / (0.5 + r() * 0.3)));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x0 = b.x0 + 0.03 + (i * (b.w - 0.06)) / nx;
      const z0 = b.z0 + 0.03 + (j * (b.d - 0.06)) / nz;
      const t = new THREE.Color([0xc9a066, 0xb8925a, 0xd8b483, 0xe8e2d6][Math.floor(r() * 4)]!).multiplyScalar(0.85 + r() * 0.2);
      span(k, 'carton', x0 + 0.01, x0 + (b.w - 0.06) / nx - 0.01, y, y + h - 0.01, z0 + 0.01, z0 + (b.d - 0.06) / nz - 0.01, t, { ground: b.y0, radius: 0.012 });
    }
    y += h;
  }
  span(k, 'film', b.x0 + 0.01, b.x1 - 0.01, b.y0 + 0.14, b.y1, b.z0 + 0.01, b.z1 - 0.01, 0xe6f0f6, { radius: 0.05 });
  span(k, 'plastic', b.x0, b.x1, b.y0 + 1.1, b.y0 + 1.14, b.z0, b.z1, 0x2a6ad8, { radius: 0.03 });
}

/** Shelving loaded to the top: crates, bags, buckets and boxes (it is full cover in the game). */
function rack(k: Kit, b: Bx, r: () => number): void {
  const A = along(b);
  const levels = [0.08, 0.86, 1.64];
  const bays = Math.max(1, Math.round(A.L / 1.2));
  for (let i = 0; i <= bays; i++) for (const t of [0.02, A.W - 0.06]) aspan(k, 'paintSteel', b, (i * (A.L - 0.05)) / bays, (i * (A.L - 0.05)) / bays + 0.05, b.y0, b.y1, t, t + 0.04, 0x3a6ad8, { ground: b.y0 });
  aspan(k, 'dark', b, 0.05, A.L - 0.05, b.y0, b.y1 - 0.02, A.W * 0.45, A.W * 0.55, 0x1a1c20);
  for (const y of levels) {
    aspan(k, 'paintSteel', b, 0, A.L, b.y0 + y, b.y0 + y + 0.06, 0, A.W, 0xe8622a, { radius: 0.008 });
    for (let i = 0; i < bays * 2; i++) {
      const s0 = 0.08 + (i * (A.L - 0.16)) / (bays * 2);
      const s1 = 0.08 + ((i + 1) * (A.L - 0.16)) / (bays * 2) - 0.04;
      const hh = 0.5 + r() * 0.22;
      const pick = r();
      const col = pick < 0.4 ? 0xc9a066 : pick < 0.7 ? [0x2a8a5a, 0x3a6ad8, 0xd8303c][Math.floor(r() * 3)]! : 0x2a2c30;
      aspan(k, pick < 0.4 ? 'carton' : pick < 0.7 ? 'plastic' : 'nhBag', b, s0, s1, b.y0 + y + 0.06, b.y0 + y + 0.06 + Math.min(hh, 0.7), 0.04, A.W - 0.04, col, { radius: pick < 0.7 ? 0.015 : 0.1 });
    }
  }
  aspan(k, 'carton', b, 0.08, A.L - 0.08, b.y0 + 2.42 - 0.68, b.y1 - 0.01, 0.06, A.W - 0.06, 0xb8925a, { radius: 0.015 });
}

/** The skip: an open steel bin heaped with bin bags, boxes and junk, all under the block's top. */
function skip(k: Kit, b: Bx, r: () => number): void {
  const g = new THREE.BoxGeometry(b.w, b.h - 0.12, b.d, 1, 1, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0) {
    pos.setX(i, pos.getX(i) * 0.8);
    pos.setZ(i, pos.getZ(i) * 0.9);
  }
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  k.add('paintSteel', ng, new THREE.Matrix4().makeTranslation(b.cx, b.y0 + 0.08 + (b.h - 0.12) / 2, b.cz), 0x2a7a6a, { ground: b.y0 });
  span(k, 'steel', b.x0 + b.w * 0.15, b.x1 - b.w * 0.15, b.y0, b.y0 + 0.1, b.z0 + 0.1, b.z1 - 0.1, 0x2f3238, { ground: b.y0 });
  span(k, 'paintSteel', b.x0, b.x1, b.y1 - 0.08, b.y1 - 0.02, b.z0, b.z1, 0x1e5a4e, { radius: 0.02 });
  bags(k, b.x0 + 0.15, b.x1 - 0.15, b.z0 + 0.12, b.z1 - 0.12, b.y1 - 0.25, b.y1, r, 9);
  span(k, 'carton', b.cx - 0.3, b.cx + 0.1, b.y1 - 0.25, b.y1 - 0.02, b.cz - 0.15, b.cz + 0.25, 0xc9a066, { radius: 0.01 });
  decal(k, 'tagD', V(b.cx, b.y0 + 0.65, b.z1 - (b.d * 0.05)), V(0, 0, 1), b.w * 0.7, 0.5, 0xffffff, 0.04);
}

/** A heap of bin bags inside x0..x1 × z0..z1, their tops no higher than yTop. Bags are squashed, lumpy and glossy. */
export function bags(k: Kit, x0: number, x1: number, z0: number, z1: number, yBase: number, yTop: number, r: () => number, n: number): void {
  const geo = bagGeo(k.p.smallParts ? 10 : 4);
  for (let i = 0; i < n; i++) {
    const sx = 0.22 + r() * 0.12;
    const sz = 0.2 + r() * 0.1;
    const sy = Math.min((yTop - yBase) * 0.55, 0.16 + r() * 0.1);
    const x = THREE.MathUtils.clamp(x0 + r() * (x1 - x0), x0 + sx, x1 - sx);
    const z = THREE.MathUtils.clamp(z0 + r() * (z1 - z0), z0 + sz, z1 - sz);
    const y = Math.min(yTop - sy, yBase + sy * 0.9);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.4, r() * 6, (r() - 0.5) * 0.4));
    const col = [0x1a1c20, 0x22262a, 0x1e2a22, 0x2a2a34, 0x3a5a8a][r() > 0.85 ? 4 : Math.floor(r() * 4)]!;
    k.add('nhBag', geo, new THREE.Matrix4().compose(V(x, y, z), q, V(sx, sy, sz)), col, {});
  }
}

const bagCache = new Map<number, THREE.BufferGeometry>();
/** A bin bag: a lumpy sphere with a tied neck. */
export function bagGeo(seg: number): THREE.BufferGeometry {
  const hit = bagCache.get(seg);
  if (hit) return hit;
  const g = new THREE.SphereGeometry(1, seg * 2, seg);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const lump = 1 + (hashPos(x * 2.3 + z, y * 3.1) - 0.5) * 0.22;
    const flat = y < -0.3 ? 0.6 + (y + 1) * 0.55 : 1;
    const neck = y > 0.7 ? 1 - (y - 0.7) * 1.6 : 1;
    pos.setXYZ(i, x * lump * neck, y * flat + (y > 0.85 ? 0.15 : 0), z * lump * neck);
  }
  g.computeVertexNormals();
  bagCache.set(seg, g);
  return g;
}

/** Furniture inside the buildings, told apart by the paint the map gives them (neonHeights.ts PAINT). */
function furniture(k: Kit, blk: MapBlock, b: Bx, lights: Spot[]): void {
  const paint = blk.paint ?? 0xcccccc;
  const tint = new THREE.Color(paint);
  switch (paint) {
    case 0xe25fa4: // The arcade's prize counter: a tiled base, a glass case of lit prizes.
    case 0x2fb59a: { // The bar: a tiled front, a timber top.
      span(k, 'nhTiles', b.x0, b.x1, b.y0, b.y1 - 0.06, b.z0, b.z1, tint, { ground: b.y0 });
      span(k, 'timber', b.x0 - 0.0, b.x1, b.y1 - 0.06, b.y1, b.z0, b.z1, 0x6a4424, { radius: 0.01 });
      if (paint === 0xe25fa4) {
        screen(k, 'shopShelf', V(b.cx, b.y0 + 0.8, b.z0 - 0.0), V(0, 0, -1), b.w - 0.2, 0.4, 0.9);
        screen(k, 'shopShelf', V(b.cx, b.y0 + 0.8, b.z1), V(0, 0, 1), b.w - 0.2, 0.4, 0.9);
      }
      lights.push({ pos: V(b.cx, b.y1 + 1.2, b.cz), colour: paint === 0x2fb59a ? 0x40ffd0 : 0xff6ad8, power: 2, range: 4 });
      return;
    }
    case 0xeef3f6: { // A capsule pod: a white shell, a round hatch glowing inside.
      span(k, 'plastic', b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, tint, { radius: 0.12, ground: b.y0 });
      for (const [n, c] of [[V(1, 0, 0), V(b.x1, b.cy, b.cz)], [V(-1, 0, 0), V(b.x0, b.cy, b.cz)]] as const) screen(k, 'podGlow', c, n, Math.min(0.7, b.d - 0.3), 0.7, 0.9);
      return;
    }
    case 0x353848: { // Speaker stacks: dark cabinets with LED meters.
      span(k, 'plastic', b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, tint, { radius: 0.02, ground: b.y0 });
      for (const [n, c] of [[V(0, 0, -1), V(b.cx, b.y1 - 0.15, b.z0)], [V(0, 0, 1), V(b.cx, b.y1 - 0.15, b.z1)]] as const) screen(k, 'leds', c, n, b.w - 0.1, 0.08, 1.4);
      return;
    }
    case 0x9eaabb: { // A desk with a glowing monitor.
      span(k, 'plastic', b.x0, b.x1, b.y0, b.y1 - 0.4, b.z0, b.z1, tint, { radius: 0.01, ground: b.y0 });
      span(k, 'plastic', b.cx - 0.25, b.cx + 0.25, b.y1 - 0.4, b.y1 - 0.02, b.cz - 0.04, b.cz + 0.04, 0x1e2126, { radius: 0.01 });
      for (const [n, c] of [[V(0, 0, -1), V(b.cx, b.y1 - 0.2, b.cz - 0.04)], [V(0, 0, 1), V(b.cx, b.y1 - 0.2, b.cz + 0.04)]] as const) screen(k, 'monitor', c, n, 0.46, 0.3, 1.1);
      return;
    }
    default:
      span(k, blk.finish === 'tiles' ? 'nhTiles' : blk.finish === 'plaster' ? 'plaster' : 'cladding', b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, tint, { radius: 0.02, ground: b.y0 });
  }
}

/** The billboard pillar on the avenue (a finished wall 2.4 m tall): an advertising column of lightbox posters. */
function adColumn(k: Kit, b: Bx): City['glows'] {
  span(k, 'paintSteel', b.x0, b.x1, b.y0, b.y0 + 0.25, b.z0, b.z1, 0x2a2e36, { ground: b.y0 });
  span(k, 'paintSteel', b.x0 + 0.02, b.x1 - 0.02, b.y0 + 0.25, b.y1 - 0.15, b.z0 + 0.02, b.z1 - 0.02, 0x1a1c22);
  span(k, 'paintSteel', b.x0, b.x1, b.y1 - 0.15, b.y1, b.z0, b.z1, 0xf4e08c, { radius: 0.03 });
  const ads = ['adZing', 'adAero', 'adFilm', 'adZing'];
  const faces: [THREE.Vector3, THREE.Vector3, number][] = [
    [V(1, 0, 0), V(b.x1 - 0.015, 0, b.cz), b.d - 0.12],
    [V(-1, 0, 0), V(b.x0 + 0.015, 0, b.cz), b.d - 0.12],
    [V(0, 0, 1), V(b.cx, 0, b.z1 - 0.015), b.w - 0.12],
    [V(0, 0, -1), V(b.cx, 0, b.z0 + 0.015), b.w - 0.12],
  ];
  const glows: City['glows'] = [];
  faces.forEach(([n, c, w], i) => {
    const centre = c.clone().setY(b.y0 + 1.2);
    screen(k, ads[i]!, centre, n, w, 1.85, k.p.bloom ? 1.5 : 1.0);
    glows.push({ pos: centre, colour: [0x40ffc8, 0xfff4ea, 0xff8a50, 0x40ffc8][i]!, size: w });
  });
  return glows;
}

// ---------------------------------------------------------------------------------------------------------------- signs

interface Design {
  text?: string;
  icon?: string;
  /** Letters drawn dead (a half-dead sign), and how bright the rest burn (a flickering tube: below 1). */
  dead?: number[];
  dim?: number;
  /** A second line of small text under the first. */
  sub?: string;
  subColour?: number;
  back: 'raceway' | 'panel' | 'bare' | 'box';
  boxCell?: string;
}

/** The map's twelve neon signs (by their world centre), each its own made-up business, its own shape. */
function designFor(s: MapSign): Design {
  const key = `${Math.round(s.centre.x * 10)},${Math.round(s.centre.y * 10)},${Math.round(s.centre.z * 10)}`;
  const table: Record<string, Design> = {
    '-35,24,-22': { text: 'PIXEL PARK', icon: 'star', back: 'raceway' },
    '-35,45,-91': { text: 'CAPSULE', back: 'panel' },
    '-35,25,120': { text: 'REPAIRS', icon: 'wrench', back: 'raceway' },
    '-35,45,135': { icon: 'cross', back: 'box', boxCell: 'clinic' },
    '-35,75,138': { text: 'STUDIO', back: 'panel', dead: [1, 4], dim: 0.55 },
    '40,26,-17': { text: 'BAR', icon: 'glass', sub: 'NOVA', back: 'bare' },
    '40,75,-45': { text: 'KARAOKE', back: 'panel' },
    '-128,25,-100': { text: 'RAMEN', icon: 'bowl', back: 'raceway' },
    '-128,32,-150': { text: 'OPEN', sub: '24H', subColour: 0xffa531, back: 'panel', dead: [2], dim: 0.6 },
    '-102,22,50': { text: 'LUCKY', icon: 'heart', back: 'bare' },
    '125,25,-110': { text: 'ORBIT', icon: 'ring', back: 'raceway' },
    '90,26,100': { text: 'DRONE DOCK', icon: 'drone', back: 'raceway' },
  };
  return table[key] ?? { text: 'OPEN', back: 'raceway' };
}

const FACE: Record<MapSign['facing'], THREE.Vector3> = { '+x': V(1, 0, 0), '-x': V(-1, 0, 0), '+z': V(0, 0, 1), '-z': V(0, 0, -1), '+y': V(0, 1, 0) };

/** Neon tubes along the strokes: glowing glass (or dead glass), joints rounded on Ultra, electrode caps and standoffs. */
function tubes(k: Kit, strokes: [number, number][][], map: (p: [number, number]) => THREE.Vector3, r: number, colour: THREE.Color, lit: boolean, back: THREE.Vector3): void {
  const p = k.p;
  const radial = p.smallParts ? 7 : 4;
  const key = lit ? 'glow' : 'nhTubeOff';
  const tint = lit ? colour : new THREE.Color(colour).multiplyScalar(0.06).lerp(new THREE.Color(0x6a6a74), 0.5);
  for (const st of strokes) {
    if (st.length < 2) continue;
    const pts = st.map(map);
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const d = b.clone().sub(a).normalize();
      // Overlap the segments a little so the corners stay closed without joint spheres on Low.
      rod(k, key, a.clone().addScaledVector(d, -r * 0.6), b.clone().addScaledVector(d, r * 0.6), r, tint, radial, true);
      if (p.smallParts && i > 0) k.add(key, new THREE.SphereGeometry(r, radial, 4), new THREE.Matrix4().makeTranslation(a.x, a.y, a.z), tint, {});
    }
    if (p.smallParts) {
      // Electrode caps where a tube ends and goes back through the panel, and a standoff.
      for (const e of [pts[0]!, pts[pts.length - 1]!]) {
        rod(k, 'dark', e, e.clone().addScaledVector(back, 0.05), r * 1.3, 0x15161a, 6, false);
      }
      const m = pts[Math.floor(pts.length / 2)]!;
      rod(k, 'galv', m.clone().addScaledVector(back, r), m.clone().addScaledVector(back, 0.05), r * 0.35, 0x8a9096, 4, false);
    }
  }
}

function neonSign(k: Kit, s: MapSign, lights: Spot[], glows: City['glows']): void {
  const n = FACE[s.facing];
  const right = new THREE.Vector3().crossVectors(UP, n);
  const c = V(s.centre.x, s.centre.y, s.centre.z);
  const trim = s.height <= 0.12;
  const col = hdr(s.colour, k);
  if (trim) {
    // A neon trim: one long tube on clips, a hair off the wall, its glow washed up the wall.
    const a = c.clone().addScaledVector(right, -s.width / 2).addScaledVector(n, 0.05);
    const b = c.clone().addScaledVector(right, s.width / 2).addScaledVector(n, 0.05);
    rod(k, 'glow', a, b, 0.018, col, k.p.smallParts ? 8 : 4);
    if (k.p.smallParts) for (let t = 0; t <= s.width; t += 0.8) {
      const q = a.clone().addScaledVector(right, t);
      rod(k, 'paintSteel', q.clone().addScaledVector(n, -0.05), q.clone().addScaledVector(n, 0.01), 0.008, 0x2a2e36, 4);
    }
    halo(k, c.clone().addScaledVector(n, 0.02), n, s.width + 0.6, 0.9, s.colour, 0.22);
    for (let t = 0.15; t < 1; t += 0.35) lights.push({ pos: c.clone().addScaledVector(right, (t - 0.5) * s.width).addScaledVector(n, 0.6), colour: s.colour, power: 2.5, range: 6 });
    return;
  }
  const d = designFor(s);
  const vertical = s.height > s.width * 1.6;
  const depth = 0.07;
  // The backing: a raceway bar, a black acrylic panel, or a lightbox.
  const backN = n.clone().negate();
  if (d.back === 'panel' || d.back === 'box') {
    const bw = s.width;
    const bh = s.height;
    const centre = c.clone().addScaledVector(n, depth / 2);
    const m = new THREE.Matrix4().compose(centre, new THREE.Quaternion().setFromUnitVectors(Z, n), V(1, 1, 1));
    k.add('paintSteel', k.boxGeo(bw, bh, depth, 0.02), m, d.back === 'box' ? 0xe8e8e8 : 0x15151c, {});
    if (d.back === 'box' && d.boxCell) screen(k, d.boxCell, c.clone().addScaledVector(n, depth + 0.002), n, bw - 0.08, bh - 0.08, k.p.bloom ? 1.6 : 1.0);
  } else if (d.back === 'raceway') {
    const m = new THREE.Matrix4().compose(c.clone().addScaledVector(n, 0.03).add(V(0, -s.height * 0.12, 0)), new THREE.Quaternion().setFromUnitVectors(Z, n), V(1, 1, 1));
    k.add('paintSteel', k.boxGeo(s.width * 0.92, s.height * 0.22, 0.06, 0.01), m, 0x22252c, {});
  }
  const front = depth + 0.03;
  const toW = (o: THREE.Vector3, sc: number) => (q: [number, number]) => o.clone().addScaledVector(right, q[0] * sc).addScaledVector(UP, q[1] * sc).addScaledVector(n, front);
  const lit = (i: number) => !(d.dead ?? []).includes(i);
  const burn = hdr(s.colour, k, d.dim ?? 1);
  if (vertical && d.text) {
    // Letters stacked down a tall sign, with a border tube round the panel.
    const letters = [...d.text];
    const cell = (s.height - 0.25) / letters.length;
    const sc = Math.min((cell * 0.72) / 6, (s.width * 0.62) / 4.6);
    letters.forEach((ch, i) => {
      const st = strokeText(ch);
      const o = c.clone().addScaledVector(UP, s.height / 2 - 0.12 - cell * (i + 0.5) - 3 * sc).addScaledVector(right, (-st.width * sc) / 2);
      tubes(k, st.strokes, toW(o, sc), Math.max(0.01, sc * 0.32), burn, lit(i), backN);
    });
    const bw = s.width / 2 - 0.06;
    const bh = s.height / 2 - 0.06;
    const ring: [number, number][] = [[-bw, -bh], [bw, -bh], [bw, bh], [-bw, bh], [-bw, -bh]];
    tubes(k, [ring], (q) => c.clone().addScaledVector(right, q[0]).addScaledVector(UP, q[1]).addScaledVector(n, front), 0.012, hdr(s.colour, k, (d.dim ?? 1) * 0.8), true, backN);
  } else {
    // A row: the icon, the text, an optional small second line.
    const iconG = d.icon ? ICONS[d.icon] : undefined;
    const st = d.text ? strokeText(d.text) : { strokes: [], width: 0, letters: [] };
    const gap = iconG && d.text ? 2.2 : 0;
    const wUnits = (iconG?.w ?? 0) + gap + st.width;
    const capH = s.height * (d.sub ? 0.5 : 0.66);
    const sc = Math.min(capH / 6, (s.width * 0.92) / Math.max(1, wUnits));
    const yOff = d.sub ? s.height * 0.12 : 0;
    const o = c.clone().addScaledVector(right, (-wUnits * sc) / 2).addScaledVector(UP, -3 * sc + yOff);
    const r = Math.max(0.009, sc * 0.3);
    if (iconG) tubes(k, iconG.s, toW(o, sc), r, hdr(d.icon === 'cross' ? s.colour : s.colour, k, d.dim ?? 1), true, backN);
    const to = o.clone().addScaledVector(right, ((iconG?.w ?? 0) + gap) * sc);
    st.letters.forEach((ls, i) => tubes(k, ls, toW(to, sc), r, burn, lit(i), backN));
    if (d.sub) {
      const sub = strokeText(d.sub);
      const ssc = sc * 0.55;
      const so = c.clone().addScaledVector(right, (-sub.width * ssc) / 2).addScaledVector(UP, -s.height * 0.42);
      tubes(k, sub.strokes, toW(so, ssc), r * 0.8, hdr(d.subColour ?? s.colour, k, d.dim ?? 1), true, backN);
    }
  }
  // The glow the sign throws on its wall and on the ground below it.
  const strength = (d.dim ?? 1) * (k.p.bloom ? 0.3 : 0.42);
  halo(k, c.clone().addScaledVector(n, 0.015), n, s.width * 1.8 + 0.6, s.height * 1.6 + 0.6, s.colour, strength);
  if (s.centre.y < 5) halo(k, V(c.x, 0.012, c.z).addScaledVector(n, 1.0), UP, s.width + 1.6, 2.4, s.colour, strength * 0.55, Math.abs(n.x) > 0.5 ? Math.PI / 2 : 0);
  lights.push({ pos: c.clone().addScaledVector(n, 0.7), colour: s.colour, power: 7 * (d.dim ?? 1) * Math.min(2, s.width * s.height * 1.5 + 0.4), range: 9 });
  glows.push({ pos: c.clone().addScaledVector(n, 0.1), colour: s.colour, size: Math.max(s.width, s.height) });
}

/** A window on a facade: a frame and sill on the wall, lit glass showing a room, or dark glass reflecting the street. */
function windowSign(k: Kit, s: MapSign, r: () => number, recess: number): void {
  const n = FACE[s.facing];
  const c = V(s.centre.x, s.centre.y, s.centre.z).addScaledVector(n, -recess);
  const q = new THREE.Quaternion().setFromUnitVectors(Z, n);
  const add = (key: string, off: THREE.Vector3, w: number, h: number, d: number, tint: number | THREE.Color) => {
    const right = new THREE.Vector3().crossVectors(UP, n);
    const p = c.clone().addScaledVector(right, off.x).addScaledVector(UP, off.y).addScaledVector(n, off.z);
    k.add(key, k.boxGeo(w, h, d, 0.008), new THREE.Matrix4().compose(p, q, V(1, 1, 1)), tint, {});
  };
  const fw = 0.06;
  add('paintSteel', V(0, s.height / 2 + fw / 2, 0.03), s.width + fw * 2, fw, 0.06, PAL.frame);
  add('paintSteel', V(-s.width / 2 - fw / 2, 0, 0.03), fw, s.height, 0.06, PAL.frame);
  add('paintSteel', V(s.width / 2 + fw / 2, 0, 0.03), fw, s.height, 0.06, PAL.frame);
  add('precast', V(0, -s.height / 2 - 0.04, 0.05), s.width + 0.2, 0.08, 0.1, PAL.sill);
  add('paintSteel', V(0, 0, 0.02), 0.04, s.height, 0.03, PAL.frame);
  if (s.colour !== 0) {
    const glow = new THREE.Color(s.colour).multiplyScalar((k.p.bloom ? 1.25 : 0.95) * (0.75 + r() * 0.45));
    screen(k, `room${Math.floor(r() * 6)}`, c.clone().addScaledVector(n, 0.012), n, s.width, s.height, glow);
  } else {
    add('nhGlass', V(0, 0, 0.012), s.width, s.height, 0.01, 0x1a2030);
  }
}

/** A road marking: worn paint, a zebra stripe or a line, flat on the asphalt. */
function marking(k: Kit, s: MapSign): void {
  const zebra = s.width > 0.4 && s.height > 1.5;
  decal(k, zebra ? 'zebra' : 'paint', V(s.centre.x, 0.006, s.centre.z), UP, s.width, s.height, new THREE.Color(s.colour).multiplyScalar(0.85), 0);
}

// ---------------------------------------------------------------------------------------------------------------- lamps

/** A lamp from the map's light pools: a street lamp on a cable across the street, a pendant in a room, a lantern. */
function lamp(k: Kit, pos: THREE.Vector3, colour: number, radius: number, lights: Spot[]): void {
  const street = colour === 0xbfeeff;
  const room = colour === 0xffd6a0;
  const p = k.p;
  if (street) {
    // Hung on a span cable from wall to wall above the street (no pole in anyone's way).
    const [xa, xb] = pos.x > -4 && pos.x < 4.5 ? [-3.5, 4] : [pos.x - 4, pos.x + 4];
    const zc = pos.z;
    const yTop = 7.4;
    const along = pos.x > -4 && pos.x < 4.5;
    const a = along ? V(xa, yTop, zc) : V(pos.x, yTop, zc - 1.5);
    const b = along ? V(xb, yTop, zc) : V(pos.x, yTop, zc + 1.5);
    if (along) {
      cable(k, a, V(pos.x, pos.y + 0.7, zc), 0.1, 0.012);
      cable(k, V(pos.x, pos.y + 0.7, zc), b, 0.1, 0.012);
    } else rod(k, 'dark', V(pos.x, pos.y + 0.4, zc), V(pos.x, Math.min(9.3, pos.y + 3), zc), 0.01, 0x15161a, 4);
    rod(k, 'dark', V(pos.x, pos.y + 0.7, zc), V(pos.x, pos.y + 0.22, zc), 0.01, 0x15161a, 4);
    k.add('paintSteel', new THREE.CylinderGeometry(0.08, 0.32, 0.2, p.curveSegments, 1, true), new THREE.Matrix4().makeTranslation(pos.x, pos.y + 0.12, zc), 0x2a3038, {});
    // The diffuser, recessed in the shade (round even on Low, so it never reads as a polygon overhead).
    k.add('glow', new THREE.CylinderGeometry(0.24, 0.24, 0.02, Math.max(24, p.curveSegments)), new THREE.Matrix4().makeTranslation(pos.x, pos.y + 0.05, zc), hdr(colour, k, 0.85), {});
    halo(k, V(pos.x, pos.y - 0.02, zc), V(0, -1, 0), 1.4, 1.4, colour, 0.35);
  } else if (room) {
    rod(k, 'dark', pos.clone().add(V(0, 0.42, 0)), pos.clone().add(V(0, 0.12, 0)), 0.006, 0x15161a, 4);
    k.add('paintSteel', new THREE.ConeGeometry(0.2, 0.18, p.curveSegments, 1, true), new THREE.Matrix4().makeTranslation(pos.x, pos.y + 0.06, pos.z), 0x2a2e38, {});
    k.add('glow', new THREE.SphereGeometry(0.06, 10, 6), new THREE.Matrix4().makeTranslation(pos.x, pos.y - 0.0, pos.z), hdr(colour, k, 1.2), {});
  } else {
    // A cluster of glowing paper lanterns on a cable.
    const n = 3;
    for (let i = 0; i < n; i++) {
      const l = pos.clone().add(V((i - 1) * 0.5, -Math.abs(i - 1) * 0.08, 0));
      k.add('glow', new THREE.SphereGeometry(0.15, p.smallParts ? 14 : 8, p.smallParts ? 10 : 6).scale(1, 1.3, 1), new THREE.Matrix4().makeTranslation(l.x, l.y, l.z), hdr(colour, k, 0.75), {});
      if (p.smallParts) for (const dy of [0.2, -0.2]) k.add('dark', new THREE.CylinderGeometry(0.08, 0.08, 0.03, 10), new THREE.Matrix4().makeTranslation(l.x, l.y + dy, l.z), 0x1a1214, {});
      halo(k, l, V(0, 0, 1), 0.9, 0.9, colour, 0.35);
      halo(k, l, V(1, 0, 0), 0.9, 0.9, colour, 0.35);
    }
    cable(k, pos.clone().add(V(-1.6, 0.5, 0)), pos.clone().add(V(1.6, 0.5, 0)), 0.15, 0.008);
  }
  // A pool of light on the floor under it (the game's light pool).
  const floorY = pos.y > 6 ? 6.01 : pos.y > 3 && !street && room ? 3.01 : 0.013;
  halo(k, V(pos.x, floorY, pos.z), UP, radius * 1.6, radius * 1.6, colour, street ? 0.3 : 0.22);
  lights.push({ pos: pos.clone().add(V(0, -0.15, 0)), colour, power: street ? 16 : room ? 5 : 6, range: radius * 3.2 });
}

// ---------------------------------------------------------------------------------------------------------------- puddles

/** Puddles where the road and paving dip: irregular water (screen-space reflections on Ultra). */
function puddles(k: Kit, r: () => number): void {
  const spots: [number, number, number, number][] = [
    // In the gutters along both kerbs, and in dips on the crown.
    [-1.55, 9.2, 0.8, 3.2],
    [-1.6, -10.5, 0.7, 2.6],
    [2.05, 3.6, 0.8, 2.8],
    [2.1, -2.2, 0.7, 2.2],
    [0.4, 12.2, 1.6, 1.0],
    [0.9, -0.4, 1.3, 0.8],
    [1.1, -12.4, 1.8, 1.1],
    [-0.4, 5.4, 1.0, 0.7],
    // On the paving: Noodle Alley, the Back Alley, Lantern Lane, the yards.
    [-8.2, -12.4, 1.6, 1.0],
    [-11.2, -11.1, 0.9, 0.7],
    [-5.7, -11.45, 1.7, 0.95],
    [10.8, -13.5, 1.8, 1.1],
    [14.2, -12.1, 1.0, 0.7],
    [-9.5, 3.4, 1.4, 0.8],
    [-20.3, 4.3, 1.5, 1.0],
    [20.5, -6.8, 1.6, 1.0],
    [13.4, 12.6, 1.6, 1.0],
  ];
  for (const [x, z, w, d] of spots) {
    const shape = new THREE.Shape();
    const n = k.p.smallParts ? 48 : 18;
    const seed = r() * 10;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      // A soft, lobed outline (a few low harmonics), as water settles in a shallow dip.
      const rr = 0.8 + Math.sin(a * 2 + seed) * 0.11 + Math.sin(a * 3 + seed * 1.7) * 0.08 + Math.sin(a * 5 + seed * 2.3) * 0.04;
      const px = Math.cos(a) * rr * (w / 2);
      const pz = Math.sin(a) * rr * (d / 2);
      if (i === 0) shape.moveTo(px, pz);
      else shape.lineTo(px, pz);
    }
    const onRoad = x > AREA.road[0] && x < AREA.road[1];
    // Laid flat facing up (a shape faces +z; a quarter turn back about x turns that to +y).
    const g = new THREE.ShapeGeometry(shape, 1).rotateX(-Math.PI / 2);
    k.add('nhWater', g, new THREE.Matrix4().makeTranslation(x, onRoad ? 0.011 : 0.006, z), onRoad ? 0x16161c : 0x1c1c22, { worldUv: false });
  }
}

// ---------------------------------------------------------------------------------------------------------------- build

/** Adds the whole map, dressed, to `k`; returns the lights and glows for the shot to use. */
export function buildCity(k: Kit): City {
  const lights: Spot[] = [];
  const glows: City['glows'] = [];
  const r = rng(7);
  const signs = NEON_HEIGHTS.signs ?? [];
  const windows = signs.filter((s) => s.kind === 'window');
  let cab = 0;
  let stallN = 0;
  let boothN = 0;
  for (const blk of NEON_HEIGHTS.blocks) {
    const b = bx(blk);
    switch (blk.kind) {
      case 'wall':
        if (isPerimeter(b)) {
          const alongX = b.w > b.d;
          const face = alongX ? (b.cz < 0 ? b.z1 : b.z0) : b.cx < 0 ? b.x1 : b.x0;
          perimeter(k, blk, b, windows.filter((w) => (alongX ? Math.abs(w.centre.z - face) < 0.05 : Math.abs(w.centre.x - face) < 0.05)), r);
        } else if (blk.finish === 'plaster' && blk.paint === 0xf4e08c && b.h < 2.5 && b.y0 < 0.01 && b.w > 1) glows.push(...adColumn(k, b));
        else wall(k, blk, b);
        break;
      case 'floor':
        floor(k, blk, b);
        break;
      case 'ramp':
        stair(k, blk, b);
        break;
      case 'barrier':
        rail(k, b);
        break;
      case 'cabinet':
        cabinets(k, b, cab++);
        break;
      case 'vending':
        glows.push(...vending(k, b, Math.round(Math.abs(b.cx) + Math.abs(b.cz))));
        break;
      case 'stall':
        stall(k, b, stallN++, lights);
        break;
      case 'planter':
        planter(k, b, r);
        break;
      case 'booth':
        glows.push(...booth(k, b, boothN++, lights));
        break;
      case 'van':
        glows.push(...van(k, b));
        break;
      case 'wrapped':
        if (blk.finish) furniture(k, blk, b, lights);
        else parcels(k, b, r);
        break;
      case 'rack':
        if (blk.finish) furniture(k, blk, b, lights);
        else rack(k, b, r);
        break;
      case 'skip':
        skip(k, b, r);
        break;
      case 'crate':
        if (blk.finish) furniture(k, blk, b, lights);
        else {
          // A stack of grey drone cases.
          span(k, 'plastic', b.x0, b.x1, b.y0, b.y0 + 0.58, b.z0, b.z1, 0x4a4f58, { radius: 0.04, ground: b.y0 });
          span(k, 'plastic', b.x0 + 0.04, b.x1 - 0.04, b.y0 + 0.6, b.y1, b.z0 + 0.04, b.z1 - 0.04, 0x3a6ad8, { radius: 0.04 });
          decal(k, 'stickers', V(b.cx, b.y0 + 0.3, b.z1), V(0, 0, 1), 0.5, 0.25, 0xffffff);
        }
        break;
      default:
        span(k, 'plaster', b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, 0xcccccc, { ground: b.y0 });
    }
  }
  for (const d of NEON_HEIGHTS.decor ?? []) floor(k, d, bx(d));
  for (const s of signs) {
    if (s.kind === 'neon') neonSign(k, s, lights, glows);
    else if (s.kind === 'window') windowSign(k, s, r, 0.08);
    else marking(k, s);
  }
  for (const l of NEON_HEIGHTS.lights ?? []) lamp(k, V(l.position.x, l.position.y, l.position.z), l.colour, l.radius, lights);
  puddles(k, r);
  return { lights, glows };
}

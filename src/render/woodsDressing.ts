import * as THREE from 'three';
import { DRESSING, type FallenKind, WOODS } from '../config/dressing';
import { onPatch } from '../map/groundSurfaces';
import type { MapBlock, MapData } from '../map/mapTypes';
import { type Terrain, terrainHeightAt } from '../map/terrain';
import { createRng, rngNext, type RngState } from '../sim/rng';
import { boxHitsBlock, type ClearSpot, clearOfPlay, clearSpots, frontRect, junkRect } from './dressingSpots';

/**
 * A wooded map's floor (G9, MapDressing.woods): drifts of leaf litter round the feet of trunks, logs, boulders and the
 * fence, and fallen branches, twigs and short logs against their faces, all on the terrain. Pure and seeded; the
 * geometry (woodsGeometries) joins the junk mesh (render/dressingMeshes.ts): no draw call of its own. Look only. The
 * fallen pieces keep G8's rules for loose junk (DRESSING.junk): no taller than `maxHeight`, against a face, on the
 * ground and under nothing, `openFront` of open ground in front, clear of every lane, spawn, dead zone, the flag and the
 * Extraction spots, `gap` from each other; and here also out of every bush, off the cabin's boards and never floating.
 */

const W = WOODS;
const J = DRESSING.junk;

/** A fallen piece on the ground against a face: like a JunkPiece, tilted to the ground (its up is the terrain's normal). */
export interface FallenPiece {
  kind: FallenKind;
  x: number;
  y: number;
  z: number;
  axis: 0 | 2;
  sign: 1 | -1;
  along: number;
  out: number;
  height: number;
  variant: number;
  /** The ground's normal under its middle (unit). */
  normal: readonly [number, number, number];
}

/** A drift of leaf litter: its middle on the ground and its own seed (the leaves are drawn from it). */
export interface LeafDrift {
  x: number;
  z: number;
  seed: number;
}

/** The kinds of block a wood's floor gathers at: trunks, logs, boulders and the fence. */
const GATHERS = new Set<MapBlock['kind']>(['tree', 'log', 'boulder', 'fence']);

/** The terrain's normal at (x, z) (unit, into `out`), from its heights `e` m either side. */
function normalAt(t: Terrain, x: number, z: number, out: [number, number, number]): [number, number, number] {
  const e = 0.35;
  const h = (px: number, pz: number): number => terrainHeightAt(t, px, pz) ?? 0;
  const dx = (h(x + e, z) - h(x - e, z)) / (2 * e);
  const dz = (h(x, z + e) - h(x, z - e)) / (2 * e);
  const len = Math.hypot(dx, 1, dz);
  out[0] = -dx / len;
  out[1] = 1 / len;
  out[2] = -dz / len;
  return out;
}

const tilt = new THREE.Quaternion();
const yaw = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
const n = new THREE.Vector3();
const p = new THREE.Vector3();
const place = new THREE.Matrix4();
const unit = new THREE.Vector3(1, 1, 1);

/** The yaw that turns a piece's own +z (out from the face) to its face's outward normal (as for junk). */
const yawOf = (q: Pick<FallenPiece, 'axis' | 'sign'>): number => (q.axis === 2 ? (q.sign > 0 ? 0 : Math.PI) : q.sign > 0 ? Math.PI / 2 : -Math.PI / 2);

/** A piece's frame in the world: its footprint's middle at (x, y, z), turned to its face and tilted to the ground. */
export function fallenMatrix(q: FallenPiece, out: THREE.Matrix4 = place): THREE.Matrix4 {
  tilt.setFromUnitVectors(up, n.set(q.normal[0], q.normal[1], q.normal[2]));
  yaw.setFromAxisAngle(up, yawOf(q));
  return out.compose(p.set(q.x, q.y, q.z), tilt.multiply(yaw), unit);
}

/** The world corners of a piece's footprint (its own y = 0): the tests check none floats. */
export function fallenCorners(q: FallenPiece): THREE.Vector3[] {
  const m = fallenMatrix(q, new THREE.Matrix4());
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => new THREE.Vector3((a! * q.along) / 2, 0, (b! * q.out) / 2).applyMatrix4(m));
}

/** A fallen kind by WOODS.fallen.weights from `u` in [0, 1). */
function pickFallen(u: number): FallenKind {
  const kinds = Object.keys(W.fallen.weights) as FallenKind[];
  let pick = u * kinds.reduce((s, k) => s + W.fallen.weights[k], 0);
  for (const k of kinds) {
    pick -= W.fallen.weights[k];
    if (pick < 0) return k;
  }
  return kinds[kinds.length - 1]!;
}

/** Whether (x, z) is on a patch of boards (the cabin's floor: no woods' floor indoors). */
const onBoards = (map: MapData, x: number, z: number): boolean => (map.ground?.patches ?? []).some((g) => g.surface === 'wood' && onPatch(g, x, z));

/** The fallen branches, twigs and logs, and the leaf drifts, a wooded map's dressing asks for (none without terrain). */
export function placeWoods(map: MapData, woods: { leaves: number; fallen: number }, seed: number): { fallen: FallenPiece[]; leaves: LeafDrift[] } {
  const t = map.terrain;
  if (!t) return { fallen: [], leaves: [] };
  const rng = createRng(seed * 7 + 11);
  const spots = clearSpots(map);
  const fallen = placeFallen(map, t, woods.fallen, rng, spots);
  const leaves = placeLeaves(map, t, woods.leaves, rng, fallen);
  return { fallen, leaves };
}

function placeFallen(map: MapData, t: Terrain, chance: number, rng: RngState, spots: readonly ClearSpot[]): FallenPiece[] {
  const F = W.fallen;
  const out: FallenPiece[] = [];
  const normal: [number, number, number] = [0, 1, 0];
  for (const b of map.blocks) {
    if (!GATHERS.has(b.kind) || b.size.y < F.minHeight) continue;
    for (const axis of [0, 2] as const) {
      const alongAxis: 0 | 2 = axis === 0 ? 2 : 0;
      const half = (a: 0 | 2): number => (a === 0 ? b.size.x : b.size.z) / 2;
      const at = (a: 0 | 2): number => (a === 0 ? b.center.x : b.center.z);
      const length = 2 * half(alongAxis) - 2 * F.cornerClear;
      const slots = Math.max(1, Math.floor(length / F.step));
      const slot = Math.max(0, length) / slots;
      for (const sign of [1, -1] as const) {
        const face = at(axis) + sign * half(axis);
        for (let i = 0; i < slots; i++) {
          // Four draws a slot, whatever happens, so one slot's outcome never shifts the next one's.
          const [u, uKind, uVariant, uShift] = [rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng)];
          if (u >= chance || out.length >= J.max) continue;
          const kind = pickFallen(uKind);
          const [full, depth, height] = F.size[kind];
          const mid = at(alongAxis) - half(alongAxis) + F.cornerClear + (i + 0.5) * slot;
          let along: number = full;
          let centreAlong = mid + (uShift - 0.5) * Math.max(0, slot - along);
          if (b.kind === 'log') {
            // Beside a lying log: trimmed to the log's length (less `endClear` at each end) and kept within it, so no
            // branch overhangs the end of a short log; too short a stub is left out. (A branch at a trunk's foot may
            // reach past the trunk: it lies on the ground beside it.)
            const end = half(alongAxis) - F.endClear;
            along = Math.min(full, 2 * end);
            if (along < F.minLength) continue;
            centreAlong = Math.min(Math.max(centreAlong, at(alongAxis) - end + along / 2), at(alongAxis) + end - along / 2);
          }
          const centreOut = face + sign * (J.standoff + depth / 2);
          const x = axis === 0 ? centreOut : centreAlong;
          const z = axis === 0 ? centreAlong : centreOut;
          const ground = terrainHeightAt(t, x, z);
          if (ground === undefined) continue;
          normalAt(t, x, z, normal);
          const q: FallenPiece = { kind, x, y: ground - F.sink, z, axis, sign, along, out: depth, height, variant: uVariant, normal: [normal[0], normal[1], normal[2]] };
          if (fallenFits(map, t, q, spots, out)) out.push(q);
        }
      }
    }
  }
  return out;
}

/** Whether a fallen piece may lie where it is (the rules in this module's header). */
export function fallenFits(map: MapData, t: Terrain, q: FallenPiece, spots: readonly ClearSpot[], placed: readonly FallenPiece[]): boolean {
  const r = junkRect(q);
  // On the ground everywhere under it, lying on it: no corner more than 2 cm over it nor buried more than 8 cm.
  for (const c of fallenCorners(q)) {
    const g = terrainHeightAt(t, c.x, c.z);
    if (g === undefined || c.y - g > 0.02 || g - c.y > 0.08) return false;
  }
  if (onBoards(map, q.x, q.z)) return false;
  // Nothing standing in it or over it, and `openFront` of open ground in front of it up to head height.
  if (boxHitsBlock(map.blocks, r, q.y - 1, Infinity)) return false;
  if (boxHitsBlock(map.blocks, frontRect(q), q.y + 0.02, q.y + 2)) return false;
  if (!clearOfPlay(map, r, spots)) return false;
  // Out of every bush (it would only poke through it), apart from the other pieces and out of their fronts.
  const reach = Math.hypot(r[1] - r[0], r[3] - r[2]) / 2;
  if ((map.foliage ?? []).some((b) => Math.hypot(b.x - q.x, b.z - q.z) < b.radius + reach + W.leaves.bushClear)) return false;
  const front = frontRect(q);
  return placed.every((o) => {
    const s = junkRect(o);
    const apart = Math.max(s[0] - r[1], r[0] - s[1], s[2] - r[3], r[2] - s[3]) >= J.gap;
    const of = frontRect(o);
    const inFront = (a: readonly number[], b: readonly number[]): boolean => a[0]! < b[1]! && b[0]! < a[1]! && a[2]! < b[3]! && b[2]! < a[3]!;
    return apart && !inFront(front, s) && !inFront(of, r);
  });
}

/** Leaf drifts: ground in squares, each near a foot maybe a drift, never on boards, in a bush or on a fallen piece. */
function placeLeaves(map: MapData, t: Terrain, chance: number, rng: RngState, fallen: readonly FallenPiece[]): LeafDrift[] {
  const L = W.leaves;
  const out: LeafDrift[] = [];
  const feet = map.blocks.filter((b) => GATHERS.has(b.kind));
  const x0 = t.minX;
  const z0 = t.minZ;
  const cols = Math.floor((t.cols * t.cell) / L.cell);
  const rows = Math.floor((t.rows * t.cell) / L.cell);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const [u, ux, uz, uSeed] = [rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng)];
      if (u >= chance) continue;
      const x = x0 + (i + 0.15 + ux * 0.7) * L.cell;
      const z = z0 + (j + 0.15 + uz * 0.7) * L.cell;
      const near = feet.some((b) => Math.max(Math.abs(x - b.center.x) - b.size.x / 2, Math.abs(z - b.center.z) - b.size.z / 2) < L.near);
      if (!near || onBoards(map, x, z)) continue;
      if ((map.foliage ?? []).some((b) => Math.hypot(b.x - x, b.z - z) < b.radius + L.bushClear)) continue;
      if (fallen.some((q) => Math.hypot(q.x - x, q.z - z) < L.radius)) continue;
      out.push({ x, z, seed: Math.floor(uSeed * 1e9) });
    }
  }
  return out;
}

// --- Geometry --------------------------------------------------------------------------------------------------------

const pick = <T>(list: readonly T[], u: number): T => list[Math.floor(u * list.length) % list.length]!;

/** A round lying along x from `a` to `b` (own frame: x along the face, z out, y up), `r` thick, open or capped. */
function stick(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, sides: number, capped: boolean): THREE.BufferGeometry {
  const from = new THREE.Vector3(ax, ay, az);
  const to = new THREE.Vector3(bx, by, bz);
  const len = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r, r * 1.12, len, sides, 1, !capped);
  // The cylinder runs along y: turn y onto the stick's direction and move its middle onto the stick's.
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, to.clone().sub(from).normalize()));
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return g;
}

/**
 * A fallen piece's parts in its own frame (x along the face, z out from it, y up from the ground, its footprint centred
 * on the origin), each inside `along` × `out` × `height` (the tests check the bounds), with their sRGB colours.
 */
export function fallenParts(q: Pick<FallenPiece, 'kind' | 'variant' | 'along'>): { geo: THREE.BufferGeometry; hex: string }[] {
  const F = W.fallen;
  // A piece trimmed to a short slot is its kind's parts drawn shorter along their length (render/woodsDressing placeFallen).
  const trim = Math.min(1, q.along / F.size[q.kind][0]);
  return fallenPartsFull(q).map((p) => (trim < 1 ? { geo: p.geo.scale(trim, 1, 1), hex: p.hex } : p));
}

/** A fallen kind's parts at its full length (WOODS.fallen.size), in its own frame. */
function fallenPartsFull(q: Pick<FallenPiece, 'kind' | 'variant'>): { geo: THREE.BufferGeometry; hex: string }[] {
  const F = W.fallen;
  const v = q.variant;
  const S = F.sides;
  const bark = (k: number): string => pick(F.bark, v + k * 0.29);
  switch (q.kind) {
    case 'branch': {
      const r = 0.042 + v * 0.012;
      return [
        { geo: stick(-0.57, r, -0.06, 0.57, r, 0.07, r, S, false), hex: bark(0) },
        { geo: stick(-0.1, 0.022, -0.01, 0.22, 0.022, -0.17, 0.02, 4, false), hex: bark(1) },
        { geo: stick(0.28, 0.02, 0.04, 0.52, 0.02, 0.18, 0.018, 4, false), hex: bark(2) },
        { geo: stick(-0.4, 0.018, -0.04, -0.58, 0.018, 0.16, 0.016, 4, false), hex: bark(1) },
      ];
    }
    case 'twigs':
      return [0, 1, 2, 3, 4].map((i) => {
        const a = (i - 2) * 0.33 + (v - 0.5) * 0.5;
        const len = 0.22 + ((v * 7 + i * 0.37) % 1) * 0.02;
        const r = 0.012 + (i % 2) * 0.004;
        const y = r + (i % 2) * 0.024;
        const cx = (i - 2) * 0.03;
        const cz = ((i * 0.31) % 1) * 0.12 - 0.06;
        return { geo: stick(cx - Math.cos(a) * len, y, cz - Math.sin(a) * len * 0.35, cx + Math.cos(a) * len, y, cz + Math.sin(a) * len * 0.35, r, 4, false), hex: bark(i) };
      });
    case 'log': {
      const r = 0.12;
      const half = 0.46;
      const end = (x: number, s: number): THREE.BufferGeometry => new THREE.CircleGeometry(r * (s > 0 ? 1 : 1.12), 8).rotateY((s * Math.PI) / 2).translate(x, r, 0);
      return [
        { geo: stick(-half, r, 0, half, r, 0, r, 8, false), hex: bark(0) },
        { geo: end(half + 0.001, 1), hex: F.grain },
        { geo: end(-half - 0.001, -1), hex: F.grain },
        { geo: stick(0.1, r + 0.06, 0.02, 0.3, r + 0.1, 0.12, 0.025, 4, false), hex: bark(1) },
      ];
    }
  }
}

/** The leaves of a drift, lying on the ground (`groundAt`): each a thin diamond, two triangles, painted its colour. */
function leafGeometry(d: LeafDrift, groundAt: (x: number, z: number) => number, pos: number[], col: number[]): void {
  const L = W.leaves;
  const rng = createRng(d.seed);
  const count = L.count[0] + Math.floor(rngNext(rng) * (L.count[1] - L.count[0] + 1));
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = rngNext(rng) * Math.PI * 2;
    const dist = Math.sqrt(rngNext(rng)) * L.radius;
    const x = d.x + Math.cos(a) * dist;
    const z = d.z + Math.sin(a) * dist;
    const turn = rngNext(rng) * Math.PI;
    const len = L.size[0] + rngNext(rng) * (L.size[1] - L.size[0]);
    c.setStyle(pick(L.colours, rngNext(rng)));
    const k = 0.85 + rngNext(rng) * 0.3;
    const ex = Math.cos(turn) * (len / 2);
    const ez = Math.sin(turn) * (len / 2);
    const wx = -ez * 0.42;
    const wz = ex * 0.42;
    // Tip, side, tail, other side: each corner on the ground under it, lifted a little (a slight curl at the tip).
    const corners: [number, number, number][] = [
      [x + ex, L.lift * 1.6, z + ez],
      [x + wx, L.lift, z + wz],
      [x - ex, L.lift, z - ez],
      [x - wx, L.lift, z - wz],
    ];
    // Counter-clockwise seen from above (the junk material draws front faces only).
    for (const tri of [
      [0, 2, 1],
      [0, 3, 2],
    ]) {
      for (const k3 of tri) {
        const [px, lift, pz] = corners[k3!]!;
        pos.push(px, groundAt(px, pz) + lift, pz);
        col.push(c.r * k, c.g * k, c.b * k);
      }
    }
  }
}

/**
 * Every fallen piece's parts in the world (painted, via `paint`, as the junk's are) and the leaf drifts as one more
 * geometry, lying on the terrain.
 */
export function woodsGeometries(
  layout: { fallen: readonly FallenPiece[]; leaves: readonly LeafDrift[] },
  terrain: Terrain | undefined,
  paint: (geo: THREE.BufferGeometry, hex: string | number, m: THREE.Matrix4) => THREE.BufferGeometry,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const q of layout.fallen) {
    const m = fallenMatrix(q);
    for (const { geo, hex } of fallenParts(q)) out.push(paint(geo, hex, m));
  }
  if (terrain && layout.leaves.length > 0) {
    const pos: number[] = [];
    const col: number[] = [];
    const groundAt = (x: number, z: number): number => terrainHeightAt(terrain, x, z) ?? 0;
    for (const d of layout.leaves) leafGeometry(d, groundAt, pos, col);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const leaves = paint(g, 0xffffff, new THREE.Matrix4());
    // Each leaf keeps its own colour (paint gave them all white).
    (leaves.getAttribute('color') as THREE.BufferAttribute).copyArray(new Float32Array(col));
    out.push(leaves);
  }
  return out;
}

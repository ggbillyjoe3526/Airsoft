import * as THREE from 'three';
import { GROUND_LOOK, NATURE_SHAPES, SURFACES } from '../config/render';
import type { BlockKind, MapBlock, MapData } from '../map/mapTypes';
import { createRng, rngNext } from '../sim/rng';
import type { Buffers, VertexShade } from './cuboidMesh';

/**
 * The woods' shapes (M33i): a `tree` block drawn as a trunk, a `log` block as rounds or courses of logs, a `boulder` as a
 * faceted stone, each written into the map's merged buffers (render/mapMeshes.ts), so a kind costs no draw call of its
 * own. Every vertex stays inside the block's box, and no point of the box is more than NATURE_SHAPES.maxGap from the
 * shape: what you see is what stops you and your BBs, to within 8 cm. The same on every preset.
 */

/** The block kinds drawn here rather than as boxes. */
export type NatureKind = Extract<BlockKind, 'tree' | 'log' | 'boulder'>;

export function isNatureKind(kind: BlockKind): kind is NatureKind {
  return kind === 'tree' || kind === 'log' || kind === 'boulder';
}

/** How a shape is painted: metres a texture repeat covers, its colour, and the ground under it for the grime band. */
export interface NaturePaint {
  worldSize: number;
  color: THREE.Color;
  /** Height of the ground at its foot: sides darken from here up over SURFACES.grimeHeight. Null: no grime. */
  grimeFrom: number | null;
}

/** The share of an octagon's smaller half-extent always left as a flat side. */
const OCTAGON_FLAT = 0.1;
/** An octagon's +b and -b sides (see octagon()), as `prism` hidden-side bits. */
const OCTAGON_TOP = 1 << 2;
const OCTAGON_BOTTOM = 1 << 6;

const vertexColour = new THREE.Color();
const endColour = new THREE.Color();
const mossColour = new THREE.Color();

/** A fixed hash of a number triple to 0..1 (shapes look the same every load). */
function hash01(a: number, b: number, c: number): number {
  const h = Math.imul(Math.round(a * 1000) ^ Math.imul(Math.round(b * 1000), 19349663) ^ Math.imul(Math.round(c * 1000), 83492791), 0x5bd1e995) >>> 0;
  return (Math.imul(h ^ (h >>> 15), 2654435761) >>> 0) / 4294967296;
}

/** The grime band's darkening at height `y` on a side (1 above it). */
function grime(paint: NaturePaint, y: number): number {
  if (paint.grimeFrom === null) return 1;
  const t = (y - paint.grimeFrom) / SURFACES.grimeHeight;
  return t >= 1 ? 1 : SURFACES.grimeShade + (1 - SURFACES.grimeShade) * Math.max(0, t);
}

/** Pushes one vertex: position, normal, UV and colour (`colour` times `k`). */
function push(buf: Buffers, x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, colour: THREE.Color, k: number): void {
  buf.positions.push(x, y, z);
  buf.normals.push(nx, ny, nz);
  buf.uvs.push(u, v);
  buf.colors.push(colour.r * k, colour.g * k, colour.b * k);
}

/**
 * An octagon of half-extents `ha` × `hb` with its corners cut `c` along each side, counter-clockwise from the +a side's
 * lower end: [a, b] pairs. The cut stays a little short of the smaller half-extent (OCTAGON_FLAT of it is left flat), so
 * a thin course never folds into a zero-width side (degenerate triangles).
 */
export function octagon(ha: number, hb: number, c: number): number[] {
  const k = Math.min(c, (1 - OCTAGON_FLAT) * Math.min(ha, hb));
  return [ha, -hb + k, ha, hb - k, ha - k, hb, -ha + k, hb, -ha, hb - k, -ha, -hb + k, -ha + k, -hb, ha - k, -hb];
}

/** The largest corner cut whose corners stay within `gap` of the box's corner (the cut line is c / √2 from it). */
export function chamferFor(gap: number, wanted: number): number {
  return Math.min(wanted, gap * Math.SQRT2);
}

/**
 * A prism along unit axis `axis` from `s0` to `s1` (world coordinates along it, through `origin`), its cross-section
 * `profile` (octagon pairs, in the plane of unit vectors `ea`, `eb`), cut into rings at `rows` (along the axis), with
 * normals pointing out from the axis as if it were round (scaled by the half-extents `ha`, `hb`), and optionally capped
 * at each end in `capColour`. UVs: u round the profile, v along the axis, so grain runs along a trunk or a log. Sides
 * whose bit is set in `hidden` (side i runs from profile point i to i + 1) are left out: faces pressed flat against a
 * neighbour (a course's top on the next one's bottom) that nobody can see.
 */
function prism(
  buf: Buffers,
  origin: THREE.Vector3,
  axis: THREE.Vector3,
  ea: THREE.Vector3,
  eb: THREE.Vector3,
  profile: readonly number[],
  ha: number,
  hb: number,
  rows: readonly number[],
  paint: NaturePaint,
  colourK: number,
  shade: VertexShade | null,
  capColour: THREE.Color | null,
  hidden = 0,
): void {
  const n = profile.length / 2;
  // Perimeter distances for u, closing the ring with a duplicated first vertex (the texture's seam).
  const around: number[] = [0];
  for (let i = 1; i <= n; i++) {
    const a0 = profile[((i - 1) % n) * 2]!;
    const b0 = profile[((i - 1) % n) * 2 + 1]!;
    const a1 = profile[(i % n) * 2]!;
    const b1 = profile[(i % n) * 2 + 1]!;
    around.push(around[i - 1]! + Math.hypot(a1 - a0, b1 - b0));
  }
  const base = buf.positions.length / 3;
  for (const s of rows) {
    for (let i = 0; i <= n; i++) {
      const a = profile[(i % n) * 2]!;
      const b = profile[(i % n) * 2 + 1]!;
      const x = origin.x + axis.x * s + ea.x * a + eb.x * b;
      const y = origin.y + axis.y * s + ea.y * a + eb.y * b;
      const z = origin.z + axis.z * s + ea.z * a + eb.z * b;
      let na = a / (ha * ha);
      let nb = b / (hb * hb);
      const len = Math.hypot(na, nb) || 1;
      na /= len;
      nb /= len;
      const nx = ea.x * na + eb.x * nb;
      const ny = ea.y * na + eb.y * nb;
      const nz = ea.z * na + eb.z * nb;
      const k = colourK * (ny < 0.9 ? grime(paint, y) : 1) * (shade ? shade(x, y, z, nx, ny, nz) : 1);
      push(buf, x, y, z, nx, ny, nz, around[i]! / paint.worldSize, s / paint.worldSize, paint.color, k);
    }
  }
  const ring = n + 1;
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let i = 0; i < n; i++) {
      if (hidden & (1 << i)) continue;
      const p = base + r * ring + i;
      // Counter-clockwise seen from outside: the profile runs counter-clockwise about the axis (ea × eb = axis).
      buf.indices.push(p, p + 1, p + ring + 1, p, p + ring + 1, p + ring);
    }
  }
  if (!capColour) return;
  for (const [s, sign] of [
    [rows[0]!, -1],
    [rows[rows.length - 1]!, 1],
  ] as const) {
    const first = buf.positions.length / 3;
    for (let i = 0; i < n; i++) {
      const a = profile[i * 2]!;
      const b = profile[i * 2 + 1]!;
      const x = origin.x + axis.x * s + ea.x * a + eb.x * b;
      const y = origin.y + axis.y * s + ea.y * a + eb.y * b;
      const z = origin.z + axis.z * s + ea.z * a + eb.z * b;
      const nx = axis.x * sign;
      const ny = axis.y * sign;
      const nz = axis.z * sign;
      const k = shade ? shade(x, y, z, nx, ny, nz) : 1;
      push(buf, x, y, z, nx, ny, nz, a / paint.worldSize, b / paint.worldSize, capColour, k);
    }
    for (let i = 1; i + 1 < n; i++) {
      if (sign > 0) buf.indices.push(first, first + i, first + i + 1);
      else buf.indices.push(first, first + i + 1, first + i);
    }
  }
}

const origin = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const NEG_Z = new THREE.Vector3(0, 0, -1);

/** A trunk: an eight-sided post the block's height, a ring at the top of the grime band, no cap (its crown hides it). */
function appendTrunk(buf: Buffers, block: MapBlock, paint: NaturePaint, shade: VertexShade | null): void {
  const { center: c, size } = block;
  const ha = size.x / 2;
  const hb = size.z / 2;
  const y0 = c.y - size.y / 2;
  const y1 = c.y + size.y / 2;
  const profile = octagon(ha, hb, chamferFor(NATURE_SHAPES.maxGap, NATURE_SHAPES.trunk.chamfer));
  const rows = [y0];
  if (paint.grimeFrom !== null && paint.grimeFrom + SURFACES.grimeHeight < y1) rows.push(Math.max(y0, paint.grimeFrom + SURFACES.grimeHeight));
  rows.push(y1);
  // Profile in (x, z) about the vertical: ea = x, eb = -z keeps it counter-clockwise seen from above (ea × eb = up).
  prism(buf, origin.set(c.x, 0, c.z), UP, X, NEG_Z, profile, ha, hb, rows, paint, 1, shade, null);
}

/**
 * The heights a log block is cut at, bottom to top. Tall blocks and thin ones (walls) are courses about `course` high,
 * level with the world's (adjacent walls meet course to course), a sliver at either end merged into its neighbour; low,
 * thick blocks are `rounds` equal rounds. Exported for the tests.
 */
export function logCourses(block: MapBlock): number[] {
  const L = NATURE_SHAPES.log;
  const y0 = block.center.y - block.size.y / 2;
  const y1 = block.center.y + block.size.y / 2;
  const across = Math.min(block.size.x, block.size.z);
  if (block.size.y <= L.crouchMax && across >= L.roundFrom) return Array.from({ length: L.rounds + 1 }, (_, k) => y0 + (k * (y1 - y0)) / L.rounds);
  const ys = [y0];
  for (let k = Math.floor(y0 / L.course) + 1; k * L.course < y1 - 1e-6; k++) ys.push(k * L.course);
  ys.push(y1);
  if (ys.length > 2 && ys[1]! - ys[0]! < L.course / 2) ys.splice(1, 1);
  if (ys.length > 2 && ys[ys.length - 1]! - ys[ys.length - 2]! < L.course / 2) ys.splice(ys.length - 2, 1);
  return ys;
}

/** A log block: rounds or courses along its long side, edges cut, cut ends pale. */
function appendLogs(buf: Buffers, block: MapBlock, paint: NaturePaint, shade: VertexShade | null): void {
  const L = NATURE_SHAPES.log;
  const { center: c, size } = block;
  const alongX = size.x >= size.z;
  const half = (alongX ? size.x : size.z) / 2;
  const ha = (alongX ? size.z : size.x) / 2;
  // Axis along the log; the profile in (across, up) with across × up = axis.
  const axis = alongX ? X : Z;
  const ea = alongX ? NEG_Z : X;
  const along = alongX ? c.x : c.z;
  const ys = logCourses(block);
  endColour.setHex(L.endTint, THREE.SRGBColorSpace);
  for (let k = 0; k + 1 < ys.length; k++) {
    const hb = (ys[k + 1]! - ys[k]!) / 2;
    const mid = (ys[k]! + ys[k + 1]!) / 2;
    const profile = octagon(ha, hb, chamferFor(NATURE_SHAPES.maxGap, L.chamfer));
    const courseK = 1 + L.shade * (hash01(c.x + k, mid, c.z) * 2 - 1);
    // Origin on the block's centre line at this course's middle, minus the axis part (s is world along the axis).
    origin.set(alongX ? 0 : c.x, mid, alongX ? c.z : 0);
    // A course's top lies flat on the next one's bottom: neither is drawn (octagon side 2 is the top, 6 the bottom).
    const hidden = (k + 2 < ys.length ? OCTAGON_TOP : 0) | (k > 0 ? OCTAGON_BOTTOM : 0);
    prism(buf, origin, axis, ea, UP, profile, ha, hb, [along - half, along + half], paint, courseK, shade, endColour, hidden);
  }
}

const faceN = new THREE.Vector3();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();

/**
 * A boulder: the block's box rounded `radius` at its edges, each face but the buried bottom cut into `segments` ×
 * `segments` facets whose inner corners are pushed in by up to `lump`; flat-shaded, world UVs along each facet's main
 * axis, up-facing facets mossier.
 */
function appendBoulder(buf: Buffers, block: MapBlock, paint: NaturePaint, shade: VertexShade | null, segments: number = NATURE_SHAPES.boulder.segments): void {
  const B = NATURE_SHAPES.boulder;
  const { center: c, size } = block;
  const h = [size.x / 2, size.y / 2, size.z / 2] as const;
  const R = Math.min(B.radius, h[0], h[1], h[2]);
  const N = segments;
  mossColour.setHex(B.moss, THREE.SRGBColorSpace);
  // The five faces above ground: normal axis and sign, and two in-plane axes (u × v = n).
  const faces: [number, number, number, number][] = [
    [0, 1, 2, 1],
    [0, -1, 1, 2],
    [2, 1, 0, 1],
    [2, -1, 1, 0],
    [1, 1, 0, 2],
  ];
  const at = (axisN: number, sign: number, au: number, av: number, s: number, t: number, interior: boolean): [number, number, number] => {
    const p = [0, 0, 0];
    p[axisN] = sign * h[axisN]!;
    p[au] = s * h[au]!;
    p[av] = t * h[av]!;
    // Round: the point's nearest point on the box shrunk by R, pushed out R along the way to it.
    const q = p.map((v, i) => Math.max(-(h[i]! - R), Math.min(h[i]! - R, v)));
    const d = p.map((v, i) => v - q[i]!);
    const len = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
    const out = q.map((v, i) => v + (d[i]! / len) * R);
    if (interior) {
      const lump = B.lump * hash01(c.x + out[0]!, c.y + out[1]! + B.seed, c.z + out[2]!);
      out[axisN] = out[axisN]! - sign * lump;
    }
    return [c.x + out[0]!, c.y + out[1]!, c.z + out[2]!];
  };
  for (const [axisN, sign, au0, av0] of faces) {
    // Wind each face counter-clockwise seen from outside: swap u and v on the faces where u × v points inwards.
    const flip = (au0 + 1) % 3 === av0 ? sign < 0 : sign > 0;
    const [au, av] = flip ? [av0, au0] : [au0, av0];
    const grid: [number, number, number][] = [];
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) grid.push(at(axisN, sign, au, av, -1 + (2 * i) / N, -1 + (2 * j) / N, i > 0 && i < N && j > 0 && j < N));
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const p00 = grid[j * (N + 1) + i]!;
        const p10 = grid[j * (N + 1) + i + 1]!;
        const p11 = grid[(j + 1) * (N + 1) + i + 1]!;
        const p01 = grid[(j + 1) * (N + 1) + i]!;
        // One shade for the facet's two triangles (by its diagonal), so the stone breaks into facets, not a checker.
        const facet = 1 + B.facetShade * (hash01(p00[0] + p11[0], p00[1] + p11[1], p00[2] + p11[2]) * 2 - 1);
        triangle(buf, p00, p10, p11, paint, shade, facet);
        triangle(buf, p00, p11, p01, paint, shade, facet);
      }
    }
  }
}

/** One flat-shaded boulder triangle: its own normal, UVs along its main axis, mossier when it faces up, `facet` brighter. */
function triangle(buf: Buffers, p: readonly number[], q: readonly number[], r: readonly number[], paint: NaturePaint, shade: VertexShade | null, facet: number): void {
  const B = NATURE_SHAPES.boulder;
  edgeA.set(q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!);
  edgeB.set(r[0]! - p[0]!, r[1]! - p[1]!, r[2]! - p[2]!);
  faceN.crossVectors(edgeA, edgeB).normalize();
  const ax = Math.abs(faceN.x);
  const ay = Math.abs(faceN.y);
  const az = Math.abs(faceN.z);
  vertexColour.copy(paint.color).lerp(mossColour, B.mossShare * Math.max(0, faceN.y));
  const base = buf.positions.length / 3;
  for (const v of [p, q, r]) {
    const [x, y, z] = v as [number, number, number];
    const [u, w] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
    const k = facet * (faceN.y < 0.9 ? grime(paint, y) : 1) * (shade ? shade(x, y, z, faceN.x, faceN.y, faceN.z) : 1);
    push(buf, x, y, z, faceN.x, faceN.y, faceN.z, u / paint.worldSize, w / paint.worldSize, vertexColour, k);
  }
  buf.indices.push(base, base + 1, base + 2);
}

/**
 * Writes `block`'s shape (a nature kind) into `buf`, painted `paint`, with the baked `shade` per vertex (map detail).
 * `segments` cuts a boulder's faces finer or coarser than NATURE_SHAPES.boulder.segments (a fire ring's small stones: 1).
 */
export function appendNatureShape(buf: Buffers, block: MapBlock, paint: NaturePaint, shade: VertexShade | null, segments?: number): void {
  if (block.kind === 'tree') appendTrunk(buf, block, paint, shade);
  else if (block.kind === 'log') appendLogs(buf, block, paint, shade);
  else if (block.kind === 'boulder') appendBoulder(buf, block, paint, shade, segments);
}

const roundAxis = new THREE.Vector3();
const roundA = new THREE.Vector3();
const roundB = new THREE.Vector3();

/**
 * A round of `sides` sides and `radius` from `from` to `to` (any direction: a fire's logs lean in), its ends capped in
 * `capColour`: drawing only, for fixtures (render/lightFixtures.ts).
 */
export function appendRound(buf: Buffers, from: THREE.Vector3, to: THREE.Vector3, radius: number, sides: number, paint: NaturePaint, capColour: THREE.Color): void {
  roundAxis.subVectors(to, from);
  const length = roundAxis.length();
  roundAxis.divideScalar(length);
  // eb: any unit vector across the axis; ea = eb × axis, so ea × eb = axis (the profile runs counter-clockwise about it).
  roundB.set(0, 1, 0);
  if (Math.abs(roundAxis.y) > 0.9) roundB.set(1, 0, 0);
  roundB.addScaledVector(roundAxis, -roundB.dot(roundAxis)).normalize();
  roundA.crossVectors(roundB, roundAxis);
  const profile: number[] = [];
  for (let i = 0; i < sides; i++) profile.push(Math.cos((i / sides) * Math.PI * 2) * radius, Math.sin((i / sides) * Math.PI * 2) * radius);
  prism(buf, from, roundAxis, roundA, roundB, profile, radius, radius, [0, length], paint, 1, null, capColour);
}

const pebbleColour = new THREE.Color();

/**
 * Pebbles strewn over a map's gravel (M33i, GROUND_LOOK.pebbles): so many a square metre of each gravel patch, small
 * stones sunk into the ground (`groundAt`), from a fixed seed, into the stone mesh. Drawing only: they are a few
 * centimetres high, below anything that could hide a figure or stop a BB that matters.
 */
export function appendPebbles(buf: Buffers, map: MapData, groundAt: (x: number, z: number) => number): void {
  const P = GROUND_LOOK.pebbles;
  const rng = createRng(P.seed);
  for (const patch of map.ground?.patches ?? []) {
    if (patch.surface !== 'gravel') continue;
    const spots: [number, number][] = [];
    const path = patch.path ?? [];
    const width = patch.width ?? 0;
    if (path.length > 1 && width > 0) {
      const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.z - path[i]!.z));
      const total = lengths.reduce((a, b) => a + b, 0);
      const count = Math.round(total * width * P.perSquareMetre);
      for (let n = 0; n < count; n++) {
        let at = rngNext(rng) * total;
        let i = 0;
        while (i < lengths.length - 1 && at > lengths[i]!) at -= lengths[i++]!;
        const a = path[i]!;
        const b = path[i + 1]!;
        const t = lengths[i]! > 0 ? at / lengths[i]! : 0;
        const across = (rngNext(rng) - 0.5) * width;
        const nx = -(b.z - a.z) / (lengths[i]! || 1);
        const nz = (b.x - a.x) / (lengths[i]! || 1);
        spots.push([a.x + (b.x - a.x) * t + nx * across, a.z + (b.z - a.z) * t + nz * across]);
      }
    }
    if (patch.box) {
      const [x0, x1, z0, z1] = patch.box;
      const count = Math.round(Math.abs((x1 - x0) * (z1 - z0)) * P.perSquareMetre);
      for (let n = 0; n < count; n++) spots.push([x0 + rngNext(rng) * (x1 - x0), z0 + rngNext(rng) * (z1 - z0)]);
    }
    for (const [x, z] of spots) {
      const size = P.size[0] + rngNext(rng) * (P.size[1] - P.size[0]);
      const h = size * P.height;
      pebbleColour.setHex(P.tints[Math.floor(rngNext(rng) * P.tints.length)]!, THREE.SRGBColorSpace);
      const block: MapBlock = { kind: 'boulder', center: { x, y: groundAt(x, z) + h / 2 - P.sink * h, z }, size: { x: size, y: h, z: size * (P.depth[0] + (P.depth[1] - P.depth[0]) * rngNext(rng)) } };
      appendBoulder(buf, block, { worldSize: SURFACES.worldSize.stone, color: pebbleColour, grimeFrom: null }, null, 1);
    }
  }
}

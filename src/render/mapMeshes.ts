import * as THREE from 'three';
import { type QualitySettings, SURFACES, type SurfaceTextureId } from '../config/render';
import type { BlockKind, MapBlock, MapData } from '../map/mapTypes';
import { RAMP_FACES, rampCorners } from '../map/surfaces';
import { appendCuboid, type Buffers, type Cuboid, type CuboidShape, emptyBuffers, FACES, PLAIN, type UvMode } from './cuboidMesh';
import { buildMapDecals, disposeMapDecals, drawDecalAtlas } from './mapDecals';
import type { ProceduralTexture, SurfaceTextures } from './proceduralTextures';
import { isSurfaceMaterial, setReliefMaps, type SurfaceMaterial, withoutEnvironment } from './surfaceMaterials';
import { releaseNormalMaps, usesNormalMaps } from './surfaceNormals';
import { buildOccluders, type Occluders, occlusionAt, occlusionShade } from './vertexOcclusion';

interface KindStyle {
  texture: SurfaceTextureId;
  uv: UvMode;
  /** Tint palette; each block picks one from its position (see blockTint) so props don't look cloned. */
  tints: number[];
  castShadow: boolean;
  /** Its sides darken towards their foot (SURFACES.grimeHeight): dirt and contact shade where they meet the ground. */
  grime: boolean;
}

/** Colours are warm and friendly: an airsoft site, not a military base. */
const STYLES: Record<BlockKind, KindStyle> = {
  floor: { texture: 'concrete', uv: 'world', tints: [0xffffff], castShadow: false, grime: false },
  ramp: { texture: 'concrete', uv: 'world', tints: [0xffffff], castShadow: false, grime: false },
  wall: { texture: 'blockWall', uv: 'world', tints: [0xffffff, 0xf2efe6], castShadow: true, grime: true },
  crate: { texture: 'crate', uv: 'perFace', tints: [0xffffff, 0xe8dcc8, 0xd8ccb4], castShadow: true, grime: true },
  // No team blue or orange on neutral props: those colours belong to the teams.
  container: { texture: 'corrugated', uv: 'world', tints: [0x4f8a57, 0xcdb338, 0x7a8288, 0x4f7a80], castShadow: true, grime: true },
  barrier: { texture: 'barrier', uv: 'world', tints: [0xe8e4da, 0xd9c04a], castShadow: true, grime: true },
  // Site props (M25b): each kind's main colour; their details are shades of it (see sitePropPieces).
  toilet: { texture: 'barrier', uv: 'world', tints: [0x5f8f5c, 0x7d8a78, 0xa9a48e], castShadow: true, grime: true },
  rack: { texture: 'barrier', uv: 'world', tints: [0x8a9096, 0x6f7c6a], castShadow: true, grime: true },
  gabion: { texture: 'gabion', uv: 'world', tints: [0xffffff, 0xeee8da], castShadow: true, grime: true },
  wrapped: { texture: 'barrier', uv: 'world', tints: [0xe9ecef, 0xddd8cc], castShadow: true, grime: true },
  ibc: { texture: 'barrier', uv: 'world', tints: [0xf2f0ea, 0xe6e2d6], castShadow: true, grime: true },
  sandbags: { texture: 'sandbag', uv: 'world', tints: [0xffffff, 0xeee6d6], castShadow: true, grime: true },
  generator: { texture: 'barrier', uv: 'world', tints: [0xcdb338, 0x5f7f52], castShadow: true, grime: true },
  skip: { texture: 'corrugated', uv: 'world', tints: [0xcdb338, 0x4f8a57, 0x7a8288], castShadow: true, grime: true },
};

/** A steel floor or ramp (MapBlock.surface 'metal', which also clanks underfoot): diamond tread plate in plain steel. */
const METAL_PLATE: KindStyle = { texture: 'steelPlate', uv: 'world', tints: [0xf4f6f8], castShadow: false, grime: false };

function styleOf(block: MapBlock): KindStyle {
  return block.surface === 'metal' ? METAL_PLATE : STYLES[block.kind];
}

/** Whether a block's mesh casts the sun's shadow: its kind's rule, and every floor or ramp that rises above the ground (a dock). */
export function castsShadow(block: MapBlock): boolean {
  if (styleOf(block).castShadow) return true;
  return (block.kind === 'floor' || block.kind === 'ramp') && block.center.y + block.size.y / 2 > SURFACES.raisedFrom;
}

/** A hash of a block's position. It uses |x|, so a block and its mirror twin across x = 0 always hash the same. */
function blockHash(block: MapBlock): number {
  const q = (v: number): number => Math.round(v * 10);
  return (Math.imul(q(Math.abs(block.center.x)), 73856093) ^ Math.imul(q(block.center.y), 19349663) ^ Math.imul(q(block.center.z), 83492791)) >>> 0;
}

/**
 * Tint for a block, picked from its kind's palette by a hash of its position, so a symmetric map looks symmetric.
 */
export function blockTint(block: MapBlock): number {
  const tints = styleOf(block).tints;
  return tints[blockHash(block) % tints.length] ?? 0xffffff;
}

/** A block's brightness (1 - SURFACES.shadeJitter .. 1), from other bits of the same hash: tint stays its hue. */
export function blockShade(block: MapBlock): number {
  return 1 - SURFACES.shadeJitter * (((blockHash(block) >>> 8) % 101) / 100);
}

const rampCorner = new Float32Array(18);
const faceNormal = new THREE.Vector3();
const edgeA = new THREE.Vector3();
const edgeB = new THREE.Vector3();

/**
 * A ramp's wedge (see map/surfaces.ts), flat-shaded with world UVs: each face is textured along the box
 * face whose normal is closest to its own (the slope like the top, so its texture stretches by 1 / cos of
 * the slope).
 */
function appendRamp(buf: Buffers, block: MapBlock, tex: ProceduralTexture, color: THREE.Color): void {
  const c = block.center;
  const p = rampCorner;
  rampCorners(block, p);
  for (const face of RAMP_FACES) {
    const [i0, i1, i2] = face as [number, number, number];
    edgeA.set(p[i1 * 3]! - p[i0 * 3]!, p[i1 * 3 + 1]! - p[i0 * 3 + 1]!, p[i1 * 3 + 2]! - p[i0 * 3 + 2]!);
    edgeB.set(p[i2 * 3]! - p[i0 * 3]!, p[i2 * 3 + 1]! - p[i0 * 3 + 1]!, p[i2 * 3 + 2]! - p[i0 * 3 + 2]!);
    faceNormal.crossVectors(edgeA, edgeB).normalize();
    let f: (typeof FACES)[number] = FACES[0];
    let best = Number.NEGATIVE_INFINITY;
    for (const g of FACES) {
      const d = g.n[0] * faceNormal.x + g.n[1] * faceNormal.y + g.n[2] * faceNormal.z;
      if (d > best) {
        best = d;
        f = g;
      }
    }
    const base = buf.positions.length / 3;
    for (const k of face) {
      const px = c.x + p[k * 3]!;
      const py = c.y + p[k * 3 + 1]!;
      const pz = c.z + p[k * 3 + 2]!;
      buf.positions.push(px, py, pz);
      buf.normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
      buf.colors.push(color.r, color.g, color.b);
      buf.uvs.push((px * f.u[0] + py * f.u[1] + pz * f.u[2]) / tex.worldSize, (px * f.v[0] + py * f.v[1] + pz * f.v[2]) / tex.worldSize);
    }
    for (let k = 2; k < face.length; k++) buf.indices.push(base, base + k - 1, base + k);
  }
}

/** The block's bounds as a cuboid (a fresh one: details shrink and slice it). */
function boundsOf(block: MapBlock): Cuboid {
  const { center: c, size: s } = block;
  return { min: [c.x - s.x / 2, c.y - s.y / 2, c.z - s.z / 2], max: [c.x + s.x / 2, c.y + s.y / 2, c.z + s.z / 2] };
}

/** One piece of a block to draw: a cuboid with its texture and paint, cast into the shadow map or not. */
export interface Piece {
  box: Cuboid;
  texture: SurfaceTextureId;
  uv: UvMode;
  color: THREE.Color;
  grime: boolean;
  castShadow: boolean;
}

const C = SURFACES.container;
const COPING = SURFACES.wallCoping;
const PALLET = SURFACES.pallet;
const PROP = SURFACES.siteProps;
const DETAIL = SURFACES.propDetail;
/** Two blocks touch top to bottom within this (metres). */
const TOUCH = 0.01;

/**
 * A shipping container (or a row or stack of them, one block): the ribbed box set `inset` in from a darker steel
 * frame of corner posts and rails at the top, bottom and between stacked containers, posts between containers in a
 * row, and locking bars on one end. Every piece stays inside the block.
 */
function containerPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean): void {
  const b = boundsOf(block);
  const frame = color.clone().multiplyScalar(C.frameShade);
  const bars = color.clone().multiplyScalar(C.barShade);
  const piece = (min: Cuboid['min'], max: Cuboid['max'], c: THREE.Color, grime = true): void => {
    out.push({ box: { min, max }, texture: 'corrugated', uv: 'world', color: c, grime, castShadow: true });
  };
  piece([b.min[0] + C.inset, b.min[1], b.min[2] + C.inset], [b.max[0] - C.inset, b.max[1], b.max[2] - C.inset], color);
  // The long axis (0 = x, 2 = z) and the across one.
  const long = block.size.x >= block.size.z ? 0 : 2;
  const across = long === 0 ? 2 : 0;
  const levels = Math.max(1, Math.round(block.size.y / C.height));
  const levelH = block.size.y / levels;
  const span = (axis: number, from: number, to: number, a0: number, a1: number, y0: number, y1: number): [Cuboid['min'], Cuboid['max']] => {
    const min: [number, number, number] = [0, y0, 0];
    const max: [number, number, number] = [0, y1, 0];
    min[axis] = from;
    max[axis] = to;
    const other = axis === 0 ? 2 : 0;
    min[other] = a0;
    max[other] = a1;
    return [min, max];
  };
  // Rails round the top and bottom of every container in the stack, along both long sides and both ends.
  for (let level = 0; level <= levels; level++) {
    const y = b.min[1] + level * levelH;
    const y0 = Math.max(b.min[1], y - (level === 0 ? 0 : C.rail));
    const y1 = Math.min(b.max[1], y + (level === levels ? 0 : C.rail));
    for (const [axis, otherAxis] of [
      [long, across],
      [across, long],
    ] as const) {
      for (const sideAt of [b.min[otherAxis], b.max[otherAxis] - C.post]) {
        const [min, max] = span(axis, b.min[axis], b.max[axis], sideAt, sideAt + C.post, y0, y1);
        piece(min, max, frame, level === 0);
      }
    }
  }
  // Corner posts, and posts where one container in a row meets the next.
  const count = Math.max(1, Math.round(block.size[long === 0 ? 'x' : 'z'] / C.length));
  for (let i = 0; i <= count; i++) {
    const at = b.min[long] + (i / count) * (b.max[long] - b.min[long]);
    const from = Math.min(Math.max(at - C.post / 2, b.min[long]), b.max[long] - C.post);
    for (const sideAt of [b.min[across], b.max[across] - C.post]) {
      const [min, max] = span(long, from, from + C.post, sideAt, sideAt + C.post, b.min[1], b.max[1]);
      piece(min, max, frame);
    }
  }
  // Locking bars on the doors at one end (which end, from the block's hash): four per container in the stack.
  const doorAt = blockHash(block) % 2 === 0 ? b.min[long] : b.max[long] - C.inset;
  const width = b.max[across] - b.min[across];
  for (let level = 0; level < levels; level++) {
    const y0 = b.min[1] + level * levelH + C.rail;
    const y1 = b.min[1] + (level + 1) * levelH - C.rail;
    for (let k = 1; k <= 4; k++) {
      const at = b.min[across] + (k / 5) * width;
      const [min, max] = span(long, doorAt, doorAt + C.inset, at - C.bar / 2, at + C.bar / 2, y0, y1);
      piece(min, max, bars, false);
    }
    // Map detail: a lock box between the middle two bars, at handle height.
    if (detail) {
      const mid = b.min[across] + width / 2;
      const yLock = y0 + (y1 - y0) * 0.45;
      const L = DETAIL.lockBox;
      const [min, max] = span(long, doorAt, doorAt + Math.min(C.inset, L.depth + C.inset / 2), mid - L.width / 2, mid + L.width / 2, yLock, yLock + L.height);
      piece(min, max, bars, false);
    }
  }
}

/** A wall: painted blocks under a concrete coping that stands `overhang` proud of them on both faces. */
function wallPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const thin = block.size.x <= block.size.z ? 0 : 2;
  const body = boundsOf(block);
  body.max[1] -= COPING.height;
  body.min[thin] += COPING.overhang;
  body.max[thin] -= COPING.overhang;
  out.push({ box: body, texture: 'blockWall', uv: 'world', color, grime: true, castShadow: true });
  out.push({ box: { min: [b.min[0], b.max[1] - COPING.height, b.min[2]], max: b.max }, texture: 'concrete', uv: 'world', color, grime: false, castShadow: true });
}

/** How a pallet's load is painted: a crate by default. `topGap` lowers its top (room for straps over it). */
interface PalletLoad {
  texture: SurfaceTextureId;
  uv: UvMode;
  color: THREE.Color;
  topGap: number;
}

/**
 * A crate standing on the ground: the crate on a pallet (top and bottom decks on three runners), inside its bounds.
 * `load` paints the load as something else (a wrapped pallet).
 */
function palletPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean, load?: PalletLoad): void {
  const b = boundsOf(block);
  const deck = PALLET.height;
  out.push({
    box: {
      min: [b.min[0] + PALLET.inset, b.min[1] + deck, b.min[2] + PALLET.inset],
      max: [b.max[0] - PALLET.inset, b.max[1] - (load?.topGap ?? 0), b.max[2] - PALLET.inset],
    },
    texture: load?.texture ?? 'crate',
    uv: load?.uv ?? 'perFace',
    color: load?.color ?? color,
    grime: false,
    castShadow: true,
  });
  const wood = color.clone().multiplyScalar(PALLET.shade);
  const board = PALLET.deck;
  const add = (min: Cuboid['min'], max: Cuboid['max']): void => {
    out.push({ box: { min, max }, texture: 'crate', uv: 'perFace', color: wood, grime: true, castShadow: true });
  };
  if (detail) {
    // Map detail: the top deck as separate boards with gaps between them, the runners showing through.
    const n = DETAIL.pallet.boards;
    const w = (b.max[2] - b.min[2] - (n - 1) * DETAIL.pallet.gap) / n;
    for (let k = 0; k < n; k++) {
      const z0 = b.min[2] + k * (w + DETAIL.pallet.gap);
      add([b.min[0], b.min[1] + deck - board, z0], [b.max[0], b.min[1] + deck, z0 + w]);
    }
  } else add([b.min[0], b.min[1] + deck - board, b.min[2]], [b.max[0], b.min[1] + deck, b.max[2]]);
  add([b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1] + board, b.max[2]]);
  const depth = b.max[2] - b.min[2];
  for (const at of [0, 0.5, 1]) {
    const z0 = b.min[2] + at * (depth - PALLET.runner);
    add([b.min[0], b.min[1] + board, z0], [b.max[0], b.min[1] + deck - board, z0 + PALLET.runner]);
  }
}

/** Pushes a box (min and max corners) painted `texture` in `color` with world UVs: the site props' building brick. */
function add(out: Piece[], min: Cuboid['min'], max: Cuboid['max'], texture: SurfaceTextureId, color: THREE.Color, grime = true): void {
  out.push({ box: { min, max }, texture, uv: 'world', color, grime, castShadow: true });
}

/** A shade of `color` (a new colour). */
const shade = (color: THREE.Color, k: number): THREE.Color => color.clone().multiplyScalar(k);

/** The block's long horizontal axis (0 = x, 2 = z) and the one across it. */
function axes(block: MapBlock): [0 | 2, 0 | 2] {
  return block.size.x >= block.size.z ? [0, 2] : [2, 0];
}

/** A box spanning `a0..a1` along `along`, `c0..c1` across it and `y0..y1` up. */
function span(along: 0 | 2, a0: number, a1: number, c0: number, c1: number, y0: number, y1: number): [Cuboid['min'], Cuboid['max']] {
  return along === 0 ? [[a0, y0, c0], [a1, y1, c1]] : [[c0, y0, a0], [c1, y1, a1]];
}

/** A portable toilet: moulded shell on a dark skid, a pale roof, and its door (with a latch) on the side the hash picks. */
function toiletPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const p = PROP.toilet;
  const dark = shade(color, 0.45);
  add(out, [b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1] + p.skid, b.max[2]], 'barrier', dark);
  add(out, [b.min[0] + p.inset, b.min[1] + p.skid, b.min[2] + p.inset], [b.max[0] - p.inset, b.max[1] - p.roof, b.max[2] - p.inset], 'barrier', color);
  add(out, [b.min[0], b.max[1] - p.roof, b.min[2]], [b.max[0], b.max[1], b.max[2]], 'barrier', new THREE.Color(PROP.paleRoof), false);
  // The door: a panel standing proud of the shell, on one of the four sides.
  const side = blockHash(block) % 4;
  const along: 0 | 2 = side < 2 ? 2 : 0;
  const normal = along === 0 ? 2 : 0;
  const mid = (b.min[along] + b.max[along]) / 2;
  // Depths into the block from its face on that side: the latch stands proud of the door, the door of the shell.
  const outer = side % 2 === 0 ? b.min[normal] : b.max[normal];
  const dir = side % 2 === 0 ? 1 : -1;
  const depth = (d0: number, d1: number): [number, number] => [Math.min(outer + dir * d0, outer + dir * d1), Math.max(outer + dir * d0, outer + dir * d1)];
  const y0 = b.min[1] + p.skid;
  const [dMin, dMax] = span(along, mid - p.doorWidth / 2, mid + p.doorWidth / 2, ...depth(p.latchDepth, p.inset), y0, y0 + p.doorHeight);
  add(out, dMin, dMax, 'barrier', shade(color, 0.86));
  const latchAt = mid + p.doorWidth / 2 - p.latchFromEdge;
  const [lMin, lMax] = span(along, latchAt - p.latchSize / 2, latchAt + p.latchSize / 2, ...depth(0, p.latchDepth), y0 + p.latchY[0], y0 + p.latchY[1]);
  add(out, lMin, lMax, 'barrier', new THREE.Color(PROP.latch), false);
}

/**
 * Pallet racking (or shelving indoors): steel uprights at every bay, a mesh spine down the middle, a shelf deck at
 * crate height and beams top and bottom. Every bay is stocked on both sides of the spine on both levels (cardboard
 * boxes or film-wrapped stock), and the spine fills the gaps between loads, so it reads as the solid cover it is.
 */
function rackPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const r = PROP.rack;
  const [along, across] = axes(block);
  const bays = Math.max(1, Math.round(block.size[along === 0 ? 'x' : 'z'] / r.bay));
  const bayLen = (b.max[along] - b.min[along]) / bays;
  const beam = shade(color, 0.7);
  const deckY = b.min[1] + (b.max[1] - b.min[1]) / 2;
  const mid = (b.min[across] + b.max[across]) / 2;
  // Uprights at every bay boundary, front and back.
  for (let i = 0; i <= bays; i++) {
    const at = Math.min(Math.max(b.min[along] + i * bayLen - r.post / 2, b.min[along]), b.max[along] - r.post);
    for (const c of [b.min[across], b.max[across] - r.post]) {
      const [min, max] = span(along, at, at + r.post, c, c + r.post, b.min[1], b.max[1]);
      add(out, min, max, 'barrier', color);
    }
  }
  // Beams along the front and back at the bottom, the deck and the top, between the end uprights and set into them
  // (no face shared with an upright); the deck and the spine inside the uprights.
  const inner = [b.min[along] + r.post, b.max[along] - r.post] as const;
  for (const y of [b.min[1], deckY, b.max[1] - r.beam - r.beamSet]) {
    for (const c of [b.min[across] + r.beamSet, b.max[across] - r.post + r.beamSet]) {
      const [min, max] = span(along, inner[0], inner[1], c, c + r.post - 2 * r.beamSet, y, y + r.beam);
      add(out, min, max, 'barrier', beam, false);
    }
  }
  // The deck runs out to the beams' backs, leaving no slit between them.
  const [dMin, dMax] = span(along, inner[0], inner[1], b.min[across] + r.post - r.beamSet, b.max[across] - r.post + r.beamSet, deckY, deckY + r.beam);
  add(out, dMin, dMax, 'steelPlate', beam, false);
  const [sMin, sMax] = span(along, inner[0], inner[1], mid - r.spine / 2, mid + r.spine / 2, b.min[1] + r.beam, b.max[1] - r.beam);
  add(out, sMin, sMax, 'steelPlate', shade(color, 0.55), false);
  // The stock: per bay, level and side of the spine, a film-wrapped load or two cardboard boxes of different heights.
  const levels: [number, number][] = [
    [b.min[1] + r.beam, deckY],
    [deckY + r.beam, b.max[1] - r.beam],
  ];
  const sides: [number, number][] = [
    [b.min[across] + r.loadInset, mid - r.spine / 2],
    [mid + r.spine / 2, b.max[across] - r.loadInset],
  ];
  const cardboard = new THREE.Color(PROP.cardboard);
  const film = new THREE.Color(PROP.film);
  let bits = blockHash(block);
  for (let i = 0; i < bays; i++) {
    const a0 = b.min[along] + i * bayLen + r.post;
    const a1 = b.min[along] + (i + 1) * bayLen - r.post;
    for (const [y0, y1] of levels) {
      for (const [c0, c1] of sides) {
        const pick = bits & 3;
        bits = (bits >>> 2) | (pick << 30);
        if (pick === 0) {
          const [min, max] = span(along, a0, a1, c0, c1, y0, y1 - r.headroom);
          add(out, min, max, 'barrier', film, false);
          continue;
        }
        // Two boxes side by side, the second shorter.
        const split = a0 + (a1 - a0) * (pick === 1 ? 0.5 : 0.58);
        for (const [f0, f1, h] of [
          [a0, split - r.boxGap / 2, 1],
          [split + r.boxGap / 2, a1, r.shortBoxes[pick === 3 ? 1 : 0]],
        ] as const) {
          const [min, max] = span(along, f0, f1, c0, c1, y0, y0 + (y1 - r.headroom - y0) * h);
          add(out, min, max, 'barrier', shade(cardboard, h === 1 ? 1 : 0.92), false);
        }
      }
    }
  }
}

/** A gabion: sand-filled wire mesh with the sand showing at the top. */
function gabionPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const h = PROP.gabion;
  add(out, b.min, [b.max[0], b.max[1] - h.sandTop, b.max[2]], 'gabion', color);
  add(out, [b.min[0] + h.sandInset, b.max[1] - h.sandTop, b.min[2] + h.sandInset], [b.max[0] - h.sandInset, b.max[1], b.max[2] - h.sandInset], 'concrete', new THREE.Color(PROP.sand), false);
}

/** A pallet load shrink-wrapped in film, on its pallet, with two straps round it. */
function wrappedPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean): void {
  const b = boundsOf(block);
  palletPieces(block, new THREE.Color(PROP.palletWood), out, detail, { texture: 'barrier', uv: 'world', color, topGap: PROP.strapThickness });
  const strap = new THREE.Color(PROP.strap);
  const [along, across] = axes(block);
  for (const t of [0.3, 0.7]) {
    const at = b.min[along] + t * (b.max[along] - b.min[along]);
    const [min, max] = span(along, at - PROP.strapWidth / 2, at + PROP.strapWidth / 2, b.min[across], b.max[across], b.min[1] + PALLET.height, b.max[1]);
    // The film is set in from the block's sides and top, so the strap over it stands proud of it everywhere.
    add(out, min, max, 'barrier', strap, false);
  }
}

/** An IBC water tank: a white tank in a steel cage on a steel base, with a lid on top. */
function ibcPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const c = PROP.ibc;
  const steel = new THREE.Color(PROP.cageSteel);
  add(out, b.min, [b.max[0], b.min[1] + c.base, b.max[2]], 'barrier', shade(steel, 0.6));
  add(out, [b.min[0] + c.inset, b.min[1] + c.base, b.min[2] + c.inset], [b.max[0] - c.inset, b.max[1] - c.inset, b.max[2] - c.inset], 'barrier', color, false);
  // The cage: rails round each side at three heights, and four bars up each side.
  const t = c.bar;
  for (const y of [b.min[1] + c.base, (b.min[1] + b.max[1]) / 2, b.max[1] - t]) {
    for (const along of [0, 2] as const) {
      const across = along === 0 ? 2 : 0;
      for (const at of [b.min[across], b.max[across] - t]) {
        const [min, max] = span(along, b.min[along], b.max[along], at, at + t, y, y + t);
        add(out, min, max, 'barrier', steel, false);
      }
    }
  }
  for (const along of [0, 2] as const) {
    const across = along === 0 ? 2 : 0;
    for (let k = 0; k <= 3; k++) {
      const x = b.min[along] + (k / 3) * (b.max[along] - b.min[along] - t);
      for (const at of [b.min[across], b.max[across] - t]) {
        const [min, max] = span(along, x, x + t, at, at + t, b.min[1] + c.base, b.max[1]);
        add(out, min, max, 'barrier', steel, false);
      }
    }
  }
  const mx = (b.min[0] + b.max[0]) / 2;
  const mz = (b.min[2] + b.max[2]) / 2;
  add(out, [mx - c.lid, b.max[1] - c.inset, mz - c.lid], [mx + c.lid, b.max[1], mz + c.lid], 'barrier', new THREE.Color(PROP.latch), false);
}

/** Sandbags: courses of bags, every other one set back a little, the top one more, so the wall reads as laid by hand. */
function sandbagPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const courses = Math.max(1, Math.round(block.size.y / PROP.sandbags.course));
  const h = block.size.y / courses;
  for (let k = 0; k < courses; k++) {
    const inset = k === courses - 1 ? PROP.sandbags.topInset : (k % 2) * PROP.sandbags.inset;
    add(out, [b.min[0] + inset, b.min[1] + k * h, b.min[2] + inset], [b.max[0] - inset, b.min[1] + (k + 1) * h, b.max[2] - inset], 'sandbag', color, k === 0);
  }
}

/** A site generator: a painted canopy on a dark skid, with louvred panels down its sides and a control panel. */
function generatorPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean): void {
  const b = boundsOf(block);
  const g = PROP.generator;
  const dark = shade(color, 0.4);
  // Map detail: a fuel cap stands on the canopy, which is lowered by its height to keep it inside the block.
  const cap = detail ? DETAIL.fuelCap : null;
  const canopyTop = b.max[1] - (cap?.height ?? 0);
  add(out, b.min, [b.max[0], b.min[1] + g.skid, b.max[2]], 'barrier', dark);
  add(out, [b.min[0] + g.inset, b.min[1] + g.skid, b.min[2] + g.inset], [b.max[0] - g.inset, canopyTop, b.max[2] - g.inset], 'barrier', color);
  const [along, across] = axes(block);
  if (cap) {
    const at = b.min[along] + (b.max[along] - b.min[along]) * 0.25;
    const mid = (b.min[across] + b.max[across]) / 2;
    const [min, max] = span(along, at - cap.size / 2, at + cap.size / 2, mid - cap.size / 2, mid + cap.size / 2, canopyTop, b.max[1]);
    add(out, min, max, 'barrier', new THREE.Color(PROP.latch), false);
  }
  const louvre = shade(color, 0.6);
  for (const at of [b.min[across], b.max[across] - g.inset]) {
    for (let k = 0; k < g.louvres; k++) {
      const y = b.min[1] + g.skid + g.louvreFrom + k * g.louvreStep;
      const [min, max] = span(along, b.min[along] + g.louvreEnd, b.max[along] - g.louvreEnd, at, at + g.inset, y, y + g.louvreHeight);
      add(out, min, max, 'barrier', louvre, false);
    }
  }
  const centre = (b.min[across] + b.max[across]) / 2;
  const [pMin, pMax] = span(along, b.max[along] - g.inset, b.max[along], centre - g.panelWidth / 2, centre + g.panelWidth / 2, b.min[1] + g.panelY[0], b.min[1] + g.panelY[1]);
  add(out, pMin, pMax, 'barrier', new THREE.Color(PROP.latch), false);
}

/** A skip: a ribbed steel bin narrower at its foot, a rim round its open top, and rubble inside. */
function skipPieces(block: MapBlock, color: THREE.Color, out: Piece[], detail: boolean): void {
  const b = boundsOf(block);
  const s = PROP.skip;
  const [along, across] = axes(block);
  const foot = span(along, b.min[along] + s.footInset, b.max[along] - s.footInset, b.min[across] + s.footInset, b.max[across] - s.footInset, b.min[1], b.min[1] + s.foot);
  add(out, foot[0], foot[1], 'corrugated', shade(color, 0.8));
  const body = span(along, b.min[along] + s.inset, b.max[along] - s.inset, b.min[across] + s.inset, b.max[across] - s.inset, b.min[1] + s.foot, b.max[1] - s.rim);
  add(out, body[0], body[1], 'corrugated', color);
  const rim = shade(color, 0.75);
  const y0 = b.max[1] - s.rim;
  for (const [a0, a1, c0, c1] of [
    [b.min[along], b.max[along], b.min[across], b.min[across] + s.rimWidth],
    [b.min[along], b.max[along], b.max[across] - s.rimWidth, b.max[across]],
    [b.min[along], b.min[along] + s.rimWidth, b.min[across] + s.rimWidth, b.max[across] - s.rimWidth],
    [b.max[along] - s.rimWidth, b.max[along], b.min[across] + s.rimWidth, b.max[across] - s.rimWidth],
  ] as const) {
    const [min, max] = span(along, a0, a1, c0, c1, y0, b.max[1]);
    add(out, min, max, 'barrier', rim, false);
  }
  const [rMin, rMax] = span(along, b.min[along] + s.rimWidth, b.max[along] - s.rimWidth, b.min[across] + s.rimWidth, b.max[across] - s.rimWidth, y0, b.max[1] - s.rubbleDrop);
  add(out, rMin, rMax, 'concrete', new THREE.Color(PROP.rubble), false);
  if (!detail) return;
  // Map detail: a heap of broken blocks on the rubble, up to the rim's top (never above the block).
  const H = DETAIL.skipHeap;
  let bits = blockHash(block);
  const free = [b.max[along] - b.min[along] - 2 * s.rimWidth - H.size, b.max[across] - b.min[across] - 2 * s.rimWidth - H.size];
  for (let k = 0; k < H.blocks; k++) {
    const a0 = b.min[along] + s.rimWidth + ((bits & 255) / 255) * free[0]!;
    const c0 = b.min[across] + s.rimWidth + (((bits >>> 8) & 255) / 255) * free[1]!;
    const top = Math.min(b.max[1], b.max[1] - s.rubbleDrop + H.heap * (0.5 + ((bits >>> 16) & 127) / 254));
    bits = Math.imul(bits ^ (bits >>> 13), 0x5bd1e995) >>> 0;
    const [min, max] = span(along, a0, a0 + H.size, c0, c0 + H.size * 0.7, b.max[1] - s.rubbleDrop - H.heap, top);
    add(out, min, max, 'concrete', shade(new THREE.Color(PROP.rubble), 0.85 + 0.1 * k), false);
  }
}

/** True if `block` stands on a crate (stacked crates share one pallet, under the bottom one). */
function onCrate(block: MapBlock, blocks: readonly MapBlock[]): boolean {
  const bottom = block.center.y - block.size.y / 2;
  return blocks.some(
    (o) =>
      o !== block &&
      o.kind === 'crate' &&
      Math.abs(o.center.y + o.size.y / 2 - bottom) < TOUCH &&
      Math.abs(o.center.x - block.center.x) < (o.size.x + block.size.x) / 2 &&
      Math.abs(o.center.z - block.center.z) < (o.size.z + block.size.z) / 2,
  );
}

/**
 * A barrier with map detail: its top recessed `recess` deep inside a rim `rim` wide (moulded plastic barriers are
 * hollow), the recess shaded by the baked occlusion.
 */
function barrierPieces(block: MapBlock, color: THREE.Color, out: Piece[]): void {
  const b = boundsOf(block);
  const R = DETAIL.barrier;
  const floor = b.max[1] - R.recess;
  add(out, b.min, [b.max[0], floor, b.max[2]], 'barrier', color);
  const rim = shade(color, R.shade);
  for (const [min, max] of [
    [[b.min[0], floor, b.min[2]], [b.max[0], b.max[1], b.min[2] + R.rim]],
    [[b.min[0], floor, b.max[2] - R.rim], [b.max[0], b.max[1], b.max[2]]],
    [[b.min[0], floor, b.min[2] + R.rim], [b.min[0] + R.rim, b.max[1], b.max[2] - R.rim]],
    [[b.max[0] - R.rim, floor, b.min[2] + R.rim], [b.max[0], b.max[1], b.max[2] - R.rim]],
  ] as [Cuboid['min'], Cuboid['max']][]) {
    add(out, min, max, 'barrier', rim, false);
  }
}

/**
 * Every piece a block is drawn as (most are just the block itself); `detail` (QualitySettings.mapDetail) adds the
 * finer prop detail. Every piece stays inside its block either way. Exported for the tests.
 */
export function blockPieces(block: MapBlock, blocks: readonly MapBlock[], detail = false): Piece[] {
  const style = styleOf(block);
  const color = new THREE.Color().setHex(blockTint(block), THREE.SRGBColorSpace).multiplyScalar(blockShade(block));
  const out: Piece[] = [];
  if (block.kind === 'container') containerPieces(block, color, out, detail);
  else if (block.kind === 'wall') wallPieces(block, color, out);
  else if (block.kind === 'crate' && !onCrate(block, blocks)) palletPieces(block, color, out, detail);
  else if (block.kind === 'toilet') toiletPieces(block, color, out);
  else if (block.kind === 'rack') rackPieces(block, color, out);
  else if (block.kind === 'gabion') gabionPieces(block, color, out);
  else if (block.kind === 'wrapped') wrappedPieces(block, color, out, detail);
  else if (block.kind === 'ibc') ibcPieces(block, color, out);
  else if (block.kind === 'sandbags') sandbagPieces(block, color, out);
  else if (block.kind === 'generator') generatorPieces(block, color, out, detail);
  else if (block.kind === 'skip') skipPieces(block, color, out, detail);
  else if (block.kind === 'barrier' && detail && block.surface !== 'metal') barrierPieces(block, color, out);
  else out.push({ box: boundsOf(block), texture: style.texture, uv: style.uv, color, grime: style.grime, castShadow: castsShadow(block) });
  return out;
}

/** What a built map looks like (from QualitySettings): rebuilt when `detail` or `steelSheen` changes (mapNeedsRebuild). */
export interface MapLook {
  /** Surface relief on, drawn as normal maps (else bump maps). */
  relief: boolean;
  normalMaps: boolean;
  /** Map detail: bevels, baked occlusion on finer tiles, ground variation, prop detail, signs (render/mapDecals.ts). */
  detail: boolean;
  /** Steel tread plate as painted steel that picks up the sky (with Environment lighting). */
  steelSheen: boolean;
}

export function mapLookOf(q: QualitySettings): MapLook {
  return { relief: q.surfaceRelief, normalMaps: q.normalMaps, detail: q.mapDetail, steelSheen: q.environment };
}

/** Whether going from one look to another needs the map built again (geometry or material kind changes). */
export function mapNeedsRebuild(from: MapLook, to: MapLook): boolean {
  return from.detail !== to.detail || from.steelSheen !== to.steelSheen;
}

/**
 * The material for a merged surface mesh: its texture, with relief (a normal map worked out from it, or the texture
 * itself as a bump map) when surface relief is on. Painted surfaces are Lambert and never take the environment map
 * (the largest part of the screen; DECISIONS 2026-09-28); the steel tread plate is painted steel under environment
 * lighting (audit section 5, "Map props and surfaces").
 */
function surfaceMaterial(surface: ProceduralTexture, id: SurfaceTextureId, look: MapLook): SurfaceMaterial {
  const base = { map: surface.texture, vertexColors: true, bumpScale: SURFACES.relief[id] };
  const mat: SurfaceMaterial =
    look.steelSheen && id === 'steelPlate'
      ? new THREE.MeshStandardMaterial({ ...base, ...SURFACES.steelSheen })
      : withoutEnvironment(new THREE.MeshLambertMaterial(base));
  setReliefMaps(mat, surface, look.relief, look.normalMaps);
  return mat;
}

/** The surface a material paints (by its texture's name, a SurfaceTextureId), or null for one that isn't a surface. */
function surfaceOf(mat: THREE.Material, textures: SurfaceTextures): ProceduralTexture | null {
  if (!isSurfaceMaterial(mat) || !mat.map || !Object.hasOwn(textures, mat.map.name)) return null;
  return textures[mat.map.name as SurfaceTextureId];
}

/** Surface relief on or off, as normal or bump maps, for a built map (Settings → Graphics): the shaders rebuild once. */
export function setMapRelief(group: THREE.Group, textures: SurfaceTextures, look: Pick<MapLook, 'relief' | 'normalMaps'>): void {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const surface = surfaceOf(obj.material as THREE.Material, textures);
    if (surface) setReliefMaps(obj.material as SurfaceMaterial, surface, look.relief, look.normalMaps);
  });
}

/**
 * Points a built map at another set of surface textures (Texture detail, audit REN-13): each material keeps its surface
 * (by the texture's name, its SurfaceTextureId) and its relief. The UVs are in metres, so any size maps the same way.
 */
export function setMapTextures(group: THREE.Group, textures: SurfaceTextures): void {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material as THREE.Material;
    const surface = surfaceOf(mat, textures);
    if (!surface || surface.texture === (mat as SurfaceMaterial).map) return;
    const m = mat as SurfaceMaterial;
    const relief = m.bumpMap !== null || m.normalMap !== null;
    const normal = m.normalMap !== null;
    m.map = surface.texture;
    m.bumpMap = null;
    m.normalMap = null;
    setReliefMaps(m, surface, relief, normal);
  });
}

/** What map detail adds to a piece: its bevel, its tiles and its baked shade (or the plain box without detail). */
function pieceShape(piece: Piece, block: MapBlock, index: number, occ: Occluders | null): CuboidShape {
  if (!occ) return PLAIN;
  const O = SURFACES.occlusion;
  const B = SURFACES.bevel;
  const flat = block.kind === 'floor' || block.kind === 'ramp';
  const thinnest = Math.min(piece.box.max[0] - piece.box.min[0], piece.box.max[1] - piece.box.min[1], piece.box.max[2] - piece.box.min[2]);
  const bevel = flat || thinnest < B.minPiece ? 0 : Math.min(B.size, B.maxShare * thinnest);
  const ground = block.kind === 'floor';
  return {
    bevel,
    cell: O.cell,
    shade: (x, y, z, nx, ny, nz) => {
      const k = occlusionShade(occlusionAt(occ, x, y, z, nx, ny, nz, O.lift, index), O.strength);
      return ground && ny > 0.9 ? k * (1 + SURFACES.groundNoise.amount * groundNoise(x, z)) : k;
    },
  };
}

/** A smooth value noise over the ground (-1..1), about SURFACES.groundNoise.period metres from light to dark. */
export function groundNoise(x: number, z: number): number {
  const G = SURFACES.groundNoise;
  const fx = x / G.period;
  const fz = z / G.period;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const hash = (a: number, b: number): number => ((Math.imul(a * 73856093 ^ b * 19349663 ^ G.seed, 0x5bd1e995) >>> 0) / 4294967295) * 2 - 1;
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const tx = smooth(fx - ix);
  const tz = smooth(fz - iz);
  const top = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * tx;
  const bottom = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * tx;
  return top + (bottom - top) * tz;
}

/** Appends `from`'s vertices and triangles to `into` (its indices moved past `into`'s vertices). */
function appendBuffers(into: Buffers, from: Buffers): void {
  const base = into.positions.length / 3;
  for (const key of ['positions', 'normals', 'uvs', 'colors'] as const) for (const v of from[key]) into[key].push(v);
  for (const i of from.indices) into.indices.push(base + i);
}

/**
 * A detailed map mesh's own shadow proxy: its first `drawn` indices are what the camera sees (bevels, tiles), the rest
 * the same boxes plain, drawn into the shadow map in their place (the same silhouette, a fraction of the triangles).
 * Exported for the tests.
 */
export function shadowProxy(mesh: THREE.Mesh, drawn: number): void {
  const geo = mesh.geometry;
  const total = geo.index?.count ?? 0;
  geo.setDrawRange(0, drawn);
  mesh.onBeforeShadow = () => geo.setDrawRange(drawn, total - drawn);
  mesh.onAfterShadow = () => geo.setDrawRange(0, drawn);
}

/**
 * Builds the static level as one merged mesh per surface texture (and whether it casts shadows): a handful of draw
 * calls for the whole map, details included; with map detail, the signs as one more (render/mapDecals.ts; `decalAtlas`
 * draws their texture, null leaves them out). Returns a group; call `disposeMapMeshes` to free GPU resources.
 */
export function buildMapMeshes(map: MapData, textures: SurfaceTextures, look: MapLook, decalAtlas: (() => THREE.Texture) | null = drawDecalAtlas): THREE.Group {
  const group = new THREE.Group();
  group.name = 'map';
  // With map detail a shadow-casting mesh also holds its plain boxes, drawn into the shadow map instead (shadowProxy).
  const meshes = new Map<string, { buf: Buffers; shadow: Buffers | null; texture: SurfaceTextureId; castShadow: boolean }>();
  const entry = (texture: SurfaceTextureId, castShadow: boolean) => {
    const key = `${texture}${castShadow ? '' : '-flat'}`;
    let e = meshes.get(key);
    if (!e) meshes.set(key, (e = { buf: emptyBuffers(), shadow: look.detail && castShadow ? emptyBuffers() : null, texture, castShadow }));
    return e;
  };

  const pieces: { piece: Piece; block: MapBlock }[] = [];
  for (const block of map.blocks) {
    if (block.kind === 'ramp') {
      const style = styleOf(block);
      const color = new THREE.Color().setHex(blockTint(block), THREE.SRGBColorSpace).multiplyScalar(blockShade(block));
      const e = entry(style.texture, castsShadow(block));
      appendRamp(e.buf, block, textures[style.texture], color);
      if (e.shadow) appendRamp(e.shadow, block, textures[style.texture], color);
      continue;
    }
    for (const piece of blockPieces(block, map.blocks, look.detail)) pieces.push({ piece, block });
  }
  // Map detail: every piece's box shades the others' vertices (the ramps, being wedges, don't).
  const occ = look.detail ? buildOccluders(pieces.map(({ piece: p }) => [...p.box.min, ...p.box.max] as const), SURFACES.occlusion.reach) : null;
  pieces.forEach(({ piece: p, block }, i) => {
    const bottom = block.center.y - block.size.y / 2;
    const e = entry(p.texture, p.castShadow);
    const paint = { uv: p.uv, worldSize: textures[p.texture].worldSize, color: p.color, grimeFrom: p.grime ? bottom : null };
    appendCuboid(e.buf, p.box, paint, pieceShape(p, block, i, occ));
    if (e.shadow) appendCuboid(e.shadow, p.box, paint, PLAIN);
  });

  for (const [key, { buf, shadow, texture, castShadow }] of meshes) {
    const drawn = buf.indices.length;
    if (shadow) appendBuffers(buf, shadow);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
    geo.setIndex(buf.indices);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, surfaceMaterial(textures[texture], texture, look));
    mesh.name = `map-${key}`;
    mesh.castShadow = castShadow;
    if (shadow) shadowProxy(mesh, drawn);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
  }
  if (look.detail && decalAtlas) {
    const decals = buildMapDecals(map, decalAtlas);
    if (decals) group.add(decals);
  }
  return group;
}

/**
 * A new look for a built map (Settings → Graphics): built again (a new group in the old one's place, the old one freed)
 * when its geometry or materials change (map detail, the steel's sheen), else its textures and relief follow in place.
 * Returns the map's group. `decalAtlas` as for buildMapMeshes. Normal maps the new look doesn't draw are freed.
 */
export function restyleMap(
  group: THREE.Group,
  map: MapData,
  textures: SurfaceTextures,
  from: MapLook,
  to: MapLook,
  decalAtlas: (() => THREE.Texture) | null = drawDecalAtlas,
): THREE.Group {
  // Normal maps nothing draws with any more are freed (they are made again when wanted).
  const trim = (): void => {
    if (!usesNormalMaps({ surfaceRelief: to.relief, normalMaps: to.normalMaps })) releaseNormalMaps(textures);
  };
  if (!mapNeedsRebuild(from, to)) {
    setMapTextures(group, textures);
    setMapRelief(group, textures, to);
    trim();
    return group;
  }
  const parent = group.parent;
  disposeMapMeshes(group);
  const next = buildMapMeshes(map, textures, to, decalAtlas);
  parent?.add(next);
  trim();
  return next;
}

export function disposeMapMeshes(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      (obj.material as THREE.Material).dispose();
    }
  });
  disposeMapDecals(group);
  group.removeFromParent();
}

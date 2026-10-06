import * as THREE from 'three';
import { SURFACES } from '../config/render';
import { type StainKind, WEATHERING } from '../config/weathering';
import type { MapBlock, MapData } from '../map/mapTypes';
import { drawDressingCells } from './dressingAtlas';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * Painted signs and stencils on the field (map detail; audit section 5, "Map props and surfaces"): one texture holding
 * every sign (the atlas) and one merged mesh of quads, each a few millimetres off the face it is painted on, so the
 * whole set is one draw call. Placed from the map's own blocks: a bay number on each container's long sides, a site
 * roundel on the long perimeter walls, a "SAFE ZONE" board on the perimeter wall by each dead zone, hazard chevrons on
 * barriers (not on a finished one, M34f). A sign is left out where something stands in front of it. No brands, no team
 * colours. With them, stains on the floors (G6: oil, dirt, cracks, tyre marks, scuffs; WEATHERING.stains), never under
 * a block. The atlas's cells never overlap (atlasRects); the mesh is blended, so the stains fade at their edges. G8: the
 * map's set dressing adds its own quads (render/mapDressing.ts dressingDecals: dirt, litter, logos, sprays, signs), drawn
 * from a third of the atlas below the first square, so the whole lot stays one draw call.
 */

const D = SURFACES.decals;
const C = SURFACES.container;
const COPING = SURFACES.wallCoping;

/** A rectangle of the atlas, in its pixels: x, y (down), width, height. */
export type AtlasRect = readonly [number, number, number, number];

/** Bay numbers drawn in the atlas (cells of 256 × 128 in the top three rows). */
const STENCIL_COUNT = 12;

/** The atlas is this many times as tall as it is wide (G8: the dressing's cells sit under the first square). */
export const ATLAS_TALL = 1.5;

/** The atlas' height in pixels for its width `size`. */
export const atlasHeight = (size: number = D.atlasSize): number => size * ATLAS_TALL;

/** The set dressing's pictures (G8, render/dressingAtlas.ts draws them). */
export interface DressingCells {
  /** The shipping lines' logos, one per DRESSING.decals.logo.names. */
  logos: AtlasRect[];
  /** Dirt banked against a block's foot, thick along the cell's bottom edge. */
  banks: AtlasRect[];
  arrow: AtlasRect;
  tag: AtlasRect;
  warning: AtlasRect;
  grit: AtlasRect;
  contact: AtlasRect;
  litter: AtlasRect[];
}

/** Every picture's place in the atlas. */
export interface AtlasLayout {
  stencils: AtlasRect[];
  roundel: AtlasRect;
  safeZone: AtlasRect;
  chevrons: AtlasRect;
  /** The ground stains (G6), each kind's variants. */
  stains: Record<StainKind, AtlasRect[]>;
  /** The set dressing's (G8), in the atlas' last third. */
  dressing: DressingCells;
}

/** Where each picture is in the atlas (for its size, SURFACES.decals.atlasSize, in units of 1024 pixels). */
export function atlasRects(size: number = D.atlasSize): AtlasLayout {
  const k = size / 1024;
  const r = (x: number, y: number, w: number, h: number): AtlasRect => [x * k, y * k, w * k, h * k];
  const stencils: AtlasRect[] = [];
  for (let i = 0; i < STENCIL_COUNT; i++) stencils.push(r((i % 4) * 256, Math.floor(i / 4) * 128, 256, 128));
  return {
    stencils,
    roundel: r(0, 384, 256, 256),
    safeZone: r(256, 384, 512, 128),
    chevrons: r(256, 512, 512, 128),
    stains: {
      oil: [r(0, 640, 256, 256), r(256, 640, 256, 256)],
      dirt: [r(512, 640, 256, 256), r(768, 384, 256, 256)],
      crack: [r(768, 640, 256, 256)],
      tyre: [r(0, 896, 512, 128)],
      scuffs: [r(512, 896, 512, 128)],
    },
    dressing: {
      logos: [r(0, 1024, 512, 128), r(512, 1024, 512, 128), r(0, 1152, 512, 128), r(512, 1152, 512, 128)],
      banks: [r(0, 1280, 512, 128), r(512, 1280, 512, 128)],
      arrow: r(0, 1408, 256, 128),
      tag: r(256, 1408, 128, 128),
      warning: r(384, 1408, 128, 128),
      grit: r(512, 1408, 128, 128),
      contact: r(640, 1408, 128, 128),
      litter: [r(768, 1408, 128, 128), r(896, 1408, 128, 128)],
    },
  };
}

/** Every rectangle of a layout, in one list (the tests check that none overlaps another). */
export function allAtlasRects(layout: AtlasLayout): AtlasRect[] {
  const d = layout.dressing;
  const dressing = [...d.logos, ...d.banks, d.arrow, d.tag, d.warning, d.grit, d.contact, ...d.litter];
  return [...layout.stencils, layout.roundel, layout.safeZone, layout.chevrons, ...Object.values(layout.stains).flat(), ...dressing];
}

/**
 * One painted quad: its centre, the outward normal of its face (an axis, ±1: a wall's side, or a floor's top, axis 1),
 * its size (m) and its picture. On a floor, its width runs along x and its height along -z, turned `turn` quarter turns
 * (G8: x, then -z, -x, +z is the picture's up). `tint` (sRGB, G8: a spray's colour) multiplies the picture; white if absent.
 */
export interface DecalQuad {
  centre: [number, number, number];
  axis: 0 | 1 | 2;
  sign: 1 | -1;
  width: number;
  height: number;
  rect: AtlasRect;
  turn?: 0 | 1 | 2 | 3;
  tint?: number;
}

const hashOf = (b: MapBlock): number => (Math.imul(Math.round(Math.abs(b.center.x) * 10), 73856093) ^ Math.imul(Math.round(b.center.z * 10), 83492791)) >>> 0;

/** A floor picture's right and up per quarter turn (DecalQuad.turn): up is -z, -x, +z, +x. */
const FLOOR_RIGHT: readonly [number, number, number][] = [[1, 0, 0], [0, 0, -1], [-1, 0, 0], [0, 0, 1]];
const FLOOR_UP: readonly [number, number, number][] = [[0, 0, -1], [-1, 0, 0], [0, 0, 1], [1, 0, 0]];

/** The face's "right" (seen from in front of it) for an outward normal along `axis` with `sign`. */
function rightOf(axis: 0 | 1 | 2, sign: 1 | -1, turn = 0): readonly [number, number, number] {
  return axis === 0 ? [0, 0, -sign] : axis === 2 ? [sign, 0, 0] : FLOOR_RIGHT[turn]!;
}

/** The face's "up" in the picture: up the wall, or away from you across a floor (-z, or as turned). */
function upOf(axis: 0 | 1 | 2, turn = 0): readonly [number, number, number] {
  return axis === 1 ? FLOOR_UP[turn]! : [0, 1, 0];
}

/** A number in [0, 1) from integers (the stains' placement: the same map always gets the same stains). */
function cellRandom(a: number, b: number, k: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(k + WEATHERING.stains.seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** True if a block other than `floor` stands over the ground rectangle within `clearance` above the floor's top. */
export function coveredAbove(blocks: readonly MapBlock[], floor: MapBlock, lo: readonly [number, number], hi: readonly [number, number], top: number, clearance: number): boolean {
  return blocks.some((b) => {
    if (b === floor) return false;
    if (b.center.x + b.size.x / 2 <= lo[0] || b.center.x - b.size.x / 2 >= hi[0]) return false;
    if (b.center.z + b.size.z / 2 <= lo[1] || b.center.z - b.size.z / 2 >= hi[1]) return false;
    return b.center.y + b.size.y / 2 > top + 1e-3 && b.center.y - b.size.y / 2 < top + clearance;
  });
}

/**
 * The stains on a map's floors (G6, WEATHERING.stains): each floor's top cut into squares on a world grid, each square
 * maybe one stain, wholly inside the square and the floor (inset from its edge) and never under a block.
 */
export function floorStains(map: MapData, size: number = D.atlasSize): DecalQuad[] {
  const S = WEATHERING.stains;
  const rects = atlasRects(size).stains;
  const kinds = Object.keys(S.weights) as StainKind[];
  const total = kinds.reduce((sum, k) => sum + S.weights[k], 0);
  const out: DecalQuad[] = [];
  map.blocks.forEach((floor, index) => {
    if (floor.kind !== 'floor') return;
    const top = floor.center.y + floor.size.y / 2;
    const x0 = floor.center.x - floor.size.x / 2 + S.inset;
    const x1 = floor.center.x + floor.size.x / 2 - S.inset;
    const z0 = floor.center.z - floor.size.z / 2 + S.inset;
    const z1 = floor.center.z + floor.size.z / 2 - S.inset;
    for (let ix = Math.floor(x0 / S.cell); ix * S.cell < x1; ix++) {
      for (let iz = Math.floor(z0 / S.cell); iz * S.cell < z1; iz++) {
        if (cellRandom(ix, iz, index * 8) >= S.chance) continue;
        let pick = cellRandom(ix, iz, index * 8 + 1) * total;
        let kind = kinds[0]!;
        for (const k of kinds) {
          kind = k;
          pick -= S.weights[k];
          if (pick < 0) break;
        }
        const long = kind === 'tyre' || kind === 'scuffs';
        const width = long ? S.tyre : S.size.min + cellRandom(ix, iz, index * 8 + 2) * (S.size.max - S.size.min);
        const depth = long ? S.tyre / 4 : width;
        // Wholly inside its square and the floor: a stain never crosses into the next square's.
        const lo: [number, number] = [Math.max(ix * S.cell, x0), Math.max(iz * S.cell, z0)];
        const hi: [number, number] = [Math.min((ix + 1) * S.cell, x1), Math.min((iz + 1) * S.cell, z1)];
        if (hi[0] - lo[0] < width || hi[1] - lo[1] < depth) continue;
        const cx = lo[0] + width / 2 + cellRandom(ix, iz, index * 8 + 3) * (hi[0] - lo[0] - width);
        const cz = lo[1] + depth / 2 + cellRandom(ix, iz, index * 8 + 4) * (hi[1] - lo[1] - depth);
        if (coveredAbove(map.blocks, floor, [cx - width / 2, cz - depth / 2], [cx + width / 2, cz + depth / 2], top, S.clearance)) continue;
        const variants = rects[kind];
        const rect = variants[Math.floor(cellRandom(ix, iz, index * 8 + 5) * variants.length)]!;
        out.push({ centre: [cx, top + D.offset, cz], axis: 1, sign: 1, width, height: depth, rect });
      }
    }
  });
  return out;
}

/** True if a block other than `self` (and the floors) stands within `clearance` in front of the quad. */
export function decalBlocked(q: DecalQuad, blocks: readonly MapBlock[], self: MapBlock, clearance: number): boolean {
  const r = rightOf(q.axis, q.sign);
  const lo = [0, 0, 0];
  const hi = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const half = a === 1 ? q.height / 2 : Math.abs(r[a]!) * (q.width / 2);
    lo[a] = q.centre[a]! - half;
    hi[a] = q.centre[a]! + half;
  }
  if (q.sign > 0) hi[q.axis] = q.centre[q.axis]! + clearance;
  else lo[q.axis] = q.centre[q.axis]! - clearance;
  return blocks.some((b) => {
    if (b === self || b.kind === 'floor' || b.kind === 'ramp') return false;
    const s = [b.size.x / 2, b.size.y / 2, b.size.z / 2];
    const c = [b.center.x, b.center.y, b.center.z];
    for (let a = 0; a < 3; a++) if (c[a]! + s[a]! <= lo[a]! || c[a]! - s[a]! >= hi[a]!) return false;
    return true;
  });
}

/** Every sign the map gets, placed (pure: the tests read it). */
export function decalQuads(map: MapData, size: number = D.atlasSize): DecalQuad[] {
  const rects = atlasRects(size);
  const out: DecalQuad[] = [];
  const blocks = map.blocks;
  const clearance = 0.3;
  const add = (q: DecalQuad, self: MapBlock): boolean => {
    if (decalBlocked(q, blocks, self, clearance)) return false;
    out.push(q);
    return true;
  };
  const vec = (b: MapBlock): [number, number, number] => [b.center.x, b.center.y, b.center.z];
  const halfOf = (b: MapBlock, a: 0 | 2): number => (a === 0 ? b.size.x : b.size.z) / 2;

  // The field's bounds, for the perimeter walls.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const b of blocks) {
    minX = Math.min(minX, b.center.x - b.size.x / 2);
    maxX = Math.max(maxX, b.center.x + b.size.x / 2);
    minZ = Math.min(minZ, b.center.z - b.size.z / 2);
    maxZ = Math.max(maxZ, b.center.z + b.size.z / 2);
  }
  const edgeTolerance = 0.3;

  for (const b of blocks) {
    const bottom = b.center.y - b.size.y / 2;
    if (b.kind === 'container') {
      // A bay number on each long side of each container in the row (the bottom one of a stack).
      const long: 0 | 2 = b.size.x >= b.size.z ? 0 : 2;
      const across: 0 | 2 = long === 0 ? 2 : 0;
      const length = 2 * halfOf(b, long);
      const count = Math.max(1, Math.round(length / C.length));
      for (let i = 0; i < count; i++) {
        const along = vec(b)[long] - length / 2 + ((i + 0.3) / count) * length;
        const rect = rects.stencils[(hashOf(b) + i) % STENCIL_COUNT]!;
        for (const sign of [1, -1] as const) {
          const centre = vec(b);
          centre[long] = along;
          centre[1] = bottom + D.stencilY;
          centre[across] = vec(b)[across] + sign * (halfOf(b, across) - C.inset + D.offset);
          add({ centre, axis: across, sign, width: D.stencilHeight * 2, height: D.stencilHeight, rect }, b);
        }
      }
    } else if (b.kind === 'barrier' && b.surface !== 'metal' && !b.finish) {
      // (A finished barrier, M34f, is painted as its finish says: a city's steel railing, no site hazard chevrons.)
      const long: 0 | 2 = b.size.x >= b.size.z ? 0 : 2;
      const across: 0 | 2 = long === 0 ? 2 : 0;
      const width = 2 * halfOf(b, long) - 0.2;
      if (width < 0.6 || bottom + D.chevronY + D.chevronHeight / 2 > b.center.y + b.size.y / 2) continue;
      for (const sign of [1, -1] as const) {
        const centre = vec(b);
        centre[1] = bottom + D.chevronY;
        centre[across] = vec(b)[across] + sign * (halfOf(b, across) + D.offset);
        add({ centre, axis: across, sign, width, height: D.chevronHeight, rect: rects.chevrons }, b);
      }
    }
  }

  // Perimeter walls: the inner face of each wall that stands on the field's edge.
  const perimeter: { b: MapBlock; axis: 0 | 2; sign: 1 | -1; length: number }[] = [];
  for (const b of blocks) {
    if (b.kind !== 'wall') continue;
    const thin: 0 | 2 = b.size.x <= b.size.z ? 0 : 2;
    const lo = vec(b)[thin] - halfOf(b, thin);
    const hi = vec(b)[thin] + halfOf(b, thin);
    const [edgeLo, edgeHi] = thin === 0 ? [minX, maxX] : [minZ, maxZ];
    // The inner face looks towards the field's middle.
    if (Math.abs(lo - edgeLo) < edgeTolerance) perimeter.push({ b, axis: thin, sign: 1, length: 2 * halfOf(b, thin === 0 ? 2 : 0) });
    else if (Math.abs(hi - edgeHi) < edgeTolerance) perimeter.push({ b, axis: thin, sign: -1, length: 2 * halfOf(b, thin === 0 ? 2 : 0) });
  }
  const faceAt = (w: (typeof perimeter)[number], y: number, along: number, width: number, height: number, rect: AtlasRect): DecalQuad => {
    const centre = vec(w.b);
    const alongAxis: 0 | 2 = w.axis === 0 ? 2 : 0;
    centre[alongAxis] = along;
    centre[1] = w.b.center.y - w.b.size.y / 2 + y;
    centre[w.axis] = vec(w.b)[w.axis] + w.sign * (halfOf(w.b, w.axis) - COPING.overhang + D.offset);
    return { centre, axis: w.axis, sign: w.sign, width, height, rect };
  };
  const tries = [0, 0.25, -0.25, 0.4, -0.4];
  // A roundel on the perimeter walls along the field's longer side (whichever way the map runs), as near their middle
  // as is clear.
  const longFace: 0 | 2 = maxX - minX >= maxZ - minZ ? 2 : 0;
  for (const w of perimeter) {
    if (w.length < D.minWall || w.axis !== longFace) continue;
    const alongAxis: 0 | 2 = longFace === 2 ? 0 : 2;
    for (const t of tries) {
      if (add(faceAt(w, D.roundelY, vec(w.b)[alongAxis] + t * w.length, D.roundelSize, D.roundelSize, rects.roundel), w.b)) break;
    }
  }
  // "SAFE ZONE" on the perimeter wall nearest each end's dead zone, level with it.
  for (const zone of map.deadZones) {
    if (zone.length === 0) continue;
    const zx = zone.reduce((s, p) => s + p.position.x, 0) / zone.length;
    const zz = zone.reduce((s, p) => s + p.position.z, 0) / zone.length;
    let best: (typeof perimeter)[number] | null = null;
    let bestD = Infinity;
    for (const w of perimeter) {
      const d = Math.hypot(Math.max(0, Math.abs(zx - w.b.center.x) - w.b.size.x / 2), Math.max(0, Math.abs(zz - w.b.center.z) - w.b.size.z / 2));
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    if (!best) continue;
    const alongAxis: 0 | 2 = best.axis === 0 ? 2 : 0;
    const lo = vec(best.b)[alongAxis] - best.length / 2 + D.boardWidth / 2 + 0.2;
    const hi = vec(best.b)[alongAxis] + best.length / 2 - D.boardWidth / 2 - 0.2;
    if (lo > hi) continue;
    const target = Math.min(hi, Math.max(lo, alongAxis === 0 ? zx : zz));
    for (const t of [0, 1, -1, 2, -2]) {
      const along = Math.min(hi, Math.max(lo, target + t * D.boardWidth));
      if (add(faceAt(best, D.boardY, along, D.boardWidth, D.boardWidth / 4, rects.safeZone), best.b)) break;
    }
  }
  for (const q of floorStains(map, size)) out.push(q);
  return out;
}

/** The atlas: every sign drawn once on a transparent canvas (alpha-tested, so edges are crisp). */
export function drawDecalAtlas(size: number = D.atlasSize): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = atlasHeight(size);
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const rects = atlasRects(size);
  const k = size / 1024;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // Bay numbers: stencil lettering, with the stencil's bridges cut through each character.
  rects.stencils.forEach(([x, y, w, h], i) => {
    g.fillStyle = D.stencil;
    g.font = `bold ${Math.round(84 * k)}px sans-serif`;
    g.fillText(`AS-${String(i + 1).padStart(2, '0')}`, x + w / 2, y + h / 2 + 4 * k);
    g.clearRect(x, y + h / 2 - 3 * k, w, 6 * k);
  });
  // The site roundel: a ring, a BB and the word.
  {
    const [x, y, w] = rects.roundel;
    const cx = x + w / 2;
    const cy = y + w / 2;
    g.strokeStyle = D.ink;
    g.lineWidth = 16 * k;
    g.beginPath();
    g.arc(cx, cy, w / 2 - 12 * k, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 6 * k;
    g.beginPath();
    g.arc(cx, cy, w / 2 - 34 * k, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = D.ink;
    g.beginPath();
    g.arc(cx, cy - 40 * k, 22 * k, 0, Math.PI * 2);
    g.fill();
    g.font = `bold ${Math.round(40 * k)}px sans-serif`;
    g.fillText('AIRSOFT', cx, cy + 22 * k);
    g.font = `bold ${Math.round(24 * k)}px sans-serif`;
    g.fillText('FIELD', cx, cy + 58 * k);
  }
  // The safe-zone board: a painted board with a dark border.
  {
    const [x, y, w, h] = rects.safeZone;
    g.fillStyle = D.paint;
    g.fillRect(x + 4 * k, y + 4 * k, w - 8 * k, h - 8 * k);
    g.strokeStyle = D.ink;
    g.lineWidth = 8 * k;
    g.strokeRect(x + 14 * k, y + 14 * k, w - 28 * k, h - 28 * k);
    g.fillStyle = D.ink;
    g.font = `bold ${Math.round(64 * k)}px sans-serif`;
    g.fillText('SAFE ZONE', x + w / 2, y + h / 2 + 4 * k);
  }
  // Hazard chevrons: yellow and dark stripes.
  {
    const [x, y, w, h] = rects.chevrons;
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = D.hazard;
    g.fillRect(x, y, w, h);
    g.fillStyle = D.ink;
    for (let s = -h; s < w; s += h) {
      g.beginPath();
      g.moveTo(x + s, y + h);
      g.lineTo(x + s + h / 2, y + h);
      g.lineTo(x + s + h, y);
      g.lineTo(x + s + h / 2, y);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  drawStains(g, rects.stains, k);
  drawDressingCells(g, rects.dressing, k);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'decals';
  return texture;
}

/** A seeded generator for the stains' drawing (the atlas is the same every time). */
function drawRandom(seed: number): () => number {
  let i = 0;
  return () => cellRandom(seed, i++, 0);
}

/** The ground stains in their cells: soft blotches, a crack, tyre marks and scuffs, each fading to nothing at its edge. */
function drawStains(g: CanvasRenderingContext2D, stains: AtlasLayout['stains'], k: number): void {
  const S = WEATHERING.stains;
  const blotch = ([x, y, w, h]: AtlasRect, colour: string, alpha: number, seed: number): void => {
    const rnd = drawRandom(seed);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.fillStyle = colour;
    for (let i = 0; i < 14; i++) {
      const r = (0.12 + rnd() * 0.18) * w;
      const cx = x + w / 2 + (rnd() - 0.5) * (w / 2 - r) * 1.2;
      const cy = y + h / 2 + (rnd() - 0.5) * (h / 2 - r) * 1.2;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(0,0,0,${alpha * (0.4 + rnd() * 0.4)})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
    }
    // The blotch's shape in alpha, its colour painted through it.
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = colour;
    g.fillRect(x, y, w, h);
    g.restore();
  };
  stains.oil.forEach((r, i) => blotch(r, S.colour.oil, S.alpha.oil, 11 + i));
  stains.dirt.forEach((r, i) => blotch(r, S.colour.dirt, S.alpha.dirt, 23 + i));
  // A crack: a jagged line with a branch or two, across the cell.
  for (const [x, y, w, h] of stains.crack) {
    const rnd = drawRandom(37);
    g.save();
    g.strokeStyle = S.colour.crack;
    g.globalAlpha = S.alpha.crack;
    g.lineCap = 'round';
    const walk = (px: number, py: number, angle: number, steps: number, width: number): void => {
      g.lineWidth = width * k;
      g.beginPath();
      g.moveTo(px, py);
      for (let i = 0; i < steps; i++) {
        angle += (rnd() - 0.5) * 0.9;
        px = Math.min(x + w - 4 * k, Math.max(x + 4 * k, px + Math.cos(angle) * 18 * k));
        py = Math.min(y + h - 4 * k, Math.max(y + 4 * k, py + Math.sin(angle) * 18 * k));
        g.lineTo(px, py);
        if (i === 4 || i === 8) walk(px, py, angle + (rnd() < 0.5 ? 1 : -1) * 0.9, 4, width * 0.6);
      }
      g.stroke();
    };
    walk(x + 12 * k, y + h * (0.3 + rnd() * 0.4), 0, 12, 4);
    g.restore();
  }
  // Tyre marks: two treaded bands along the cell, fading at the ends.
  for (const [x, y, w, h] of stains.tyre) {
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    const fade = g.createLinearGradient(x, 0, x + w, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.2, `rgba(0,0,0,${S.alpha.tyre})`);
    fade.addColorStop(0.8, `rgba(0,0,0,${S.alpha.tyre})`);
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    for (const band of [0.18, 0.62]) {
      for (let t = x; t < x + w; t += 10 * k) g.fillRect(t, y + band * h, 7 * k, 0.2 * h);
    }
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = S.colour.tyre;
    g.fillRect(x, y, w, h);
    g.restore();
  }
  // Scuffs: short dark strokes where boots and pallets drag.
  for (const [x, y, w, h] of stains.scuffs) {
    const rnd = drawRandom(53);
    g.save();
    g.strokeStyle = S.colour.tyre;
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const px = x + (0.08 + rnd() * 0.84) * w;
      const py = y + (0.2 + rnd() * 0.6) * h;
      const len = (20 + rnd() * 50) * k;
      g.globalAlpha = S.alpha.scuffs * (0.4 + rnd() * 0.6);
      g.lineWidth = (2 + rnd() * 5) * k;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + len, py + (rnd() - 0.5) * 10 * k);
      g.stroke();
    }
    g.restore();
  }
}

/**
 * The signs and stains as one mesh (null when the map has none), with `extra` quads (G8: the map's set dressing,
 * render/mapDressing.ts dressingDecals); `atlas` makes the texture (the tests pass a stand-in). Drawn before the other
 * blended things (DECAL_RENDER_ORDER): it lies flat on the field, and everything else blended stands in front of it.
 */
export function buildMapDecals(map: MapData, atlas: () => THREE.Texture = drawDecalAtlas, extra: readonly DecalQuad[] = []): THREE.Mesh | null {
  const quads = extra.length > 0 ? [...decalQuads(map), ...extra] : decalQuads(map);
  if (quads.length === 0) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const size = D.atlasSize;
  const tall = atlasHeight(size);
  const tint = new THREE.Color();
  for (const q of quads) {
    const r = rightOf(q.axis, q.sign, q.turn);
    const u = upOf(q.axis, q.turn);
    const n = [0, 0, 0];
    n[q.axis] = q.sign;
    tint.setHex(q.tint ?? 0xffffff, THREE.SRGBColorSpace);
    const base = positions.length / 3;
    const [rx, ry, rw, rh] = q.rect;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const a = su * (q.width / 2);
      const b = sv * (q.height / 2);
      positions.push(q.centre[0] + r[0] * a + u[0] * b, q.centre[1] + r[1] * a + u[1] * b, q.centre[2] + r[2] * a + u[2] * b);
      normals.push(n[0]!, n[1]!, n[2]!);
      colors.push(tint.r, tint.g, tint.b);
      // The canvas runs downwards and the texture is flipped (flipY): v = 1 at the canvas top.
      uvs.push((rx + ((su + 1) / 2) * rw) / size, 1 - (ry + ((1 - sv) / 2) * rh) / tall);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  // Blended (G6): the stains fade at their edges; the texels with nothing on them are skipped. Vertex colours (G8): a
  // spray's paint over its white drawing; white everywhere else.
  const material = withoutEnvironment(
    new THREE.MeshLambertMaterial({
      map: atlas(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      alphaTest: D.alphaFloor,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'map-decals';
  mesh.receiveShadow = true;
  mesh.renderOrder = DECAL_RENDER_ORDER;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/**
 * The decals' draw order among the blended things (G8): first, as they lie flat on the field's faces; the puddles
 * (render/dressingMeshes.ts) next, over the stains; then smoke, dust and BBs, which stand in front of both.
 */
export const DECAL_RENDER_ORDER = -2;

/** Frees the signs' texture (its mesh's geometry and material go with the map's, disposeMapMeshes). */
export function disposeMapDecals(group: THREE.Group): void {
  const mesh = group.getObjectByName('map-decals');
  if (mesh instanceof THREE.Mesh) (mesh.material as THREE.MeshLambertMaterial).map?.dispose();
}

import * as THREE from 'three';
import { SURFACES } from '../config/render';
import type { MapBlock, MapData } from '../map/mapTypes';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * Painted signs and stencils on the field (map detail; audit section 5, "Map props and surfaces"): one texture holding
 * every sign (the atlas) and one merged mesh of quads, each a few millimetres off the face it is painted on, so the
 * whole set is one draw call. Placed from the map's own blocks: a bay number on each container's long sides, a site
 * roundel on the long perimeter walls, a "SAFE ZONE" board on the perimeter wall by each dead zone, hazard chevrons on
 * barriers. A sign is left out where something stands in front of it. No brands, no team colours.
 */

const D = SURFACES.decals;
const C = SURFACES.container;
const COPING = SURFACES.wallCoping;

/** A rectangle of the atlas, in its pixels: x, y (down), width, height. */
export type AtlasRect = readonly [number, number, number, number];

/** Bay numbers drawn in the atlas (cells of 256 × 128 in the top three rows). */
export const STENCIL_COUNT = 12;

/** Where each sign is in the atlas (for its size, SURFACES.decals.atlasSize, in units of 1024 pixels). */
export function atlasRects(size: number = D.atlasSize): { stencils: AtlasRect[]; roundel: AtlasRect; safeZone: AtlasRect; chevrons: AtlasRect } {
  const k = size / 1024;
  const stencils: AtlasRect[] = [];
  for (let i = 0; i < STENCIL_COUNT; i++) stencils.push([(i % 4) * 256 * k, Math.floor(i / 4) * 128 * k, 256 * k, 128 * k]);
  return { stencils, roundel: [0, 384 * k, 256 * k, 256 * k], safeZone: [256 * k, 384 * k, 512 * k, 128 * k], chevrons: [256 * k, 512 * k, 512 * k, 128 * k] };
}

/** One painted quad: its centre, the outward normal of its face (an axis, ±1), its size (m) and its picture. */
export interface DecalQuad {
  centre: [number, number, number];
  axis: 0 | 2;
  sign: 1 | -1;
  width: number;
  height: number;
  rect: AtlasRect;
}

const hashOf = (b: MapBlock): number => (Math.imul(Math.round(Math.abs(b.center.x) * 10), 73856093) ^ Math.imul(Math.round(b.center.z * 10), 83492791)) >>> 0;

/** The face's "right" (seen from in front of it) for an outward normal along `axis` with `sign`. */
function rightOf(axis: 0 | 2, sign: 1 | -1): [number, number, number] {
  return axis === 0 ? [0, 0, -sign] : [sign, 0, 0];
}

/** True if a block other than `self` (and the floors) stands within `clearance` in front of the quad. */
function blocked(q: DecalQuad, blocks: readonly MapBlock[], self: MapBlock, clearance: number): boolean {
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
    if (blocked(q, blocks, self, clearance)) return false;
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
    } else if (b.kind === 'barrier' && b.surface !== 'metal') {
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
  // A roundel on the long perimeter walls, as near their middle as is clear.
  for (const w of perimeter) {
    if (w.length < D.minWall || w.axis !== 2) continue;
    const alongAxis: 0 | 2 = 0;
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
  return out;
}

/** The atlas: every sign drawn once on a transparent canvas (alpha-tested, so edges are crisp). */
export function drawDecalAtlas(size: number = D.atlasSize): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
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
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'decals';
  return texture;
}

/** The signs as one mesh (null when the map has none); `atlas` makes the texture (the tests pass a stand-in). */
export function buildMapDecals(map: MapData, atlas: () => THREE.Texture = drawDecalAtlas): THREE.Mesh | null {
  const quads = decalQuads(map);
  if (quads.length === 0) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const size = D.atlasSize;
  for (const q of quads) {
    const r = rightOf(q.axis, q.sign);
    const n = [0, 0, 0];
    n[q.axis] = q.sign;
    const base = positions.length / 3;
    const [rx, ry, rw, rh] = q.rect;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      positions.push(q.centre[0] + r[0] * su * (q.width / 2), q.centre[1] + sv * (q.height / 2), q.centre[2] + r[2] * su * (q.width / 2));
      normals.push(n[0]!, n[1]!, n[2]!);
      // The canvas runs downwards and the texture is flipped (flipY): v = 1 at the canvas top.
      uvs.push((rx + ((su + 1) / 2) * rw) / size, 1 - (ry + ((1 - sv) / 2) * rh) / size);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  const material = withoutEnvironment(new THREE.MeshLambertMaterial({ map: atlas(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'map-decals';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/** Frees the signs' texture (its mesh's geometry and material go with the map's, disposeMapMeshes). */
export function disposeMapDecals(group: THREE.Group): void {
  const mesh = group.getObjectByName('map-decals');
  if (mesh instanceof THREE.Mesh) (mesh.material as THREE.MeshLambertMaterial).map?.dispose();
}

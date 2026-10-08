import * as THREE from 'three';
import { POSTERS } from '../config/dressing';
import { SURFACES } from '../config/render';
import type { MapData, NeonSign } from '../map/mapTypes';
import { createRng, rngNext } from '../sim/rng';
import { type DecalQuad, decalBlocked } from './mapDecals';
import { floorUnder } from './dressingSpots';
import { neonPlate } from './neonDressing';

/**
 * Posters pasted on a city's street walls (G9, MapDressing.posters): in some 4 m bays of a wall standing on the street,
 * a row of two to four, paper with a print of colour blocks (no words, no brands), some with a corner torn off. Pure and
 * seeded; the geometry (posterGeometries) joins the junk mesh (render/dressingMeshes.ts). Flat on the wall a few
 * millimetres proud: look only. None where something stands within 0.3 m in front, over another picture (the decals,
 * the map's signs, the neon signs) or past its wall's end.
 */

const P = POSTERS;
const COPING = SURFACES.wallCoping;
/** A bay of wall, as G8's marks cut them (DRESSING.decals.bay). */
const BAY = 4;
/** Walls at least this tall get posters (a parapet or a rail does not). */
const MIN_WALL = 2.5;

/** A poster on a wall: its middle, its face's outward normal (axis, sign), its size, a number for its looks. */
export interface Poster {
  centre: [number, number, number];
  axis: 0 | 2;
  sign: 1 | -1;
  width: number;
  height: number;
  variant: number;
}

/** Whether two pictures on the same face overlap (with `pad` m round them). */
function sameFaceOverlap(a: Pick<DecalQuad, 'centre' | 'axis' | 'sign' | 'width' | 'height'>, b: Pick<DecalQuad, 'centre' | 'axis' | 'sign' | 'width' | 'height'>, pad: number): boolean {
  if (a.axis !== b.axis || a.sign !== b.sign || Math.abs(a.centre[a.axis] - b.centre[b.axis]) > 0.15) return false;
  const along: 0 | 2 = a.axis === 0 ? 2 : 0;
  return Math.abs(a.centre[along] - b.centre[along]) < (a.width + b.width) / 2 + pad && Math.abs(a.centre[1] - b.centre[1]) < (a.height + b.height) / 2 + pad;
}

/** A map sign or a neon sign as a picture on its face (for the overlap test). */
function signQuad(centre: { x: number; y: number; z: number }, facing: string, width: number, height: number): Pick<DecalQuad, 'centre' | 'axis' | 'sign' | 'width' | 'height'> | null {
  if (facing === '+y') return null;
  return { centre: [centre.x, centre.y, centre.z], axis: facing.endsWith('x') ? 0 : 2, sign: facing.startsWith('+') ? 1 : -1, width, height };
}

/** The posters a city's dressing asks for (`chance` a bay), clear of `taken` pictures (the decals already placed). */
export function placePosters(map: MapData, chance: number, seed: number, taken: readonly DecalQuad[], neon: readonly NeonSign[] = []): Poster[] {
  const rng = createRng(seed * 13 + 5);
  const out: Poster[] = [];
  const pictures = [
    ...taken.filter((q) => q.axis !== 1),
    ...(map.signs ?? []).flatMap((s) => signQuad(s.centre, s.facing, s.width, s.height) ?? []),
    ...neon.flatMap((s) => {
      const [w, h] = neonPlate(s);
      return signQuad(s.centre, s.facing, w, h) ?? [];
    }),
  ];
  const blocks = map.blocks;
  for (const b of blocks) {
    if (b.kind !== 'wall' || b.size.y < MIN_WALL) continue;
    const foot = b.center.y - b.size.y / 2;
    // Street level only: a wall standing on the lowest floor round it.
    if (foot > 0.05) continue;
    const thin: 0 | 2 = b.size.x <= b.size.z ? 0 : 2;
    const along: 0 | 2 = thin === 0 ? 2 : 0;
    const length = along === 0 ? b.size.x : b.size.z;
    const bays = Math.floor(length / BAY);
    if (bays < 1) continue;
    const half = (thin === 0 ? b.size.x : b.size.z) / 2;
    const mid = (a: 0 | 2): number => (a === 0 ? b.center.x : b.center.z);
    for (const sign of [1, -1] as const) {
      const face = mid(thin) + sign * (half - COPING.overhang + P.offset);
      const front = mid(thin) + sign * (half + 0.5);
      const probe = thin === 0 ? ([front, front, b.center.z, b.center.z] as const) : ([b.center.x, b.center.x, front, front] as const);
      for (let i = 0; i < bays; i++) {
        // Five draws a bay, whatever happens: one bay's outcome never shifts the next one's.
        const [u, uCount, uShift, uY, uLook] = [rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng), rngNext(rng)];
        if (u >= chance || !floorUnder(blocks, probe, foot)) continue;
        const count = P.perBay[0] + Math.floor(uCount * (P.perBay[1] - P.perBay[0] + 1));
        const widths = Array.from({ length: count }, (_, k) => P.width[0] + (((uLook * 7.13 + k * 0.389) % 1) * (P.width[1] - P.width[0])));
        const total = widths.reduce((s, w) => s + w, 0) + (count - 1) * P.gap;
        const bayLength = length / bays;
        if (total > bayLength - 0.6) continue;
        const bayStart = mid(along) - length / 2 + i * bayLength;
        let at = bayStart + 0.3 + uShift * (bayLength - 0.6 - total);
        const y = foot + P.y[0] + uY * (P.y[1] - P.y[0]);
        const row: Poster[] = [];
        for (const [k, w] of widths.entries()) {
          const h = w * 1.414;
          const centre: [number, number, number] = [0, y + ((k % 2) * 2 - 1) * 0.04, 0];
          centre[along] = at + w / 2;
          centre[thin] = face;
          at += w + P.gap;
          row.push({ centre, axis: thin, sign, width: w, height: h, variant: (uLook * 13.7 + k * 0.618) % 1 });
        }
        const fits = row.every(
          (q) =>
            q.centre[1] + q.height / 2 < foot + b.size.y - COPING.height - 0.05 &&
            !decalBlocked({ ...q, rect: [0, 0, 0, 0] }, blocks, b, 0.3) &&
            !pictures.some((t) => sameFaceOverlap(q, t, 0.1)) &&
            !out.some((t) => sameFaceOverlap(q, t, 0.02)),
        );
        if (fits) out.push(...row);
      }
    }
  }
  return out;
}

const pick = <T>(list: readonly T[], u: number): T => list[Math.floor(u * list.length) % list.length]!;

/** A flat rectangle on the poster's face: `x0..x1` across and `y0..y1` up in its own frame, `lift` m proud. */
function panel(x0: number, x1: number, y0: number, y1: number, lift: number): number[] {
  return [x0, y0, lift, x1, y0, lift, x1, y1, lift, x0, y0, lift, x1, y1, lift, x0, y1, lift];
}

const frame = new THREE.Matrix4();
const right = new THREE.Vector3();
const out3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * The posters' parts in the world: the paper (a corner torn off some) and its print, a millimetre over it, each a flat
 * part for `paint` (render/dressingMeshes.ts part).
 */
export function posterGeometries(posters: readonly Poster[], paint: (geo: THREE.BufferGeometry, hex: string, m: THREE.Matrix4) => THREE.BufferGeometry): THREE.BufferGeometry[] {
  const geos: THREE.BufferGeometry[] = [];
  for (const q of posters) {
    out3.set(0, 0, 0).setComponent(q.axis, q.sign);
    right.crossVectors(UP, out3);
    frame.makeBasis(right, UP, out3).setPosition(q.centre[0], q.centre[1], q.centre[2]);
    const v = q.variant;
    const w = q.width / 2;
    const h = q.height / 2;
    // The paper: torn across its top-right corner on a third of them.
    const torn = v < 0.33;
    const paper = torn ? [...panel(-w, w, -h, h * 0.55, 0), ...[-w, h * 0.55, 0, w, h * 0.55, 0, -w, h, 0], ...[w * 0.2, h, 0, -w, h, 0, w, h * 0.55, 0]] : panel(-w, w, -h, h, 0);
    geos.push(paint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(paper, 3)), pick(P.paper, v * 3.1), frame));
    // The print: a big block of colour and a band, in two inks; on some a dark title bar.
    const inkA = pick(P.inks, v * 5.3);
    const inkB = pick(P.inks, v * 5.3 + 0.37);
    geos.push(paint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(panel(-w * 0.82, w * 0.82, -h * 0.2, h * (torn ? 0.5 : 0.82), 0.001), 3)), inkA, frame));
    geos.push(paint(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(panel(-w * 0.82, w * 0.82, -h * 0.72, -h * 0.34, 0.001), 3)), inkB, frame));
  }
  return geos;
}

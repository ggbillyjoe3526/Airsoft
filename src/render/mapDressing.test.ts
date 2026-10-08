import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DRESSING, FIREFLIES, type JunkKind, KICKED_DUST, NEON, PLANE, POSTERS, STEAM, WOODS } from '../config/dressing';
import { SURFACES } from '../config/render';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { WOODLAND } from '../map/woodland';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { junkGeometries } from './dressingMeshes';
import { atlasRects, coveredAbove } from './mapDecals';
import { boxHitsBlock, clearSpots, floorUnder, frontRect, junkRect, placeDressing } from './mapDressing';

const D = SURFACES.decals;
const J = DRESSING.junk;
const BARE: MapData = { ...DEPOT };
delete BARE.dressing;
const layout = placeDressing(DEPOT);

/** A colour "reads as a team" if it is saturated and within 20° of hue of any team colour of any set (mapMeshes.test.ts). */
function readsAsTeam(c: THREE.Color): boolean {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.s < 0.3) return false;
  return Object.values(TEAM_COLOUR_SETS)
    .flatMap((s) => s.figures)
    .some((t) => {
      const th = { h: 0, s: 0, l: 0 };
      new THREE.Color(t).getHSL(th);
      const d = Math.abs(hsl.h - th.h) * 360;
      return Math.min(d, 360 - d) <= 20;
    });
}

/** Every colour in a config tree: '#rrggbb' strings, and numbers under a `colour` or `tint` key. */
function coloursIn(value: unknown, out: THREE.Color[] = [], key = ''): THREE.Color[] {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) out.push(new THREE.Color(value));
  else if (typeof value === 'number' && (key === 'colour' || key === 'tint')) out.push(new THREE.Color(value));
  else if (Array.isArray(value)) for (const v of value) coloursIn(v, out, key);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) coloursIn(v, out, k);
  return out;
}

describe('set dressing placement (G8)', () => {
  it('places nothing for a map without dressing; Woodland and Neon Heights now have one (G9)', () => {
    expect(placeDressing(BARE)).toEqual({ decals: [], junk: [], puddles: [], strips: [], fallen: [], leaves: [], posters: [], neon: [] });
    expect(WOODLAND.dressing).toBeDefined();
    expect(NEON_HEIGHTS.dressing).toBeDefined();
  });

  it('dresses Depot: dirt, junk, litter, logos, wall marks, every puddle and the strips', () => {
    const rects = (r: readonly (readonly number[])[]): number => layout.decals.filter((q) => r.some((x) => x.every((v, i) => v === q.rect[i]))).length;
    const c = atlasRects().dressing;
    const dressing = DEPOT.dressing!;
    expect(layout.junk.length).toBeGreaterThanOrEqual(20);
    expect(layout.junk.length).toBeLessThanOrEqual(J.max);
    expect(new Set(layout.junk.map((p) => p.kind)).size).toBeGreaterThanOrEqual(6);
    expect(layout.puddles.length).toBe(dressing.puddles!.length);
    expect(layout.strips.length).toBe(dressing.strips!.length);
    expect(rects(c.banks)).toBeGreaterThan(30);
    expect(rects(c.litter)).toBeGreaterThan(5);
    expect(rects(c.logos)).toBeGreaterThan(0);
    expect(rects([c.arrow, c.tag, c.warning])).toBeGreaterThan(2);
    // Sparse: the wall marks and logos are a handful, not a wallpaper.
    expect(rects([...c.logos, c.arrow, c.tag, c.warning])).toBeLessThan(25);
  });

  it('is deterministic: the same seed gives the same dressing, another seed another', () => {
    expect(placeDressing(DEPOT)).toEqual(layout);
    const other = placeDressing({ ...DEPOT, dressing: { ...DEPOT.dressing!, seed: DEPOT.dressing!.seed + 1 } });
    expect(other.junk).not.toEqual(layout.junk);
    expect(other.decals).not.toEqual(layout.decals);
  });

  it('keeps every loose piece low, against a face, on a floor, under nothing and out of the way', () => {
    const spots = clearSpots(DEPOT);
    expect(spots.length).toBeGreaterThan(20);
    for (const p of layout.junk) {
      const r = junkRect(p);
      const where = `${p.kind} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
      expect(p.height, where).toBeLessThanOrEqual(J.maxHeight);
      // Against a face: a block's side within `reach` behind its whole footprint.
      const back = (p.axis === 0 ? p.x : p.z) - p.sign * (p.out / 2 + J.standoff);
      const face = DEPOT.blocks.some((b) => {
        const c = p.axis === 0 ? b.center.x + p.sign * (b.size.x / 2) : b.center.z + p.sign * (b.size.z / 2);
        return b.kind !== 'floor' && Math.abs(c - back) < 1e-6 && b.center.y - b.size.y / 2 <= p.y + 1e-6;
      });
      expect(face, `${where}: against a face`).toBe(true);
      expect(J.standoff + p.out, where).toBeLessThanOrEqual(J.reach);
      const floor = floorUnder(DEPOT.blocks, r, p.y);
      expect(floor, `${where}: on a floor`).not.toBeNull();
      expect(coveredAbove(DEPOT.blocks, floor!, [r[0], r[2]], [r[1], r[3]], p.y, Infinity), `${where}: under nothing`).toBe(false);
      // A passage or doorway in front of it stays at least `openFront` wide.
      expect(boxHitsBlock(DEPOT.blocks, frontRect(p), p.y + 0.02, p.y + 2), `${where}: passage`).toBe(false);
      expect(J.openFront).toBeGreaterThanOrEqual(1.6);
      // Clear of every lane (by plan distance from its route) and every spawn, dead zone, the flag and Extraction spot.
      const cx = (r[0] + r[1]) / 2;
      const cz = (r[2] + r[3]) / 2;
      const reach = Math.hypot(r[1] - r[0], r[3] - r[2]) / 2;
      for (const lane of DEPOT.lanes) {
        for (let i = 0; i + 1 < lane.length; i++) {
          const a = lane[i]!;
          const b = lane[i + 1]!;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          for (let t = 0; t <= len; t += 0.05) {
            const x = a.x + ((b.x - a.x) * t) / len;
            const z = a.z + ((b.z - a.z) * t) / len;
            expect(Math.hypot(x - cx, z - cz) - reach, `${where}: lane`).toBeGreaterThanOrEqual(J.laneClear - 1e-6);
          }
        }
      }
      for (const s of spots) {
        const dx = Math.max(r[0] - s.x, 0, s.x - r[1]);
        const dz = Math.max(r[2] - s.z, 0, s.z - r[3]);
        expect(Math.hypot(dx, dz), `${where}: spot`).toBeGreaterThanOrEqual(J.pointClear + s.radius);
      }
    }
    // Spawns and the flag are among the spots kept clear.
    for (const team of DEPOT.spawns) for (const s of team) expect(spots.some((p) => p.x === s.position.x && p.z === s.position.z)).toBe(true);
    expect(spots.some((p) => p.x === DEPOT.flag!.x && p.z === DEPOT.flag!.z)).toBe(true);
  });

  it('draws every kind of junk inside its footprint and no taller than its height', () => {
    for (const kind of Object.keys(J.weights) as JunkKind[]) {
      const [along, out, height] = J.size[kind];
      expect(height, kind).toBeLessThanOrEqual(J.maxHeight);
      for (const variant of [0, 0.37, 0.99]) {
        const parts = junkGeometries([{ kind, x: 0, y: 0, z: 0, axis: 2, sign: 1, along, out, height, variant }]);
        const box = new THREE.Box3();
        for (const g of parts) {
          g.computeBoundingBox();
          box.union(g.boundingBox!);
          g.dispose();
        }
        expect(box.max.y, kind).toBeLessThanOrEqual(height + 1e-3);
        expect(box.min.y, kind).toBeGreaterThanOrEqual(-1e-3);
        expect(Math.max(-box.min.x, box.max.x), kind).toBeLessThanOrEqual(along / 2 + 1e-3);
        expect(Math.max(-box.min.z, box.max.z), kind).toBeLessThanOrEqual(out / 2 + 1e-3);
      }
    }
  });

  it('keeps every attached piece inside its block plus the decal offset, and every puddle on a floor under nothing', () => {
    const within = (c: [number, number, number], hw: [number, number, number]): boolean =>
      DEPOT.blocks.some((b) => {
        const s = [b.size.x / 2, b.size.y / 2, b.size.z / 2];
        const m = [b.center.x, b.center.y, b.center.z];
        return [0, 1, 2].every((a) => c[a]! - hw[a]! >= m[a]! - s[a]! - D.offset - 0.01 - 1e-6 && c[a]! + hw[a]! <= m[a]! + s[a]! + D.offset + 0.01 + 1e-6);
      });
    for (const s of layout.strips) {
      const horiz = s.facing === '+x' || s.facing === '-x' ? [0, s.height / 2, s.width / 2] : [s.width / 2, s.height / 2, 0];
      expect(within([s.centre.x, s.centre.y, s.centre.z], horiz as [number, number, number]), `strip at ${s.centre.x}, ${s.centre.z}`).toBe(true);
    }
    for (const q of layout.decals.filter((q) => q.axis !== 1)) {
      const hw: [number, number, number] = q.axis === 0 ? [0, q.height / 2, q.width / 2] : [q.width / 2, q.height / 2, 0];
      expect(within(q.centre, hw), `mark at ${q.centre.join(', ')}`).toBe(true);
    }
    for (const p of layout.puddles) {
      const r = [p.x - p.width / 2, p.x + p.width / 2, p.z - p.depth / 2, p.z + p.depth / 2] as const;
      const floor = floorUnder(DEPOT.blocks, r, p.y - DRESSING.puddles.lift);
      expect(floor).not.toBeNull();
      expect(coveredAbove(DEPOT.blocks, floor!, [r[0], r[2]], [r[1], r[3]], p.y - DRESSING.puddles.lift, Infinity)).toBe(false);
    }
  });

  it('uses no colour that reads as a team colour', () => {
    // G9: the woods' and the street's palettes and both new maps' dressings (their neon tubes and posters included).
    const colours = [
      ...coloursIn(DRESSING),
      ...coloursIn(WOODS),
      ...coloursIn(NEON),
      ...coloursIn(POSTERS),
      ...coloursIn(PLANE),
      ...coloursIn(FIREFLIES),
      ...coloursIn(STEAM),
      ...coloursIn(DEPOT.dressing),
      ...coloursIn(WOODLAND.dressing),
      ...coloursIn(NEON_HEIGHTS.dressing),
      new THREE.Color(KICKED_DUST.color),
    ];
    expect(colours.length).toBeGreaterThan(90);
    for (const c of colours) expect(readsAsTeam(c), `#${c.getHexString()}`).toBe(false);
    // Guard the guard.
    expect(readsAsTeam(new THREE.Color(0xf07c2a))).toBe(true);
  });
});

describe('junk facing junk (G8 critic)', () => {
  const overlap = (a: readonly number[], b: readonly number[]): boolean => a[0]! < b[1]! && b[0]! < a[1]! && a[2]! < b[3]! && b[2]! < a[3]!;

  it('never puts a piece in another piece\'s open front, on Depot\'s seed or any other', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const junk = placeDressing({ ...DEPOT, dressing: { ...DEPOT.dressing!, seed } }).junk;
      for (const p of junk) {
        for (const q of junk) {
          if (p !== q) expect(overlap(frontRect(p), junkRect(q)), `seed ${seed}: ${q.kind} in front of ${p.kind}`).toBe(false);
        }
      }
    }
  });
});

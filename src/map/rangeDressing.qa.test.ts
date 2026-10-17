import { describe, expect, it } from 'vitest';
import { RANGE } from '../config/range';
import { NAV } from '../config/nav';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { decalBlocked, decalQuads } from '../render/field/mapDecals';
import { placeDressing } from '../render/dressing/mapDressing';
import { createRangeTargets } from '../sim/rangeTargets';
import type { Vec3 } from '../sim/vec';
import type { MapBlock, MapData } from './mapTypes';
import { RANGE_MAP } from './range';
import { rangeBoardsClear, rangeProps } from './rangeDressing';

// M81: the range in the new look. Look-only dressing must stay off the distance boards, and the props off the lanes.
type Box = { center: Vec3; size: Vec3 };
const lo = (b: Box, a: 'x' | 'y' | 'z'): number => b.center[a] - b.size[a] / 2;
const hi = (b: Box, a: 'x' | 'y' | 'z'): number => b.center[a] + b.size[a] / 2;
const props = RANGE_MAP.blocks.filter((b) => b.kind !== 'wall' && b.kind !== 'floor');
const farthest = Math.max(...RANGE.distances);

/** A decal quad's footprint as a thin box reaching 0.1 m out from its centre along its normal (the quad sits a hair inside the wall face). */
function footprint(q: ReturnType<typeof decalQuads>[number]): Box {
  const [cx, cy, cz] = q.centre;
  const d = 0.1;
  const at = (c: number): number => c + (q.sign * d) / 2;
  if (q.axis === 0) return { center: { x: at(cx), y: cy, z: cz }, size: { x: d, y: q.height, z: q.width } };
  if (q.axis === 2) return { center: { x: cx, y: cy, z: at(cz) }, size: { x: q.width, y: q.height, z: d } };
  return { center: { x: cx, y: at(cy), z: cz }, size: { x: q.width, y: d, z: q.height } };
}
const overlap = (a: Box, b: Box): boolean => (['x', 'y', 'z'] as const).every((k) => lo(a, k) < hi(b, k) && hi(a, k) > lo(b, k));

describe('M81: the distance boards stay clear (keepClear)', () => {
  const clear = rangeBoardsClear();

  it('the range keeps a box round each board on both walls, at its distance', () => {
    expect(RANGE_MAP.keepClear).toHaveLength(RANGE.distances.length * 2);
    expect(clear.map((c) => c.center.z).sort()).toEqual(RANGE.distances.flatMap((d) => [-d, -d]).sort());
    expect(new Set(clear.map((c) => Math.sign(c.center.x)))).toEqual(new Set([-1, 1]));
    for (const c of clear) {
      expect(c.size.x).toBeGreaterThan(0);
      // against the wall: the box's far side is the wall's face
      expect(Math.abs(c.center.x) + c.size.x / 2).toBeCloseTo(RANGE.halfWidth, 6);
    }
  });

  it('no sign quad and no dressing decal overlaps any board box', () => {
    const quads = [...decalQuads(RANGE_MAP), ...placeDressing(RANGE_MAP).decals];
    expect(quads.length).toBeGreaterThan(0);
    for (const q of quads) for (const c of clear) expect(overlap(footprint(q), c), `quad at ${q.centre.join(',')}`).toBe(false);
  });

  it('without keepClear the same map does put something on a board (so the box is what clears it)', () => {
    const { keepClear: _drop, ...rest } = RANGE_MAP;
    const bare: MapData = rest;
    const quads = [...decalQuads(bare), ...placeDressing(bare).decals];
    const hit = quads.some((q) => clear.some((c) => overlap(footprint(q), c)));
    // The roundel sat over the 30 m board before M81; if the placement ever changes so nothing lands, the box guards nothing and this says so.
    expect(hit).toBe(true);
  });

  it('decalBlocked honours a clear box and ignores it when absent', () => {
    const wall = RANGE_MAP.blocks.find((b) => b.kind === 'wall')!;
    const q = { centre: [0, 1, 0] as [number, number, number], axis: 0 as const, sign: 1 as const, width: 1, height: 1, rect: [0, 0, 1, 1] as never };
    const box = [{ center: { x: 0.1, y: 1, z: 0 }, size: { x: 1, y: 1, z: 1 } }];
    expect(decalBlocked(q, [], wall, 0.3, box)).toBe(true);
    expect(decalBlocked(q, [], wall, 0.3, [])).toBe(false);
    expect(decalBlocked(q, [], wall, 0.3)).toBe(false);
  });
});

describe('M81: the props stand where nobody shoots', () => {
  it('there are real blocks beyond the walls and floor, including a sandbag berm', () => {
    expect(rangeProps().length).toBeGreaterThanOrEqual(4);
    expect(props.some((b) => b.kind === 'sandbags')).toBe(true);
    for (const p of rangeProps()) expect(RANGE_MAP.blocks).toContainEqual(p);
  });

  it('every prop is inside the walls and either behind the firing line or past the farthest target', () => {
    for (const b of props) {
      expect(lo(b, 'x'), b.kind).toBeGreaterThanOrEqual(-RANGE.halfWidth - 1e-6);
      expect(hi(b, 'x'), b.kind).toBeLessThanOrEqual(RANGE.halfWidth + 1e-6);
      const behind = lo(b, 'z') >= 0;
      const past = hi(b, 'z') <= -farthest;
      expect(behind || past, `${b.kind} z ${lo(b, 'z')}..${hi(b, 'z')}`).toBe(true);
      expect(hi(b, 'z'), b.kind).toBeLessThanOrEqual(RANGE.behindLine + 1e-6);
      expect(lo(b, 'z'), b.kind).toBeGreaterThanOrEqual(-RANGE.backstop - 1e-6);
    }
  });

  it('the berm lies at the backstop, past the farthest targets, across the width', () => {
    const berm = props.find((b) => b.kind === 'sandbags')!;
    expect(hi(berm, 'z')).toBeLessThan(-farthest);
    expect(lo(berm, 'z')).toBeCloseTo(-RANGE.backstop, 6);
    expect(berm.size.x).toBeCloseTo(2 * RANGE.halfWidth, 6);
  });

  it('no prop blocks the line of sight from the firing line (or your spawn) to any target', () => {
    const eyes = [0.5, 1.6];
    const spawn = RANGE_MAP.spawns[0][0]!.position;
    const origins = [-RANGE.halfWidth + 1, -5, 0, 5, RANGE.halfWidth - 1].map((x) => ({ x, z: 0 })).concat([{ x: spawn.x, z: spawn.z }]);
    const segmentHits = (b: MapBlock, o: { x: number; y: number; z: number }, t: { x: number; y: number; z: number }): boolean => {
      let t0 = 0;
      let t1 = 1;
      for (const a of ['x', 'y', 'z'] as const) {
        const d = t[a] - o[a];
        if (Math.abs(d) < 1e-9) {
          if (o[a] < lo(b, a) || o[a] > hi(b, a)) return false;
          continue;
        }
        const u0 = (lo(b, a) - o[a]) / d;
        const u1 = (hi(b, a) - o[a]) / d;
        t0 = Math.max(t0, Math.min(u0, u1));
        t1 = Math.min(t1, Math.max(u0, u1));
        if (t0 > t1) return false;
      }
      return true;
    };
    for (const target of createRangeTargets()) for (const o of origins) for (const y of eyes) {
      for (const ty of [0.3, 1.25]) {
        for (const b of props) {
          expect(segmentHits(b, { x: o.x, y, z: o.z }, { x: target.position.x, y: ty, z: target.position.z }), `${b.kind} on ${target.label} ${target.distance} m from x ${o.x}`).toBe(false);
        }
      }
    }
  });

  it('the spawn stays walkable and clear of every prop, and the walk to the line is open', () => {
    const nav = buildNavGrid(RANGE_MAP, NAV);
    const spawn = RANGE_MAP.spawns[0][0]!.position;
    expect(isWalkableAt(nav, spawn.x, spawn.y, spawn.z)).toBe(true);
    for (const b of props) {
      const near = spawn.x > lo(b, 'x') - 0.5 && spawn.x < hi(b, 'x') + 0.5 && spawn.z > lo(b, 'z') - 0.5 && spawn.z < hi(b, 'z') + 0.5;
      expect(near, `${b.kind} beside the spawn`).toBe(false);
    }
    for (let z = RANGE.spawnBack; z >= 0; z -= 0.5) expect(isWalkableAt(nav, 0, spawn.y, z), `z ${z}`).toBe(true);
  });
});

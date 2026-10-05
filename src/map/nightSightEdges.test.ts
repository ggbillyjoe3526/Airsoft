import { describe, expect, it } from 'vitest';
import { NIGHT_SIGHT } from '../config/bots';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import type { MapBlock, MapData } from './mapTypes';
import { mapUnderLighting } from './lightingChoice';
import { NEON_HEIGHTS } from './neonHeights';
import { buildNightField, groundUnder, inLight, nightSightRange, underRoof, type NightSightConfig } from './nightSight';
import { WOODLAND } from './woodland';

/**
 * M34e QA: the edges of the floor-aware pools and the indoor range (map/nightSight.ts): the exact ends of the roof
 * band, the grid's cell boundary, ramps overhead, pools with no floor under them, the order of the ranges, and
 * Woodland keeping its pools. nightSight.test.ts has the main behaviours.
 */

/** Whole numbers only, so the Float32 roof list holds them exactly and the band ends can be probed to the bit. */
const CFG: NightSightConfig = { ...NIGHT_SIGHT, roofFrom: 2, roofTo: 8, canopyCell: 1, poolBelow: 0.5, poolAbove: 2 };

/** A ground slab over x, z -10..10 (the grid starts at -10) and the given extra blocks, at night. */
const yard = (blocks: MapBlock[], lights: MapData['lights'] = []): MapData => ({
  ...OPEN_FIELD,
  blocks: [{ kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(20, 0.5, 20) }, ...blocks],
  night: true,
  lights,
});
/** A slab whose underside is `under` m over the ground, x 0..4 (cells 10..13 of the grid), thick 0.5. */
const slab = (under: number): MapBlock => ({ kind: 'wall', center: vec3(2, under + 0.25, 0), size: vec3(4, 0.5, 4) });
const trunk = (x: number, z: number): MapBlock => ({ kind: 'tree', center: vec3(x, 4.5, z), size: vec3(0.5, 9, 0.5) });

describe('the roof band ends (M34e)', () => {
  it('counts an underside exactly at roofFrom and exactly at roofTo, and not a hair either side', () => {
    const atFrom = buildNightField(yard([slab(CFG.roofFrom)]), CFG)!;
    const atTo = buildNightField(yard([slab(CFG.roofTo)]), CFG)!;
    expect(underRoof(atFrom, vec3(2, 0, 0))).toBe(true); // 2 m over the head: a low ceiling still counts
    expect(underRoof(atTo, vec3(2, 0, 0))).toBe(true); // 8 m: the last that counts
    const justUnder = buildNightField(yard([slab(CFG.roofFrom - 0.01)]), CFG)!;
    const justOver = buildNightField(yard([slab(CFG.roofTo + 0.01)]), CFG)!;
    expect(underRoof(justUnder, vec3(2, 0, 0))).toBe(false); // a table or a beam you could stand under
    expect(underRoof(justOver, vec3(2, 0, 0))).toBe(false); // a deck so high it hides nobody
  });

  it('measures the band from the feet, so a floor above counts for the player below it and not for the one standing on it', () => {
    const field = buildNightField(yard([slab(4)]), CFG)!;
    expect(underRoof(field, vec3(2, 0, 0))).toBe(true); // 4 m over the head
    expect(underRoof(field, vec3(2, 2, 0))).toBe(true); // a raised foot (a stair step): 2 m, still inside
    expect(underRoof(field, vec3(2, 2.1, 0))).toBe(false); // 1.9 m: under the band
    expect(underRoof(field, vec3(2, 4.5, 0))).toBe(false); // standing on it, in the open
    expect(nightSightRange(field, vec3(2, 4.5, 0))).toBe(CFG.open);
  });

  it('keeps the production band the way the tuning notes say: a head-high ceiling and nothing past the tallest atrium', () => {
    expect(NIGHT_SIGHT.roofFrom).toBeGreaterThan(1.7); // a standing player's height: a lower beam is no roof
    expect(NIGHT_SIGHT.roofFrom).toBeLessThan(3); // under a storey's slab
    expect(NIGHT_SIGHT.roofTo).toBeGreaterThan(6); // under two storeys' ceiling in the atrium
  });
});

describe('the roof grid (M34e)', () => {
  it('reads each cell by its centre, so the answer flips at the cell edge, not at the block edge', () => {
    // The slab spans x 0..4. Cells are 1 m from x = -10, so their centres are at ... -0.5, 0.5, ... 3.5, 4.5.
    const field = buildNightField(yard([slab(3)]), CFG)!;
    expect(underRoof(field, vec3(0.001, 0, 0))).toBe(true); // cell 0..1, centre 0.5, inside
    expect(underRoof(field, vec3(-0.001, 0, 0))).toBe(false); // cell -1..0, centre -0.5, outside
    expect(underRoof(field, vec3(3.999, 0, 0))).toBe(true);
    expect(underRoof(field, vec3(4.001, 0, 0))).toBe(false);
    // A block whose edge cuts a cell: the cell is in if its centre is.
    const odd = buildNightField(yard([{ kind: 'wall', center: vec3(1.2, 3.25, 0), size: vec3(2.4, 0.5, 4) }]), CFG)!; // x 0..2.4
    expect(underRoof(odd, vec3(1.9, 0, 0))).toBe(true); // cell 1..2, centre 1.5
    expect(underRoof(odd, vec3(2.3, 0, 0))).toBe(false); // cell 2..3, centre 2.5 is past the edge although x 2.3 is under the slab
  });

  it('covers the rows the same way along z and answers false off the grid on every side', () => {
    const field = buildNightField(yard([slab(3)]), CFG)!;
    expect(underRoof(field, vec3(2, 0, 1.9))).toBe(true);
    expect(underRoof(field, vec3(2, 0, 2.1))).toBe(false); // slab z -2..2
    for (const [x, z] of [[-10.5, 0], [10.5, 0], [0, -10.5], [0, 10.5], [-1e6, 1e6]] as const) expect(underRoof(field, vec3(x, 0, z)), `${x},${z}`).toBe(false);
  });
});

describe('roofs of several blocks and of ramps (M34e)', () => {
  it('skips an underside below the head and finds the roof above it in the same cell', () => {
    // A beam 1 m up (under the band) and a slab 4 m up over the same cell: the slab decides.
    const beam: MapBlock = { kind: 'wall', center: vec3(2, 1.25, 0), size: vec3(4, 0.5, 4) };
    const field = buildNightField(yard([beam, slab(4)]), CFG)!;
    expect(underRoof(field, vec3(2, 0, 0))).toBe(true);
    const onlyBeam = buildNightField(yard([beam]), CFG)!;
    expect(underRoof(onlyBeam, vec3(2, 0, 0))).toBe(false);
    // Standing on the beam (y 1.5), the slab is 2.5 m over: still indoors, by the slab alone.
    expect(underRoof(field, vec3(2, 1.5, 0))).toBe(true);
  });

  it('does not take a floor under the feet or a crate on the ground for a roof', () => {
    const crate: MapBlock = { kind: 'wall', center: vec3(2, 0.5, 0), size: vec3(1, 1, 1) };
    const field = buildNightField(yard([crate]), CFG)!;
    expect(underRoof(field, vec3(2, 0, 0))).toBe(false);
    expect(underRoof(field, vec3(2, 1, 0))).toBe(false); // standing on the crate
  });

  it('takes an elevated ramp for a roof over the ground beneath it, and not for the one walking up it', () => {
    // A ramp from y 3 up to 6 over x 0..6 (rise +x), flat underside at 3 m.
    const ramp: MapBlock = { kind: 'ramp', center: vec3(3, 4.5, 0), size: vec3(6, 3, 4), rise: '+x' };
    const field = buildNightField(yard([ramp]), CFG)!;
    expect(underRoof(field, vec3(1, 0, 0))).toBe(true); // under the low end
    expect(underRoof(field, vec3(5, 0, 0))).toBe(true); // and the high end: the underside is flat
    expect(nightSightRange(field, vec3(1, 0, 0))).toBe(CFG.indoor);
    // On the ramp (y 3.5 at x 1, 5.5 at x 5): the ramp is underfoot, nothing over it.
    expect(underRoof(field, vec3(1, 3.5, 0))).toBe(false);
    expect(underRoof(field, vec3(5, 5.5, 0))).toBe(false);
    // A ramp that starts on the ground has its underside at 0: it is no roof for anyone walking up it.
    const stairs: MapBlock = { kind: 'ramp', center: vec3(3, 1.5, 0), size: vec3(6, 3, 4), rise: '+x' };
    const walk = buildNightField(yard([stairs]), CFG)!;
    expect(underRoof(walk, vec3(3, 1.5, 0))).toBe(false);
    expect(underRoof(walk, vec3(1, 0.5, 0))).toBe(false);
  });
});

describe('pools with no floor, and the pool bands (M34e)', () => {
  it('lights every height inside a pool that has no walkable floor under it, and still only inside its radius', () => {
    // The yard's slab ends at x 10; the lamp hangs at x 30 with nothing under it: its floor is NaN.
    const map = yard([], [{ position: vec3(30, 2, 0), radius: 4, colour: 0xffffff }]);
    expect(groundUnder(map, 30, 0, 2)).toBeUndefined();
    const field = buildNightField(map, CFG)!;
    expect(Number.isNaN(field.lightFloors[0]!)).toBe(true);
    for (const y of [-5, 0, 2, 40]) expect(inLight(field, vec3(30, y, 0)), `y ${y}`).toBe(true);
    expect(inLight(field, vec3(34.5, 0, 0))).toBe(false); // past the radius
    expect(nightSightRange(field, vec3(31, 0, 0))).toBe(CFG.lit);
  });

  it('takes the ground under a lamp for its floor, never a floor above the lamp', () => {
    // A floor 4.5 m over the lamp is above it (h > below): it does not count.
    const map = yard([{ kind: 'floor', center: vec3(-5, 6.75, -5), size: vec3(4, 0.5, 4) }], [{ position: vec3(-5, 2, -5), radius: 3, colour: 0xffffff }]);
    const field = buildNightField(map, CFG)!;
    expect(field.lightFloors[0]).toBe(0); // the ground slab under it, not the roof
    expect(inLight(field, vec3(-5, 0, -5))).toBe(true);
    expect(inLight(field, vec3(-5, 7, -5))).toBe(false); // the floor above it
  });

  it('lights up to exactly poolAbove over the floor and down to exactly poolBelow under it, on a raised floor too', () => {
    const upper: MapData = yard([{ kind: 'floor', center: vec3(0, 3, 0), size: vec3(6, 0.5, 6) }], [{ position: vec3(0, 5.5, 0), radius: 3, colour: 0xffffff }]);
    const field = buildNightField(upper, CFG)!;
    expect(field.lightFloors[0]).toBe(3.25);
    expect(inLight(field, vec3(0, 3.25 + CFG.poolAbove, 0))).toBe(true);
    expect(inLight(field, vec3(0, 3.25 + CFG.poolAbove + 0.01, 0))).toBe(false);
    expect(inLight(field, vec3(0, 3.25 - CFG.poolBelow, 0))).toBe(true);
    expect(inLight(field, vec3(0, 3.25 - CFG.poolBelow - 0.01, 0))).toBe(false);
    expect(inLight(field, vec3(0, 0, 0))).toBe(false); // the ground under the raised floor
  });

  it('tests the next pool when the first is on another floor, so overlapping pools light both floors', () => {
    const map = yard(
      [{ kind: 'floor', center: vec3(0, 3, 0), size: vec3(6, 0.5, 6) }],
      [
        { position: vec3(0, 2.5, 0), radius: 3, colour: 0xffffff },
        { position: vec3(0, 5.5, 0), radius: 3, colour: 0xffffff },
      ],
    );
    const field = buildNightField(map, CFG)!;
    expect(inLight(field, vec3(0, 0, 0))).toBe(true); // by the first pool
    expect(inLight(field, vec3(0, 3.25, 0))).toBe(true); // by the second, after the first said no
    expect(inLight(field, vec3(0, 2.8, 0))).toBe(true); // past the first pool's band (floor + 2), inside the second's (floor 3.25 - 0.5)
    expect(inLight(field, vec3(0, 2.4, 0))).toBe(false); // between the two bands: lit by neither
  });

  it('lights a pool on a hill at the terrain under it (Woodland keeps every pool it had)', () => {
    const field = buildNightField(WOODLAND, NIGHT_SIGHT)!;
    expect(field.lights.length).toBeGreaterThanOrEqual(5);
    field.lights.forEach((l, i) => {
      const floor = field.lightFloors[i]!;
      expect(Number.isFinite(floor), `pool ${i} has ground under it`).toBe(true);
      expect(inLight(field, vec3(l.position.x, floor, l.position.z)), `pool ${i} lights the ground at its foot`).toBe(true);
      expect(nightSightRange(field, vec3(l.position.x + l.radius * 0.5, floor, l.position.z)), `pool ${i}`).toBe(NIGHT_SIGHT.lit);
    });
  });
});

describe('the order of the ranges (M34e)', () => {
  it('prefers the light over the roof and the canopy, then the canopy over the roof, then the roof over the open', () => {
    // A roofed corner of the yard with a lamp under it, and a clump of trunks under the same slab.
    const clump = [trunk(-5, -5), trunk(-4, -5), trunk(-5, -4), trunk(-4, -4)];
    const map = yard([slab(3), { kind: 'wall', center: vec3(-4.5, 3.25, -4.5), size: vec3(4, 0.5, 4) }, ...clump], [{ position: vec3(2, 2.5, 0), radius: 1.5, colour: 0xffffff }]);
    const field = buildNightField(map, CFG)!;
    expect(underRoof(field, vec3(2, 0, 0))).toBe(true);
    expect(nightSightRange(field, vec3(2, 0, 0))).toBe(CFG.lit); // roofed and lit: lit
    expect(nightSightRange(field, vec3(3.8, 0, 0))).toBe(CFG.indoor); // roofed, outside the pool
    expect(underRoof(field, vec3(-4.5, 0, -4.5))).toBe(true);
    expect(nightSightRange(field, vec3(-4.5, 0, -4.5))).toBe(CFG.canopy); // roofed and under the trees: the trees' 10 m
    expect(nightSightRange(field, vec3(8, 0, 8))).toBe(CFG.open);
  });

  it('holds the ranges in the order lit > open > indoor > canopy in production', () => {
    expect(NIGHT_SIGHT.lit).toBe(40);
    expect(NIGHT_SIGHT.open).toBe(25);
    expect(NIGHT_SIGHT.indoor).toBe(15);
    expect(NIGHT_SIGHT.canopy).toBe(10);
  });
});

describe('degenerate maps and positions (M34e)', () => {
  it('builds a field for a night map with no blocks: no roofs, no canopy, pools without a floor light every height', () => {
    const map: MapData = { ...OPEN_FIELD, blocks: [], night: true, lights: [{ position: vec3(0, 2, 0), radius: 3, colour: 0xffffff }] };
    const field = buildNightField(map, NIGHT_SIGHT)!;
    expect(field.roofStart).toHaveLength(1);
    expect(field.roofs).toHaveLength(0);
    expect(underRoof(field, vec3(0, 0, 0))).toBe(false);
    expect(nightSightRange(field, vec3(0, 7, 1))).toBe(NIGHT_SIGHT.lit);
    expect(nightSightRange(field, vec3(9, 0, 9))).toBe(NIGHT_SIGHT.open);
  });

  it('answers the open range, without throwing, for a position that is not a number', () => {
    const field = buildNightField(yard([slab(3)], [{ position: vec3(-5, 2, -5), radius: 2, colour: 0xffffff }]), CFG)!;
    expect(() => nightSightRange(field, vec3(Number.NaN, 0, 0))).not.toThrow();
    expect(underRoof(field, vec3(Number.NaN, 0, 0))).toBe(false);
    expect(underRoof(field, vec3(2, Number.NaN, 0))).toBe(false);
    expect(nightSightRange(field, vec3(2, Number.NaN, Number.NaN))).toBe(CFG.open);
    expect(inLight(field, vec3(-5, Number.NaN, -5))).toBe(false); // a floor, so a NaN height is on none
  });

  it('is built once with lists as long as its grid (the CSR list closes on the last cell)', () => {
    const field = buildNightField(yard([slab(3), slab(5)]), CFG)!;
    expect(field.roofStart).toHaveLength(field.cols * field.rows + 1);
    expect(field.roofStart[field.cols * field.rows]).toBe(field.roofs.length);
    for (let c = 0; c < field.cols * field.rows; c++) expect(field.roofStart[c + 1]!).toBeGreaterThanOrEqual(field.roofStart[c]!);
    // Lowest first within a cell: the ground slab's own underside (-0.5), then the slab at 3 m, then the one at 5.
    const start = field.roofStart[Math.floor(0 - field.minZ) * field.cols + Math.floor(2 - field.minX)]!;
    expect([...field.roofs.slice(start, start + 3)]).toEqual([-0.5, 3, 5]);
    expect(field.roofStart[Math.floor(0 - field.minZ) * field.cols + Math.floor(2 - field.minX) + 1]! - start).toBe(3);
  });

  it('is null under Day for a two-light map, and the picked light sets which of its field exists', () => {
    expect(buildNightField(mapUnderLighting(NEON_HEIGHTS, 'day'), NIGHT_SIGHT)).toBeNull();
    expect(buildNightField(mapUnderLighting(NEON_HEIGHTS, 'night'), NIGHT_SIGHT)).not.toBeNull();
  });
});

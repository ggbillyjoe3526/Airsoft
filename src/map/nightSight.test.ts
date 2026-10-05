import { describe, expect, it } from 'vitest';
import { NIGHT_SIGHT } from '../config/bots';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { DEPOT } from './depot';
import type { MapBlock, MapData } from './mapTypes';
import { buildNightField, inLight, nightSightRange, underCanopy, underRoof } from './nightSight';
import { terrainHeightAt, terrainMaxX, terrainMaxZ } from './terrain';
import { WOODLAND } from './woodland';

const trunk = (x: number, z: number): MapBlock => ({ kind: 'tree', center: vec3(x, 4.5, z), size: vec3(0.5, 9, 0.5) });
/** An open field at night with a clump of four trunks round (10, 10) and a lantern at (-10, -10). */
const NIGHT_YARD: MapData = {
  ...OPEN_FIELD,
  blocks: [...OPEN_FIELD.blocks, trunk(9, 9), trunk(11, 9), trunk(9, 11), trunk(11, 11), trunk(30, 30)],
  night: true,
  lights: [{ position: vec3(-10, 2, -10), radius: 5, colour: 0xffd27a }],
};

/**
 * Two floors (M34e): the ground, a slab over x -5..15 whose top is at 3.25 m (underside 2.75 m), a sky-high deck over
 * x 20..24 (underside 12 m), a lamp under the slab at (0, 2.5, 0) and one over it at (10, 5.5, 0).
 */
const STACKED: MapData = {
  ...OPEN_FIELD,
  blocks: [
    ...OPEN_FIELD.blocks,
    { kind: 'floor', center: vec3(5, 3, 0), size: vec3(20, 0.5, 10) },
    { kind: 'wall', center: vec3(22, 12.25, 0), size: vec3(4, 0.5, 4) },
    trunk(30, 0),
  ],
  night: true,
  lights: [
    { position: vec3(0, 2.5, 0), radius: 3, colour: 0xffffff },
    { position: vec3(10, 5.5, 0), radius: 3, colour: 0xffffff },
  ],
};

describe('night sight on floors (M34e)', () => {
  it('lights the whole ground of every Woodland pool, uphill and downhill of the light (on terrain the floor is the ground underfoot)', () => {
    const field = buildNightField(WOODLAND, NIGHT_SIGHT)!;
    const t = WOODLAND.terrain!;
    for (const [i, l] of WOODLAND.lights!.entries()) {
      let samples = 0;
      for (let dx = -l.radius; dx <= l.radius; dx += 0.25) {
        for (let dz = -l.radius; dz <= l.radius; dz += 0.25) {
          if (dx * dx + dz * dz > l.radius * l.radius * 0.999) continue;
          const x = l.position.x + dx;
          const z = l.position.z + dz;
          if (x < t.minX || z < t.minZ || x > terrainMaxX(t) || z > terrainMaxZ(t)) continue;
          samples++;
          expect(inLight(field, vec3(x, terrainHeightAt(t, x, z)!, z)), `pool ${i} at (${x}, ${z})`).toBe(true);
        }
      }
      expect(samples, `pool ${i}`).toBeGreaterThan(100);
    }
  });

  it('lights only the floor a pool hangs over, not the one above or below', () => {
    const field = buildNightField(STACKED, NIGHT_SIGHT)!;
    expect(inLight(field, vec3(0, 0, 0))).toBe(true);
    expect(inLight(field, vec3(0, 3.25, 0))).toBe(false); // on the slab, over the lower lamp
    expect(inLight(field, vec3(10, 3.25, 0))).toBe(true);
    expect(inLight(field, vec3(10, 0, 0))).toBe(false); // under the slab, below the upper lamp
  });

  it('makes an unlit spot under a floor or roof indoors-dark, and a lit one lit', () => {
    const field = buildNightField(STACKED, NIGHT_SIGHT)!;
    expect(underRoof(field, vec3(10, 0, 0))).toBe(true);
    expect(nightSightRange(field, vec3(10, 0, 0))).toBe(NIGHT_SIGHT.indoor);
    expect(NIGHT_SIGHT.indoor).toBeLessThan(NIGHT_SIGHT.open);
    expect(NIGHT_SIGHT.indoor).toBeGreaterThan(NIGHT_SIGHT.canopy);
    expect(nightSightRange(field, vec3(0, 0, 0))).toBe(NIGHT_SIGHT.lit);
    expect(nightSightRange(field, vec3(5, 3.25, 0))).toBe(NIGHT_SIGHT.open); // on the slab, open sky
  });

  it('counts an underside exactly at roofFrom over the feet (heights kept in full precision)', () => {
    const map: MapData = { ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, { kind: 'floor', center: vec3(0, NIGHT_SIGHT.roofFrom + 0.15, 0), size: vec3(4, 0.3, 4) }], night: true };
    expect(underRoof(buildNightField(map, NIGHT_SIGHT)!, vec3(0, 0, 0))).toBe(true);
  });

  it('takes no roof from a deck far overhead, a tree, the floor underfoot or off the map', () => {
    const field = buildNightField(STACKED, NIGHT_SIGHT)!;
    expect(underRoof(field, vec3(22, 0, 0))).toBe(false); // 12 m up: past roofTo
    expect(underRoof(field, vec3(30, 0, 0))).toBe(false); // a trunk is no roof
    expect(underRoof(field, vec3(5, 3.25, 0))).toBe(false); // the slab is underfoot
    expect(underRoof(field, vec3(500, 0, 500))).toBe(false);
    expect(nightSightRange(field, vec3(22, 0, 0))).toBe(NIGHT_SIGHT.open);
  });
});

describe('night sight (M33g)', () => {
  it('is null by day: Depot and any map without `night` keep daylight sight', () => {
    expect(buildNightField(DEPOT, NIGHT_SIGHT)).toBeNull();
    expect(buildNightField(OPEN_FIELD, NIGHT_SIGHT)).toBeNull();
  });

  it('sees someone in a light pool as far as by day, in the open by moonlight, and under the trees only close up', () => {
    const field = buildNightField(NIGHT_YARD, NIGHT_SIGHT)!;
    expect(nightSightRange(field, vec3(-12, 0, -8))).toBe(NIGHT_SIGHT.lit);
    expect(nightSightRange(field, vec3(0, 0, 0))).toBe(NIGHT_SIGHT.open);
    expect(nightSightRange(field, vec3(10, 0, 10))).toBe(NIGHT_SIGHT.canopy);
    expect(NIGHT_SIGHT.lit).toBeGreaterThan(NIGHT_SIGHT.open);
    expect(NIGHT_SIGHT.open).toBeGreaterThan(NIGHT_SIGHT.canopy);
  });

  it('counts the light pool by its radius across the floor under it, whatever the height of the light itself', () => {
    const field = buildNightField(NIGHT_YARD, NIGHT_SIGHT)!;
    expect(inLight(field, vec3(-10 + 4.9, 0, -10))).toBe(true);
    expect(inLight(field, vec3(-10 + 5.1, 0, -10))).toBe(false);
    expect(inLight(field, vec3(-10, NIGHT_SIGHT.poolAbove, -10))).toBe(true); // jumping
    expect(inLight(field, vec3(-10, NIGHT_SIGHT.poolAbove + 0.5, -10))).toBe(false); // a floor above
  });

  it('needs enough trunks close together for a canopy: a lone tree casts none', () => {
    const field = buildNightField(NIGHT_YARD, NIGHT_SIGHT)!;
    expect(underCanopy(field, vec3(10, 0, 10))).toBe(true);
    expect(underCanopy(field, vec3(30, 0, 30))).toBe(false);
    expect(underCanopy(field, vec3(10 + NIGHT_SIGHT.canopyRadius + 2, 0, 10))).toBe(false);
    expect(underCanopy(field, vec3(500, 0, 500))).toBe(false); // off the map
  });

  it("gives Woodland its fires and lanterns, dark woods and a moonlit meadow", () => {
    const field = buildNightField(WOODLAND, NIGHT_SIGHT)!;
    expect(field.lights.length).toBeGreaterThanOrEqual(5);
    const flag = WOODLAND.flag!;
    expect(nightSightRange(field, flag)).toBe(NIGHT_SIGHT.lit); // the fort's lanterns light the flag
    // The meadow's middle lane is moonlit; the Pine Belt (plan z 62–80, world z −22 to −40) is mostly under the trees.
    const meadow = WOODLAND.lanes[1]!;
    expect(nightSightRange(field, meadow[Math.floor(meadow.length / 2)]!)).toBe(NIGHT_SIGHT.open);
    let dark = 0;
    let total = 0;
    for (let x = -55; x <= 55; x += 2) {
      for (let z = -38; z <= -24; z += 2) {
        total++;
        if (underCanopy(field, vec3(x, 0, z))) dark++;
      }
    }
    expect(dark / total).toBeGreaterThan(0.3);
  });
});

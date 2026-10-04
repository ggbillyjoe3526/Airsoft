import { describe, expect, it } from 'vitest';
import { NIGHT_SIGHT } from '../config/bots';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { DEPOT } from './depot';
import type { MapBlock, MapData } from './mapTypes';
import { buildNightField, inLight, nightSightRange, underCanopy } from './nightSight';
import { WOODLAND } from './woodland';

const trunk = (x: number, z: number): MapBlock => ({ kind: 'tree', center: vec3(x, 4.5, z), size: vec3(0.5, 9, 0.5) });
/** An open field at night with a clump of four trunks round (10, 10) and a lantern at (-10, -10). */
const NIGHT_YARD: MapData = {
  ...OPEN_FIELD,
  blocks: [...OPEN_FIELD.blocks, trunk(9, 9), trunk(11, 9), trunk(9, 11), trunk(11, 11), trunk(30, 30)],
  night: true,
  lights: [{ position: vec3(-10, 2, -10), radius: 5, colour: 0xffd27a }],
};

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

  it('counts the light pool by its radius on the ground, whatever the height', () => {
    const field = buildNightField(NIGHT_YARD, NIGHT_SIGHT)!;
    expect(inLight(field, vec3(-10 + 4.9, 5, -10))).toBe(true);
    expect(inLight(field, vec3(-10 + 5.1, 0, -10))).toBe(false);
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

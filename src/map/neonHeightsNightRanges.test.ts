import { describe, expect, it } from 'vitest';
import { NIGHT_SIGHT } from '../config/bots';
import { vec3 } from '../sim/vec';
import { mapUnderLighting } from './lightingChoice';
import { NEON_HEIGHTS, NEON_HEIGHTS_LAYOUT } from './neonHeights';
import { buildNightField, nightSightRange } from './nightSight';

/**
 * M34e QA (acceptance 4): what a player on Neon Heights' street floor and its upper floors is seen from by Night, over the
 * whole field. neonHeightsNight.test.ts pins the named places; this samples the lot, so a lamp moved or a roof opened
 * shows up as a change in the shares.
 */

const field = buildNightField(mapUnderLighting(NEON_HEIGHTS, 'night'), NIGHT_SIGHT)!;
const { storey } = NEON_HEIGHTS_LAYOUT;

/** Share of walkable samples at feet height `y` (every floor block's top there) by range. */
function shares(y: number): { lit: number; open: number; indoor: number; canopy: number; n: number } {
  const out = { lit: 0, open: 0, indoor: 0, canopy: 0, n: 0 };
  for (const b of NEON_HEIGHTS.blocks) {
    if (b.kind !== 'floor' || Math.abs(b.center.y + b.size.y / 2 - y) > 0.01) continue;
    for (let x = b.center.x - b.size.x / 2 + 0.5; x < b.center.x + b.size.x / 2; x += 1) {
      for (let z = b.center.z - b.size.z / 2 + 0.5; z < b.center.z + b.size.z / 2; z += 1) {
        const r = nightSightRange(field, vec3(x, y, z));
        out.n++;
        if (r === NIGHT_SIGHT.lit) out.lit++;
        else if (r === NIGHT_SIGHT.open) out.open++;
        else if (r === NIGHT_SIGHT.indoor) out.indoor++;
        else out.canopy++;
      }
    }
  }
  return out;
}

describe('Neon Heights by Night, over the whole field (M34e)', () => {
  it('has lit, moonlit and dark-indoor ground on the street floor, and no tree canopy anywhere', () => {
    const s = shares(0);
    expect(s.n).toBeGreaterThan(500);
    expect(s.lit).toBeGreaterThan(0);
    expect(s.open).toBeGreaterThan(0);
    expect(s.indoor).toBeGreaterThan(0);
    expect(s.canopy).toBe(0);
    // Most of the street is not in a pool (a lit avenue, not a lit city), and some of it is lit.
    expect(s.lit / s.n).toBeGreaterThan(0.05);
    expect(s.lit / s.n).toBeLessThan(0.3);
  });

  it('leaves the lit pools on the street floor, the Studio and the Tower gallery only (the lamps hang there)', () => {
    const levels = new Set(NEON_HEIGHTS.lights!.map((_, i) => Math.round(field.lightFloors[i]! / storey)));
    expect([...levels].sort()).toEqual([0, 2]);
    // Level 1 floors (3 m up) have no lamp: whatever is lit there comes from nothing, so nothing is.
    const one = shares(storey);
    expect(one.n).toBeGreaterThan(100);
    expect(one.lit).toBe(0);
    // Level 1 is rooms and stairwells under Level 2: nearly all of it dark indoors, a little moonlit on balconies.
    expect(one.indoor / one.n).toBeGreaterThan(0.7);
    // Level 2 has its two lit rooms among dark ones.
    const two = shares(2 * storey);
    expect(two.lit).toBeGreaterThan(0);
    expect(two.indoor).toBeGreaterThan(two.lit);
  });
});

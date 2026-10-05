import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { NEON_HEIGHTS, NEON_HEIGHTS_LAYOUT } from './neonHeights';

/**
 * Neon Heights' Extraction data (M48): vertical loot (plan, section 6). The checks every map's data gets are in
 * extractionData.test.ts and extractionRegens.test.ts; these are the city's own.
 */
const X = NEON_HEIGHTS.extraction!;
const S = NEON_HEIGHTS_LAYOUT.storey;
/** A floor point's storey: 0 the street, 1 Level 1, 2 Level 2. */
const storeyOf = (y: number): number => Math.round(y / S);

describe('Neon Heights Extraction data (M48)', () => {
  it('runs 10 minutes against 3, 4 or 5 opponents at once, two more than the squad', () => {
    expect(X.runTime).toBe(10 * 60);
    expect([1, 2, 3].map((squad) => X.baseOpponents + squad)).toEqual([3, 4, 5]);
    expect(EXTRACTION.maxSquad).toBe(3);
  });

  it('keeps the marshal’s locker on Level 2 and the exits on the street', () => {
    const lockers = X.cases.filter((c) => c.kinds.includes('locker'));
    expect(lockers.length).toBeGreaterThanOrEqual(2);
    for (const l of lockers) expect(storeyOf(l.position.y), JSON.stringify(l.position)).toBe(2);
    for (const e of X.exits) expect(e.position.y, e.name).toBe(0);
  });

  it('spreads the cases over every storey, field cases above the street', () => {
    for (const storey of [0, 1, 2]) expect(X.cases.some((c) => storeyOf(c.position.y) === storey), `storey ${storey}`).toBe(true);
    const upstairs = X.cases.filter((c) => c.kinds.includes('field-case') && storeyOf(c.position.y) > 0);
    expect(upstairs.length).toBeGreaterThanOrEqual(4);
    // Every case spot stands on a storey's floor, not part way up a stair.
    for (const c of X.cases) expect(c.position.y, JSON.stringify(c.position)).toBe(storeyOf(c.position.y) * S);
  });

  it('has regen points and opponent starts on more than one storey, so a wave can come down on the squad', () => {
    expect(new Set(X.regens.map((r) => storeyOf(r.position.y))).size).toBe(3);
    expect(new Set(X.opponentStarts.map((r) => storeyOf(r.position.y))).size).toBe(3);
  });

  it('keeps every case spot off the stair flights, whichever floor it is on', () => {
    for (const c of X.cases) {
      for (const l of NEON_HEIGHTS_LAYOUT.links) {
        const [x0, x1, z0, z1] = l.area;
        const inside = c.position.x >= x0 && c.position.x <= x1 && c.position.z >= z0 && c.position.z <= z1;
        expect(inside, `${JSON.stringify(c.position)} in ${l.name}`).toBe(false);
      }
    }
  });
});

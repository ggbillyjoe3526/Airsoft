import { describe, expect, it } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { WOODLAND } from './woodland';

/**
 * Woodland's Extraction data (M48). The checks every map's data gets (walkable, reachable, regen points out of sight)
 * are in extractionData.test.ts and extractionRegens.test.ts; these are Woodland's own.
 */
const X = WOODLAND.extraction!;
/** No insertion within this of a spot the marshal's locker can stand on: its guards would be on the squad as it starts. */
const LOCKER_CLEAR = 30;

describe('Woodland Extraction data (M48)', () => {
  it('runs 15 minutes against 4, 5 or 6 opponents at once, three more than the squad', () => {
    expect(X.runTime).toBe(15 * 60);
    expect([1, 2, 3].map((squad) => X.baseOpponents + squad)).toEqual([4, 5, 6]);
    expect(EXTRACTION.maxSquad).toBe(3);
  });

  it('puts the marshal’s locker in the cabin or the fort and never sends the squad in beside either', () => {
    const lockers = X.cases.filter((c) => c.kinds.includes('locker'));
    expect(lockers.length).toBeGreaterThanOrEqual(2);
    for (const ins of X.insertions) {
      for (const s of ins.spawns) {
        for (const l of lockers) expect(Math.hypot(s.position.x - l.position.x, s.position.z - l.position.z), `${ins.name} to ${JSON.stringify(l.position)}`).toBeGreaterThan(LOCKER_CLEAR);
      }
    }
  });

  it('keeps every case spot and exit out of the bushes, where nobody would see them', () => {
    for (const b of WOODLAND.foliage!) {
      for (const c of X.cases) expect(Math.hypot(b.x - c.position.x, b.z - c.position.z), JSON.stringify(c.position)).toBeGreaterThan(b.radius);
      for (const e of X.exits) expect(Math.hypot(b.x - e.position.x, b.z - e.position.z), e.name).toBeGreaterThan(b.radius + e.radius);
    }
  });

  it('opens a late exit from either insertion that is not the one by its own start', () => {
    for (const ins of X.insertions) {
      const far = X.exits.filter((e) => e.late && ins.spawns.every((s) => Math.hypot(s.position.x - e.position.x, s.position.z - e.position.z) >= EXTRACTION.minExitDistance));
      expect(far.length, ins.name).toBeGreaterThanOrEqual(1);
    }
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { DEPOT } from '../map/depot';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { setUpRun } from './extractionRunSupport';

/**
 * The headless run harness (M48) plays a map as the game does: its bots see by the map's own light and bushes, so a
 * balance run on Woodland is a night run with Woodland's bushes, and one on Depot a daylight run in the open.
 */
describe('extraction run harness sight (M48)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('gives the bots the map’s night and bushes: Woodland and Neon Heights by night with their bushes, Depot by day', () => {
    for (const [map, night] of [[WOODLAND, true], [NEON_HEIGHTS, true], [DEPOT, false]] as const) {
      const r = setUpRun({ seed: 1, map });
      const sight = r.bots.worldForTests.sight!;
      expect(sight.night !== null, map.name).toBe(night);
      expect(sight.torches !== null, `${map.name} torches`).toBe(night);
      expect(sight.foliage, `${map.name} bushes`).toEqual(map.foliage ?? []);
      r.dispose();
    }
    expect(WOODLAND.foliage!.length).toBeGreaterThan(0);
  });
});

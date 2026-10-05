import { beforeAll, describe, expect, it } from 'vitest';
import { DEPOT } from '../map/depot';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { lightInHand } from '../sim/torch';
import { setUpRun } from './extractionRunSupport';

/**
 * The headless run harness (M48) plays a map as the game does: its bots see by the map's own light and bushes, so a
 * balance run on Woodland is a night run with Woodland's bushes, and one on Depot a daylight run in the open. On a night
 * field every bot carries the weapon torch, as the match build fits it (M57, audit AI-02); by day none does.
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
      // You (by hand, not a bot) carry your own kit; every bot carries the torch at night.
      const lit = r.state.characters.filter((c) => lightInHand(c) !== null);
      expect(lit.length, `${map.name} bots with a torch`).toBe(night ? r.state.characters.length - 1 : 0);
      expect(lit.includes(r.you), `${map.name}: you`).toBe(false);
      r.dispose();
    }
    // A bot playing the runner carries one too.
    const r = setUpRun({ seed: 1, map: WOODLAND, runnerBot: true });
    expect(r.state.characters.every((c) => lightInHand(c) !== null)).toBe(true);
    r.dispose();
    expect(WOODLAND.foliage!.length).toBeGreaterThan(0);
  });
});

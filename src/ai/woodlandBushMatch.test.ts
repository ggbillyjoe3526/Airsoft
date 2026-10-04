import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { foliageDepth } from '../map/foliage';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { isInPlay } from '../sim/elimination';
import { type Vec3, vec3 } from '../sim/vec';
import { playMatch } from './depotMatchSupport';
import { bodyPoint, eyeOf, visiblePart } from './perception';

/**
 * M33e QA, acceptance 1 and 5 together: a 4v4 bot match on the real Woodland, its 70 bushes in the bots' world. Every
 * tick (a few in a row sampled) each bot's sight of each enemy is checked against the bushes: no bot has a target in
 * view through more than foliageSeeThrough of leaves unless it is within closeAwareness, and the bushes do hide people
 * from bots in the match (it is not a test that passes because no bush is ever in the way).
 */
const TEAM_SIZE = 4;
const SAMPLE_EVERY = 6;

describe('a 4v4 bot match on Woodland with its bushes (M33e, acceptances 1 and 5)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('bots never see through bush deeper than foliageSeeThrough, bushes hide enemies from them in play, and rounds still finish', { timeout: 45_000 }, () => {
    const bushes = WOODLAND.foliage!;
    expect(bushes.length).toBeGreaterThanOrEqual(50);
    let sampled = 0;
    let hiddenByBush = 0;
    let worstDepth = 0;
    const eye = vec3();
    const point = vec3();
    const stats = playMatch(150, 2, undefined, BOTS, 'elimination', ROUNDS, WOODLAND, TEAM_SIZE, HITS, (state, controller) => {
      if (state.tick % SAMPLE_EVERY !== 0 || state.round.phase !== 'live') return;
      const world = controller.worldForTests;
      for (const b of controller.bots) {
        const me = b.character;
        if (!isInPlay(me)) continue;
        for (const other of state.characters) {
          if (other.team === me.team || !isInPlay(other)) continue;
          const dist = Math.hypot(other.position.x - me.position.x, other.position.z - me.position.z);
          if (dist > BOTS.viewDistance) continue;
          sampled++;
          const without = visiblePart(me, other, world.query, BOTS, BODY, HITS);
          const withLeaves = visiblePart(me, other, world.query, BOTS, BODY, HITS, bushes);
          if (without > 0 && withLeaves === 0) hiddenByBush++;
          if (withLeaves > 0 && dist > BOTS.closeAwareness) {
            // What it sees, it sees through at most foliageSeeThrough of leaves.
            eyeOf(me, BODY, HITS, eye);
            const d = foliageDepth(bushes, eye, bodyPoint(other, HITS, withLeaves, point) as Vec3);
            worstDepth = Math.max(worstDepth, d);
          }
        }
      }
    });
    expect(sampled).toBeGreaterThan(500);
    expect(worstDepth).toBeLessThanOrEqual(BOTS.foliageSeeThrough + 1e-9);
    // The bushes matter in a match: someone who would be in view was hidden by one,.
    expect(hiddenByBush).toBeGreaterThan(0);
    // Bots still play: a round ended, BBs flew and hit, and the match stayed inside the fence.
    expect(stats.rounds).toBeGreaterThanOrEqual(1);
    expect(stats.shots).toBeGreaterThan(50);
    expect(stats.hits).toBeGreaterThan(0);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { foliageDepth } from '../map/foliage';
import { WOODLAND } from '../map/woodland';
import { initPhysics } from '../physics/physicsWorld';
import { isInPlay } from '../sim/elimination';
import { hitTop } from '../sim/hitbox';
import { type Vec3, vec3 } from '../sim/vec';
import { playMatch } from './depotMatchSupport';
import { bodyPoint, eyeOf, visiblePart } from './perception';

/**
 * M33e QA, acceptance 1 and 5 together: a 5v5 bot match on the real Woodland, its 70 bushes in the bots' world. Every
 * tick (a few in a row sampled) each bot's sight of each enemy is checked against the bushes: no bot has a target in
 * view through more than foliageSeeThrough of leaves unless it is within closeAwareness. MS1 (owner, 2026-10-16: bushes
 * "small and decorative", still tactical) made them 0.9 to 1.25 m tall: crouch cover, never full cover. The second test
 * shows they still hide someone crouched behind one, and nobody standing.
 */
const TEAM_SIZE = 5;
const SAMPLE_EVERY = 6;
/** The hiding check: a standing bot this far (m) from a bush, someone this far behind its far edge. */
const VIEW_FROM = 12;
const BEHIND = 0.35;

describe('a 5v5 bot match on Woodland with its bushes (M33e, acceptances 1 and 5)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('bots never see through bush deeper than foliageSeeThrough, and rounds still finish', { timeout: 45_000 }, () => {
    const bushes = WOODLAND.foliage!;
    expect(bushes.length).toBeGreaterThanOrEqual(50);
    let sampled = 0;
    let worstDepth = 0;
    const eye = vec3();
    const point = vec3();
    const stats = playMatch(150, 2, undefined, BOTS, 'elimination', ROUNDS, WOODLAND, TEAM_SIZE, undefined, (state, controller) => {
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
          const withLeaves = visiblePart(me, other, world.query, BOTS, BODY, HITS, { foliage: bushes, night: null });
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
    // MS1: bushes are crouch-high at most now, and bots seldom crouch behind one, so a match may hide nobody; the
    // hiding is checked on its own below.
    // Bots still play: a round ended, BBs flew and hit, and the match stayed inside the fence.
    expect(stats.rounds).toBeGreaterThanOrEqual(1);
    expect(stats.shots).toBeGreaterThan(50);
    expect(stats.hits).toBeGreaterThan(0);
  });

  it('MS1: a bush hides someone crouched just behind it from a standing bot, and seldom anyone standing', () => {
    const bushes = WOODLAND.foliage!;
    const hidden = (h: number): number => {
      let n = 0;
      for (const b of bushes) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const eye = vec3(b.x - dx * VIEW_FROM, b.y + BODY.standEyeHeight, b.z - dz * VIEW_FROM);
          const at = (f: number): Vec3 => vec3(b.x + dx * (b.radius + BEHIND), b.y + h * f, b.z + dz * (b.radius + BEHIND));
          if (foliageDepth(bushes, eye, at(BOTS.headHeightFraction)) > BOTS.foliageSeeThrough && foliageDepth(bushes, eye, at(BOTS.aimHeightFraction)) > BOTS.foliageSeeThrough) n++;
        }
      }
      return n;
    };
    const ways = bushes.length * 4;
    expect(hidden(hitTop(1, HITS)) / ways).toBeGreaterThan(0.25);
    expect(hidden(hitTop(0, HITS)) / ways).toBeLessThan(0.05);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { playMatch } from './depotMatchSupport';

/** Neon Heights plays 4v4 (M34c). */
const TEAM_SIZE = 4;
const SECONDS = 300;
const SEEDS = 16;
/** M73 (audit BAL-04, acceptance 2): the east lands at most this share of the rounds' first hits at Normal by night. */
const EAST_FIRST_HIT_MAX = 0.55;

describe('a 4v4 Elimination match on Neon Heights at Normal by night (M73, audit BAL-04)', () => {
  const map = mapUnderLighting(NEON_HEIGHTS, 'night');
  beforeAll(async () => {
    await initPhysics();
  });

  // The east "takes" the first hit when its bot's BB is the round's first to land (it holds the bar door over the avenue and
  // shoots first). Before the lane point moved inside the bar's door line the east took 15 of 24 (seeds 1-4); the message
  // below carries the counts for seeds 1-16, with the first hits that fell on the east for the other reading.
  it(`the east end lands at most ${Math.round(EAST_FIRST_HIT_MAX * 100)} % of the rounds' first hits`, { timeout: 300_000 }, () => {
    let rounds = 0;
    let eastFirst = 0;
    let eastHit = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      // A round's first BB hit: the end its shooter belongs to (and its victim's, counted apart). Armed from each round's start.
      let armed = true;
      playMatch(SECONDS, seed, undefined, BOTS, 'elimination', ROUNDS, map, TEAM_SIZE, HITS, (state) => {
        for (const e of state.events) {
          if (e.type === 'roundStart') armed = true;
          else if (e.type === 'roundOver') armed = false;
          else if (e.type === 'characterHit' && armed) {
            armed = false;
            rounds++;
            if (state.characters.find((c) => c.id === e.shooterId)!.end === 1) eastFirst++;
            if (state.characters.find((c) => c.id === e.victimId)!.end === 1) eastHit++;
          }
        }
      });
    }
    const said = `the east landed the first hit in ${eastFirst} of ${rounds} rounds (${((100 * eastFirst) / rounds).toFixed(1)} %; the first hit fell on the east in ${eastHit}), seeds 1-${SEEDS}`;
    console.log(said);
    expect(rounds, said).toBeGreaterThan(0);
    expect(eastFirst / rounds, said).toBeLessThanOrEqual(EAST_FIRST_HIT_MAX);
  });
});

import { beforeAll, describe, it } from 'vitest';
import { BOTS } from '../../config/bots';
import { HITS, ROUNDS } from '../../config/hits';
import type { LightingPresetId } from '../../config/render';
import { mapUnderLighting } from '../../map/lightingChoice';
import { NEON_HEIGHTS } from '../../map/neonHeights';
import { initPhysics } from '../../physics/physicsWorld';
import { playMatch } from '../depotMatchSupport';
import { LEVELS_BAND, ON_TIME_BAND, reportMeasure, share } from './balanceSupport';

/** Neon Heights plays 4v4 (M34c). */
const TEAM_SIZE = 4;

describe.each<LightingPresetId>(['day', 'night'])('a 4v4 Attack / Defend match on Neon Heights by %s over 16 seeds (M34c, M34d)', (light) => {
  const map = mapUnderLighting(NEON_HEIGHTS, light);
  beforeAll(async () => {
    await initPhysics();
  });

  it('measures the attackers\' share of rounds (target 40-65 %) and the rounds that run out the clock', { timeout: 300_000 }, (ctx) => {
    let rounds = 0;
    let attackWins = 0;
    let captures = 0;
    let onTime = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(300, seed, undefined, BOTS, 'attackDefend', ROUNDS, map, TEAM_SIZE, HITS);
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'time') onTime++;
        if (r.reason === 'captured') captures++;
        if (r.winner === r.attackers) attackWins++;
      }
    }
    // Measured 2026-10-04: attackers won 40 of 86 rounds here (47 %), 8 by raising the flag, none on time. Over seeds
    // 1-32 they won 54 %, 32 of 178 rounds by raising the flag. By night (M34d, 2026-10-05) they won 39 of 87 here
    // (45 %), 10 by raising it, none on time; with M34e's lamps and dark rooms 49 of 95 (52 %), none on time. With every
    // bot carrying the torch the game fits it at night (M57, audit AI-02, on M55's maps) 47 of 95 (49.5 %), 13 by
    // raising it, none on time. Re-measure after any layout or bot change. M71 (Audit 2: every level
    // hunts the middle and keeps out of the light, torches only for a close fight): by day 56 of 93 (60.2 %), 21 by
    // raising it; by night 50 of 93 (53.8 %), 10; none on time. The ceiling is the levels' 65 % since (LEVELS_BAND, owner
    // decision 3): Normal attackers who now come through the middle win one round in 93 more than 60 %. M73 (the east's
    // last mid-lane holds inside the bar's door line): 46.0 % by day (40 of 87, 10 by raising it) and 50.5 % by night
    // (46 of 91, 19); none on time.
    const label = `Neon Heights by ${light === 'day' ? 'Day' : 'Night'}, Normal, Attack / Defend`;
    const counts = `${onTime} of ${rounds} on time`;
    reportMeasure(ctx, { label: `${label}: the attackers' share of rounds`, value: share(attackWins, rounds), of: rounds, band: { min: 0.4, max: LEVELS_BAND.max }, detail: `${attackWins} of ${rounds}, ${captures} by raising the flag, ${counts}` });
    reportMeasure(ctx, { label: `${label}: rounds that run out the clock`, value: share(onTime, rounds), of: rounds, band: ON_TIME_BAND, detail: counts });
  });
});

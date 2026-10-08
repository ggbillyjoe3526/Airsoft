import { beforeAll, describe, it } from 'vitest';
import { BOTS } from '../../config/bots';
import { HITS, ROUNDS } from '../../config/hits';
import type { LightingPresetId } from '../../config/render';
import { mapUnderLighting } from '../../map/lightingChoice';
import { NEON_HEIGHTS } from '../../map/neonHeights';
import { initPhysics } from '../../physics/physicsWorld';
import { playMatch } from '../depotMatchSupport';
import { type Band, ON_TIME_BAND, reportMeasure, share } from './balanceSupport';

/** Neon Heights plays 4v4 (M34c). */
const TEAM_SIZE = 4;
/**
 * The west end's share of the decided rounds, by lighting: the even 40-60 % both ways since M73 put the east's bar-door
 * holds deep in the bar (the west 45.7 % by Day, 48.3 % by Night over seeds 1-48; by Day it was centred on 45 % before, M55).
 */
const WEST: Readonly<Record<LightingPresetId, Band>> = { day: { min: 0.4, max: 0.6 }, night: { min: 0.4, max: 0.6 } };

describe.each<LightingPresetId>(['day', 'night'])('a 4v4 Elimination match on Neon Heights by %s over 48 seeds (M34c, M34d)', (light) => {
  const map = mapUnderLighting(NEON_HEIGHTS, light);
  beforeAll(async () => {
    await initPhysics();
  });

  it('measures the west end\'s share of the decided rounds (target 40-60 %) and the rounds that run out the clock', { timeout: 900_000 }, (ctx) => {
    let rounds = 0;
    let decided = 0;
    let westWins = 0;
    let onTime = 0;
    for (let seed = 1; seed <= 48; seed++) {
      const stats = playMatch(300, seed, undefined, BOTS, 'elimination', ROUNDS, map, TEAM_SIZE, HITS);
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'time') onTime++;
        if (r.winner < 0) continue;
        decided++;
        if (r.winnerEnd === 0) westWins++;
      }
    }
    // Measured 2026-10-04: the west end won 45 % of the decided rounds here (32 of 71), none ran out the clock. Over
    // seeds 1-96 the west won 44.5 % (KNOWN_ISSUES: the east is a little stronger, as Depot's was before FA4) and 2
    // rounds in 499 ran out the clock. By night (M34d, 2026-10-05) the west won 43 % here (32 of 74), none on time; with M34e's lamps and dark rooms 47 % (38 of 81), none on time (seeds 1-48: 48 %). Re-measure after any layout or bot change.
    // M55 (2026-10-05) took the overlaps out of the blocks (audit SIM-04), which deals every seed again without moving
    // the balance: over seeds 1-96 the west won 44.5 % by day (44.9 % before) and 45.3 % by night (48.1 %), ±2.2 at one
    // standard error; here 39.8 % by day (33 of 83) and 50.6 % by night (43 of 85), ±5.5. The band is centred on that
    // 45 % (it was 40-60 %, its floor one standard error under it) until a layout change evens the ends (KNOWN_ISSUES).
    // Every night figure so far played without the torches the game fits every bot at night; with them (M57, audit
    // AI-02) the west wins 54.0 % here by night (47 of 87), none on time, so by Night the band stays 40-60 %. M71 (Audit
    // 2: every level hunts the middle and keeps out of the light, torches only for a close fight): 40.4 % by day (36 of
    // 89, 1 of 90 on time) and 43.2 % by night (38 of 88, none on time): the west under 45 % calls M73's lane point at
    // the bar door (audit BAL-04, owner decision 6). With it (M73): 45.5 % by day (40 of 88, none on time) and 52.5 %
    // by night (42 of 80, 2 of 82 on time). Seeds 1-48 since 2026-10-06 (16 left the Day figure a standard error from its
    // floor, ±5.5): before M73's lane point 44.0 % by day (121 of 275) and 44.1 % by night (119 of 270); with it 45.7 %
    // by day (126 of 276) and 48.3 % by night (125 of 259), ±3. M74 (route searches under a per-tick budget, audit AI-04):
    // 43.5 % by day (118 of 271) and 46.9 % by night (127 of 271), within noise of that.
    const label = `Neon Heights by ${light === 'day' ? 'Day' : 'Night'}, Normal, Elimination`;
    const counts = `${onTime} of ${rounds} on time`;
    reportMeasure(ctx, { label: `${label}: the west end's share of the decided rounds`, value: share(westWins, decided), of: decided, band: WEST[light], detail: `${westWins} of ${decided} decided, ${counts}` });
    reportMeasure(ctx, { label: `${label}: rounds that run out the clock`, value: share(onTime, rounds), of: rounds, band: ON_TIME_BAND, detail: counts });
  });
});

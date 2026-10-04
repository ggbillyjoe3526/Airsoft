import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { initPhysics } from '../physics/physicsWorld';
import { playMatch } from './depotMatchSupport';

describe('a 3v3 Attack / Defend match on Depot: the pole over 16 seeds', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds where the pole matters: flags go up, some rounds are won by raising one, roles and ends swap at half-time', { timeout: 300_000 }, () => {
    let rounds = 0;
    let captures = 0;
    let attackWins = 0;
    let flagsRaised = 0;
    let friendlyHits = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(400, seed, undefined, BOTS, 'attackDefend');
      friendlyHits += stats.friendlyHits;
      // Rounds 1-4 Blue attacks, then Orange; the attackers always start at the west end.
      expect(stats.results.map((r) => r.attackers)).toEqual(stats.results.map((_, i) => (i < ROUNDS.halfTimeAfter ? 0 : 1)));
      expect(stats.results.every((r) => r.attackerEnd === 0)).toBe(true);
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'captured') captures++;
        if (r.winner === r.attackers) attackWins++;
        expect(r.length).toBeLessThanOrEqual(ROUNDS.roundTime + ROUNDS.flag.maxOvertime + 0.1); // overtime may run past the clock
      }
      if (stats.maxFlag >= 1) flagsRaised++;
    }
    // Measured on the M11 Depot with M12c's hop-up (2026-10-03; 16 seeds): 15 captures in 126 rounds, a flag
    // raised in 10 of 16 matches, attackers winning 51%, no friendly hits. Over seeds 1-96 attackers win 50%
    // (107 captures in 736 rounds); the old mirrored Depot measured 53%. With M20's ricochets (not counting): 18 captures in
    // 125 rounds, flags raised in 11 of 16, attackers 53%, 1 friendly hit, 193 ricochet ticks. Bots check their line of fire, but a teammate dodging into
    // a BB already in the air can't always be helped (KNOWN_ISSUES).
    // FA4 (2026-10-04: one attacker raises, the others guard the pole from cover): 13 captures in 120 rounds, flags
    // raised in 7 of 16, attackers 51%, no friendly hits; over seeds 1-48 37 captures in 359 rounds (10%; 19% before
    // FA4, when all three crowded the rope), attackers 51% (52% before).
    // Re-measure and update DECISIONS with this test after any bot tuning change.
    expect(friendlyHits).toBeLessThanOrEqual(1);
    expect(captures).toBeGreaterThanOrEqual(9);
    expect(captures / rounds).toBeGreaterThan(0.07);
    expect(flagsRaised).toBeGreaterThanOrEqual(5);
    expect(attackWins / rounds).toBeGreaterThan(0.38);
    expect(attackWins / rounds).toBeLessThan(0.67);
  });
});

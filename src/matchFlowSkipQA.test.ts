import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from './physics/physicsWorld';
import { ROUNDS } from './config/hits';
import { MATCH_MODES } from './config/modes';
import { DT, playMatch } from './ai/depotMatchSupport';
import { skipEnds, skipOffer, skipTickCap, skipTickShown } from './matchFlow';
import type { GameEvent } from './sim/events';
import { longestOvertime, type RoundRules } from './sim/round';

const rules = ROUNDS as unknown as RoundRules;

/**
 * M83 QA: the skip helpers against a real headless round (bots on both sides, character 0 standing in for the player).
 * Pins the rules the unit tests state in isolation: the offer exists only while that character is out in a live round,
 * a skip started on the first such tick ends before the cap and on a roundStart, and the ticks that would be shown while
 * skipping carry only the round's end and the next start, never a shot, a hit or an impact on their own (no puffs, no sounds).
 */
describe('Skip to next round against a played round (M83)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('is offered only while the player is out in a live round, and a skip from there ends on the next roundStart inside the cap', () => {
    const cap = skipTickCap(rules);
    const mode = MATCH_MODES[0]!.id;
    const offers = { whileOut: 0, whileInPlay: 0 };
    let skipStartedAt = -1;
    let skipTicks = 0;
    let endedWith = '';
    let suppressed = 0; // skipped ticks with shots, hits or impacts that show nothing (no puffs, no sounds)
    let boundaryShown = 0;
    let finishedSkips = 0;
    let longest = 0;
    playMatch(420, 11, undefined, undefined, mode, rules, undefined, undefined, undefined, (state) => {
      const me = state.characters[0]!;
      const offer = skipOffer(state.round, rules, me);
      const out = me.status === 'walkingOff' || me.status === 'leaving' || me.status === 'out';
      if (state.round.phase !== 'live') expect(offer, `phase ${state.round.phase}`).toBeNull();
      if (me.status === 'alive' || me.status === 'calling') {
        expect(offer, `status ${me.status}`).toBeNull();
        if (offer === null) offers.whileInPlay++;
      }
      if (out && state.round.phase === 'live') {
        expect(offer).not.toBeNull();
        offers.whileOut++;
        if (skipStartedAt < 0) {
          skipStartedAt = state.time;
          skipTicks = 0;
        }
      }
      if (skipStartedAt >= 0) {
        skipTicks++;
        const ev: readonly GameEvent[] = state.events;
        const busy = ev.some((e) => e.type === 'shot' || e.type === 'characterHit' || e.type === 'bbImpact');
        const boundary = ev.some((e) => e.type === 'roundOver' || e.type === 'roundStart' || e.type === 'matchOver');
        if (skipTickShown(ev)) {
          boundaryShown++;
          expect(boundary).toBe(true);
        } else if (busy) suppressed++;
        if (skipEnds(ev)) {
          finishedSkips++;
          longest = Math.max(longest, skipTicks);
          endedWith = ev.find((e) => e.type === 'roundStart' || e.type === 'matchOver')!.type;
          expect(skipTicks, 'a skip from the first tick out runs under the cap').toBeLessThanOrEqual(cap);
          skipStartedAt = -1;
        }
      }
    });
    expect(offers.whileOut, 'the player was out in a live round at least once').toBeGreaterThan(0);
    expect(offers.whileInPlay).toBeGreaterThan(0);
    expect(finishedSkips, 'at least one skip ran to the next round').toBeGreaterThan(0);
    expect(['roundStart', 'matchOver']).toContain(endedWith);
    expect(boundaryShown).toBeGreaterThan(0);
    expect(suppressed, 'the skipped stretch had BB traffic, none of it presented').toBeGreaterThan(0);
    // A skip is never longer than the longest round and its pause (the cap's own premise).
    expect(longest * DT).toBeLessThan((rules.roundTime + longestOvertime(rules) + rules.resetDelay) + 1);
  }, 120_000);
});

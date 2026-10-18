import { describe, expect, it } from 'vitest';
import { matchOverScreenDelay } from './config/renderView';
import { MatchSession } from './matchSession';

/**
 * BP6d: when the result screen comes (matchSession.ts takeResultDue), on a bare object holding what it reads, since the
 * real session needs a GPU and physics (as matchSessionRoster.test.ts does). playFlow.test.ts covers what Game does
 * with the answer; this covers the answer itself.
 */
function session(time: number, matchOverAt: number): MatchSession & { state: { time: number } } {
  const s = Object.create(MatchSession.prototype) as MatchSession & { state: { time: number } };
  Object.assign(s, { state: { time }, matchOverAt });
  return s;
}

describe('MatchSession.takeResultDue', () => {
  it('is false while the match is undecided', () => {
    expect(session(100, Number.NaN).takeResultDue()).toBe(false);
  });

  it('is false until the whistles and the pause after a decided match are over, then true once', () => {
    const delay = matchOverScreenDelay();
    const s = session(0, 0);
    expect(s.takeResultDue()).toBe(false);
    s.state.time = delay - 0.01;
    expect(s.takeResultDue()).toBe(false);
    s.state.time = delay;
    expect(s.takeResultDue()).toBe(true);
    s.state.time += 5;
    expect(s.takeResultDue()).toBe(false); // once per match
  });

  it('is due at once after a click on a decided match (RE1), and a second click owes no second screen', () => {
    const s = session(50, 50);
    let continued = 0;
    let held = 0;
    Object.assign(s, { state: { time: 50.6, round: { phase: 'matchOver' } }, match: { resultContinued: () => continued++ }, input: { holdFireUntilReleased: () => held++ } });
    (s as unknown as { continueFromResult(): void }).continueFromResult();
    expect(continued).toBe(1);
    expect(held).toBe(1); // the click that moved on fires nothing (BP6b)
    // Due now, give or take the rounding of time minus the delay (at worst one tick, 1/60 s, later).
    const now = s.takeResultDue();
    s.state.time += 1 / 60;
    expect(now || s.takeResultDue()).toBe(true);
    (s as unknown as { continueFromResult(): void }).continueFromResult(); // the screen is already owed: no second one
    expect(s.takeResultDue()).toBe(false);
  });
});

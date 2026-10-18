import { describe, expect, it } from 'vitest';
import { ROUNDS } from '../../config/hits';
import { HUD } from '../../config/render';
import { createRoundState, type RoundState } from '../../sim/round';
import { MatchPresentation } from './matchPresentation';

/**
 * Bug pass BP6a: the round banner waits while WON, LOST or DRAW is up, so the stamp never draws over it at 1280 × 720.
 * A bare presentation (the real one needs a renderer); `resultAt` is when the stamp went up.
 */
function bare(round: Partial<RoundState>, time: number, resultAt: number, extraction?: object) {
  const p = Object.create(MatchPresentation.prototype) as MatchPresentation;
  Object.assign(p, { state: { time, round: { ...createRoundState(ROUNDS, 'elimination'), ...round } }, resultAt, extraction });
  return (p as unknown as { resultWordsUp(): boolean }).resultWordsUp();
}

describe('the round banner waits behind the stamp (bug pass BP6a)', () => {
  it('holds while the stamp is up, for HUD.roundResultTime from when it went up, in a round and at the match\'s end', () => {
    expect(bare({ phase: 'over' }, 10, 10)).toBe(true);
    expect(bare({ phase: 'over' }, 10 + HUD.roundResultTime - 0.01, 10)).toBe(true);
    expect(bare({ phase: 'over' }, 10 + HUD.roundResultTime, 10)).toBe(false);
    expect(bare({ phase: 'matchOver' }, 11, 10)).toBe(true);
  });

  it('never holds while the round is live, before the stamp went up, or in Extraction (no stamp)', () => {
    expect(bare({ phase: 'live' }, 10, 10)).toBe(false);
    expect(bare({ phase: 'over' }, 10, Number.NaN)).toBe(false);
    expect(bare({ phase: 'over' }, 10, 10, {})).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { AUDIO, matchOverWhistlesDuration } from './audio';
import { HUD, matchOverScreenDelay } from './render';

describe('match-over timing', () => {
  it('shows the result screen only after the last match-over whistle has finished', () => {
    // Last blast starts at roundOverWhistle × gap × blasts and lasts roundOverWhistle.
    const lastBlastEnd = AUDIO.roundOverWhistle * AUDIO.matchOverWhistleGap * AUDIO.matchOverBlasts + AUDIO.roundOverWhistle;
    expect(matchOverWhistlesDuration()).toBeCloseTo(lastBlastEnd, 9);
    expect(matchOverScreenDelay()).toBeCloseTo(lastBlastEnd + HUD.matchOverScreenPause, 9);
    expect(matchOverScreenDelay()).toBeGreaterThan(lastBlastEnd);
  });
});

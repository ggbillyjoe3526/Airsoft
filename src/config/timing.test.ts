import { describe, expect, it } from 'vitest';
import { AUDIO, matchOverBlastStart, matchOverWhistlesDuration } from './audio';
import { HUD, matchOverScreenDelay } from './render';

describe('match-over timing', () => {
  it('shows the result screen only after the last match-over whistle has finished', () => {
    // Every blast the sound code schedules (matchOverBlastStart, used by sfx.ts) ends before the screen.
    let lastBlastEnd: number = AUDIO.roundOverWhistle; // the round's own blast
    for (let i = 0; i < AUDIO.matchOverBlasts; i++) {
      expect(matchOverBlastStart(i)).toBeGreaterThan(i > 0 ? matchOverBlastStart(i - 1) : 0);
      lastBlastEnd = Math.max(lastBlastEnd, matchOverBlastStart(i) + AUDIO.roundOverWhistle);
    }
    expect(matchOverWhistlesDuration()).toBeCloseTo(lastBlastEnd, 9);
    expect(matchOverScreenDelay()).toBeCloseTo(lastBlastEnd + HUD.matchOverScreenPause, 9);
    expect(matchOverScreenDelay()).toBeGreaterThan(lastBlastEnd);
  });
});

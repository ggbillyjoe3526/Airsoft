import { describe, expect, it } from 'vitest';
import { FULLSCREEN_RELOCK_MS } from '../config/controls';
import { relockAfterFullscreen } from './fullscreen';

describe('the mouse taken again after the Fullscreen key (audit UI-19)', () => {
  it('re-locks when the lock dropped just after the key was pressed in play', () => {
    expect(relockAfterFullscreen(50, FULLSCREEN_RELOCK_MS, true, false, false)).toBe(true);
  });

  it('leaves it alone when the lock held, long after the key, with no match, or in unlocked play', () => {
    expect(relockAfterFullscreen(50, FULLSCREEN_RELOCK_MS, true, true, false)).toBe(false);
    expect(relockAfterFullscreen(FULLSCREEN_RELOCK_MS + 1, FULLSCREEN_RELOCK_MS, true, false, false)).toBe(false);
    expect(relockAfterFullscreen(Number.POSITIVE_INFINITY, FULLSCREEN_RELOCK_MS, true, false, false)).toBe(false);
    expect(relockAfterFullscreen(50, FULLSCREEN_RELOCK_MS, false, false, false)).toBe(false);
    expect(relockAfterFullscreen(50, FULLSCREEN_RELOCK_MS, true, false, true)).toBe(false);
  });
});

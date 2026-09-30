import { describe, expect, it } from 'vitest';
import { VoiceLimit } from './voiceLimit';

describe('VoiceLimit', () => {
  it('lets `max` sounds start per window, then opens again in the next window', () => {
    const limit = new VoiceLimit(3, 0.1);
    expect([0, 0.01, 0.02, 0.03, 0.05].map((t) => limit.take(t))).toEqual([true, true, true, false, false]);
    expect(limit.take(0.11)).toBe(true);
    expect(limit.take(0.12)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { BOT_GLOW_BBS, bbsGlow, DEFAULT_GLOW_BBS, GLOW_BB_CHOICES, type GlowBBs } from './glowBBs';

describe('Glowing BBs choices (M33b)', () => {
  it('offers At Night, Always and Off in that order, and defaults to At Night', () => {
    expect(GLOW_BB_CHOICES.map((c) => c.id)).toEqual(['night', 'always', 'off']);
    expect(GLOW_BB_CHOICES.map((c) => c.label)).toEqual(['At Night', 'Always', 'Off']);
    expect(DEFAULT_GLOW_BBS).toBe('night');
  });

  it('glows by choice and field: At Night only at night, Always on every field, Off never', () => {
    const table: [GlowBBs, boolean, boolean][] = [
      ['night', true, true],
      ['night', false, false],
      ['always', true, true],
      ['always', false, true],
      ['off', true, false],
      ['off', false, false],
    ];
    for (const [choice, night, glows] of table) expect(bbsGlow(choice, night), `${choice}, night ${night}`).toBe(glows);
  });

  it('loads the bots glowing BBs on night fields only', () => {
    expect(BOT_GLOW_BBS).toBe('night');
    expect(bbsGlow(BOT_GLOW_BBS, true)).toBe(true);
    expect(bbsGlow(BOT_GLOW_BBS, false)).toBe(false);
  });
});

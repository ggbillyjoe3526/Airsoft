import { describe, expect, it } from 'vitest';
import { flagLine } from './flagStatus';

describe('the flag strip', () => {
  it('tells each side its job before anyone touches the rope', () => {
    expect(flagLine(true, 'idle', 0)).toEqual({ text: 'Attack · raise your flag on their pole', urgent: false });
    expect(flagLine(false, 'idle', 0)).toEqual({ text: 'Defend · keep their flag off your pole', urgent: false });
  });

  it('warns whichever side is losing ground, with how far up the flag is', () => {
    expect(flagLine(false, 'raising', 0.456)).toEqual({ text: 'Their flag is going up! · 45%', urgent: true });
    expect(flagLine(true, 'raising', 0.456).urgent).toBe(false);
    expect(flagLine(true, 'lowering', 0.3).urgent).toBe(true);
    expect(flagLine(false, 'lowering', 0.3).urgent).toBe(false);
    // Left part-way up: the defenders still have work to do.
    expect(flagLine(false, 'idle', 0.5)).toEqual({ text: 'Their flag is 50% up · pull it down', urgent: true });
    expect(flagLine(true, 'idle', 0.5).text).toBe('Your flag is 50% up · get back to the pole');
    expect(flagLine(true, 'contested', 0.2).text).toBe('Contested at the pole · 20%');
  });

  it('says the flag is up once it reaches the top (the round is over)', () => {
    expect(flagLine(true, 'raising', 1)).toEqual({ text: 'Your flag is up!', urgent: false });
    expect(flagLine(false, 'raising', 1)).toEqual({ text: 'Their flag is up', urgent: false });
  });
});

describe('the flag strip between rounds', () => {
  it('goes quiet instead of showing a stale rope status, unless the flag went up', () => {
    expect(flagLine(true, 'raising', 0.4, false)).toEqual({ text: '', urgent: false });
    expect(flagLine(false, 'raising', 0.4, false)).toEqual({ text: '', urgent: false });
    expect(flagLine(true, 'raising', 1, false).text).toBe('Your flag is up!');
  });
});

import { describe, expect, it } from 'vitest';
import { createDifficultyChoice, difficultyNote, difficultyRoundStarted, pickDifficulty } from './difficultyChoice';

describe('difficulty choice', () => {
  it('applies at once before the match is under way or once it is over', () => {
    const c = createDifficultyChoice('normal');
    expect(pickDifficulty(c, 'hard', false)).toBe('now');
    expect(c).toEqual({ inPlay: 'hard', next: null });
    expect(difficultyNote(c, false)).toBe('');
  });

  it('waits for the next round mid-match (also between rounds), with a note until then', () => {
    const c = createDifficultyChoice('normal');
    expect(pickDifficulty(c, 'easy', true)).toBe('nextRound');
    expect(c).toEqual({ inPlay: 'normal', next: 'easy' });
    expect(difficultyNote(c, false)).toBe('Starts next round.');
    // Changing mind to another level keeps waiting.
    expect(pickDifficulty(c, 'hard', true)).toBe('nextRound');
    expect(c.next).toBe('hard');
    difficultyRoundStarted(c);
    expect(c).toEqual({ inPlay: 'hard', next: null });
    expect(difficultyNote(c, false)).toBe('');
  });

  it('cancels a waiting change when the level in play is picked again', () => {
    const c = createDifficultyChoice('normal');
    pickDifficulty(c, 'hard', true);
    expect(pickDifficulty(c, 'normal', true)).toBe('now');
    expect(c).toEqual({ inPlay: 'normal', next: null });
    expect(difficultyNote(c, false)).toBe('');
    difficultyRoundStarted(c);
    expect(c.inPlay).toBe('normal');
  });

  it('carries a change still waiting at match over into the next match, without a note on the result screen', () => {
    const c = createDifficultyChoice('normal');
    pickDifficulty(c, 'easy', true);
    expect(difficultyNote(c, true)).toBe('');
    difficultyRoundStarted(c); // "Play again" starts round 1
    expect(c).toEqual({ inPlay: 'easy', next: null });
  });

  it('lets the result screen override a change still waiting', () => {
    const c = createDifficultyChoice('normal');
    pickDifficulty(c, 'easy', true);
    expect(pickDifficulty(c, 'hard', false)).toBe('now');
    expect(c).toEqual({ inPlay: 'hard', next: null });
    difficultyRoundStarted(c);
    expect(c.inPlay).toBe('hard');
  });
});

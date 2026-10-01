import type { Difficulty } from '../config/bots';

/**
 * Which bot difficulty is in play and which one the player has picked for later. A level picked
 * before the first round or on the result screen applies at once; one picked mid-match waits for
 * the next round start, so a fight in progress is never changed. Picking the level in play again
 * cancels a waiting change.
 */
export interface DifficultyChoice {
  inPlay: Difficulty;
  /** Picked mid-match, starts with the next round (null: nothing waiting). */
  next: Difficulty | null;
}

export function createDifficultyChoice(initial: Difficulty): DifficultyChoice {
  return { inPlay: initial, next: null };
}

/** The player picks `d`; returns when the bots should switch to it. */
export function pickDifficulty(c: DifficultyChoice, d: Difficulty, midMatch: boolean): 'now' | 'nextRound' {
  if (!midMatch || d === c.inPlay) {
    c.inPlay = d;
    c.next = null;
    return 'now';
  }
  c.next = d;
  return 'nextRound';
}

/** A round starts: a waiting level is now in play (the bot controller switches at the same event). */
export function difficultyRoundStarted(c: DifficultyChoice): void {
  if (c.next) c.inPlay = c.next;
  c.next = null;
}

/** The note shown with the picker: only while a change waits and a match is still on. */
export function difficultyNote(c: DifficultyChoice, matchOver: boolean): string {
  return c.next && !matchOver ? 'Starts next round.' : '';
}

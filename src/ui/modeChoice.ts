import type { MatchMode } from '../config/modes';

/**
 * When a mode picked on New game takes effect. Before the first match nothing has been played
 * yet, so the match is rebuilt in the new mode at once; after that the next match is played in it (a
 * match in progress keeps its mode, and "Play again" on the result screen starts the next one).
 */
export function modeTakesEffect(started: boolean): 'now' | 'nextMatch' {
  return started ? 'nextMatch' : 'now';
}

/** The note shown with the mode picker: only while a picked mode waits for the next match. */
export function modeNote(picked: MatchMode, inPlay: MatchMode, started: boolean, matchOver: boolean): string {
  return started && !matchOver && picked !== inPlay ? 'Starts with the next match.' : '';
}

/**
 * The mode whose rules New game explains: the match in progress while one is on (a picked mode
 * only waits), otherwise the picked one, which the next match is played in.
 */
export function modeToDescribe(picked: MatchMode, inPlay: MatchMode, started: boolean, matchOver: boolean): MatchMode {
  return started && !matchOver ? inPlay : picked;
}

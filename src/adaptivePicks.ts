import { levelAt, ratingWords, topRating } from './ai/adaptiveSkill';
import { ADAPTIVE, ADAPTIVE_TEXT } from './config/adaptiveDifficulty';
import type { AdaptiveSetup } from './matchSession';
import type { NewGamePicks } from './newGamePicks';
import { loadAdaptiveRating, saveAdaptiveRating } from './settings/adaptiveRating';
import { browserStorage } from './settings/storage';

/**
 * Adaptive difficulty between matches (AD1; the Dev tab's switch, config/adaptiveDifficulty.ts): where the next match
 * starts, what the Match screen says about it, and what a finished match teaches it. The match itself keeps its rating in
 * ai/adaptiveRun.ts. Only Elimination and Attack / Defend adapt: an Extraction run plays the fixed levels.
 */

/** The start of a match of `picks` (as they play), or null when it doesn't adapt (the switch off, or Extraction). */
export function adaptiveSetup(on: boolean, picks: NewGamePicks, devContent: boolean, storage = browserStorage()): AdaptiveSetup | null {
  if (!on || picks.mode === 'extraction') return null;
  const top = topRating(devContent);
  return { rating: loadAdaptiveRating(picks.difficulty, top, storage), top, from: picks.difficulty };
}

/** The picks as an adaptive match plays them: the opponents at the level the rating plays as. */
export function adaptedPicks(picks: NewGamePicks, setup: AdaptiveSetup | null): NewGamePicks {
  return setup ? { ...picks, difficulty: levelAt(setup.rating) } : picks;
}

/** The Match screen's note under the rules (null with the switch off). */
export function adaptiveNote(on: boolean, picks: NewGamePicks, devContent: boolean, storage = browserStorage()): string | null {
  if (!on) return null;
  const setup = adaptiveSetup(on, picks, devContent, storage);
  return setup ? ADAPTIVE_TEXT.matchNote(ratingWords(setup.rating)) : ADAPTIVE_TEXT.notInRun;
}

/**
 * A decided adaptive match (MatchSession.adaptiveResult): the next match's rating saved, grown from Opponents level
 * `from`, and the summary's line; with other Dev help (no `next`) nothing saved, and a line saying so.
 */
export function settleAdaptive(result: { start: number; next: number | null }, from: AdaptiveSetup['from'], storage = browserStorage()): string {
  if (result.next === null) return ADAPTIVE_TEXT.unchanged(ratingWords(result.start));
  saveAdaptiveRating(from, result.next, storage);
  const step = ADAPTIVE.words.step;
  const change = result.next > result.start + step ? 'up' : result.next < result.start - step ? 'down' : 'same';
  return ADAPTIVE_TEXT.next(ratingWords(result.next), change);
}

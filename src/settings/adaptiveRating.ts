import { DIFFICULTIES, type Difficulty } from '../config/bots';
import { browserStorage, loadSetting, numberIn, oneOf, saveSetting } from './storage';

/**
 * Adaptive difficulty's saved rating (AD1): `adaptiveRating`, the other team's skill for the next match on the
 * difficulty scale, and `adaptiveFrom`, the Opponents level it grew from. With another level picked since (or nothing
 * saved, or junk), the next match starts at the picked level.
 */

const LEVEL_IDS = DIFFICULTIES.map((d) => d.id);

/**
 * The rating the next adaptive match starts at, with `picked` the Opponents level as it plays, kept up to `top`: on the
 * scale of ai/adaptiveSkill.ts (a level's place in DIFFICULTIES).
 */
export function loadAdaptiveRating(picked: Difficulty, top: number, storage = browserStorage()): number {
  const from = loadSetting<Difficulty | null>('adaptiveFrom', oneOf(LEVEL_IDS), null, storage);
  const saved = loadSetting('adaptiveRating', numberIn(0, LEVEL_IDS.length - 1), Number.NaN, storage);
  const rating = from === picked && !Number.isNaN(saved) ? saved : LEVEL_IDS.indexOf(picked);
  return Math.min(Math.max(rating, 0), top);
}

/** Saves the next match's rating, grown from Opponents level `from`. */
export function saveAdaptiveRating(from: Difficulty, rating: number, storage = browserStorage()): void {
  saveSetting('adaptiveFrom', from, storage);
  saveSetting('adaptiveRating', Math.round(rating * 1000) / 1000, storage);
}

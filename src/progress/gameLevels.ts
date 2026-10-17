import levelsText from '../../data/levels.md?raw';
import { GAME_POOL } from '../pool/gamePool';
import { type LevelTable, loadLevels } from './levels';

/**
 * The game's levels: data/levels.md, bundled into the build and read once at start against the
 * asset pool (LV1). What it can't read is left out and listed in the console (src/progress/levels.test.ts fails on it,
 * with its lines).
 */
export const GAME_LEVELS: LevelTable = loadLevels(levelsText, GAME_POOL);

if (GAME_LEVELS.errors.length > 0) console.warn(`levels.md: ${GAME_LEVELS.errors.length} problem(s), those rows are left out:\n${GAME_LEVELS.errors.join('\n')}`);

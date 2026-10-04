import statsText from '../../stats.md?raw';
import { loadStats, type StatsFile } from './statsFile';

/**
 * The game's performance numbers: stats.md at the repository's root, bundled into the build and read once at start
 * (M29). The config modules (replicas, attachments, optics, lasers) lay it over their built-in numbers; anything it
 * can't read keeps the built-in number and is listed in the console (src/config/stats.test.ts fails on it).
 */
export const GAME_STATS: StatsFile = loadStats(statsText);

if (GAME_STATS.errors.length > 0) console.warn(`stats.md: ${GAME_STATS.errors.length} problem(s), the built-in numbers are used there:\n${GAME_STATS.errors.join('\n')}`);

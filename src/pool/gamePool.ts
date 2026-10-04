import poolText from '../../pool.md?raw';
import { loadPool, type Pool } from './pool';

/**
 * The game's asset pool: pool.md at the repository's root, bundled into the build and read once at start (M26a). Rows
 * it can't read are left out and listed in the console (src/pool/pool.test.ts fails on them, with their lines).
 */
export const GAME_POOL: Pool = loadPool(poolText);

if (GAME_POOL.errors.length > 0) console.warn(`pool.md: ${GAME_POOL.errors.length} problem(s), those rows are left out:\n${GAME_POOL.errors.join('\n')}`);

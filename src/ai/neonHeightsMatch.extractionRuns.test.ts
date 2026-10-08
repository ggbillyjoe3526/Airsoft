import { beforeAll, it } from 'vitest';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { initPhysics } from '../physics/physicsWorld';
import { expectRunsEndByRules } from './extractionRunSupport';

/** Enough seeds to catch a stuck run; how often the squad gets out is measured on 48 (balance/neonHeightsExtraction.balance.ts). */
const SEEDS = 4;

beforeAll(async () => {
  await initPhysics();
});

it('ends every Extraction run on Neon Heights by its rules at every level: extracted or out, never on time (M48)', { timeout: 300_000 }, () => {
  expectRunsEndByRules(NEON_HEIGHTS, SEEDS);
});

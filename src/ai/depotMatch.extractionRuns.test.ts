import { beforeAll, it } from 'vitest';
import { DEPOT } from '../map/depot';
import { initPhysics } from '../physics/physicsWorld';
import { expectRunsEndByRules } from './extractionRunSupport';

/** Enough seeds to catch a stuck run; how often the squad gets out is measured on 48 (balance/depotExtraction.balance.ts). */
const SEEDS = 4;

beforeAll(async () => {
  await initPhysics();
});

it('ends every Extraction run on Depot by its rules at every level: extracted or out, never on time (M46)', { timeout: 300_000 }, () => {
  expectRunsEndByRules(DEPOT, SEEDS);
});

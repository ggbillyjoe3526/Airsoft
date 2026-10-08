import { beforeAll, describe, it } from 'vitest';
import { initPhysics } from '../physics/physicsWorld';
import { expectCustomMatchesPlayable } from './depotMatchSupport';

describe('custom matches on Depot (M20): Attack / Defend', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays 1v1 and 2v2 matches out: rounds get decided, nobody stays at spawn, nobody falls, no friendly hits', { timeout: 600_000 }, () => {
    // Whether an end or side is favoured is a balance figure since TE4 (balance/depotCustomFlag.balance.ts, with the measures).
    expectCustomMatchesPlayable('attackDefend');
  });
});

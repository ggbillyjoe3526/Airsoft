import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HitConfig } from '../config/hits';
import { DEFAULT_MATCH_RULES } from '../config/matchRules';
import { initPhysics } from '../physics/physicsWorld';
import { gameModeContext } from './modeChecks';

/** KI2: the mode checks' matches play with each figure's own hit volume (HV1), as the game and the bot matches do. */
const seen: { playMatch: HitConfig[]; setUpRun: HitConfig[] } = { playMatch: [], setUpRun: [] };

vi.mock('../ai/depotMatchSupport', async (orig) => {
  const m = await orig<typeof import('../ai/depotMatchSupport')>();
  return { ...m, playMatch: (...a: Parameters<typeof m.playMatch>) => (seen.playMatch.push(a[8] as HitConfig), m.playMatch(...a)) };
});
vi.mock('../ai/extractionRunSupport', async (orig) => {
  const m = await orig<typeof import('../ai/extractionRunSupport')>();
  return { ...m, setUpRun: (o: Parameters<typeof m.setUpRun>[0]) => (seen.setUpRun.push(o.hits as HitConfig), m.setUpRun(o)) };
});

const { playModeMatch } = await import('./modePlay');
const depot = gameModeContext().maps.find((m) => m.entry.id === 'depot')!;
const base = { map: depot.data, level: 'normal' as const, teamSize: 1, rules: DEFAULT_MATCH_RULES, seed: 3, seconds: 1 };

describe('the mode checks’ matches hit each figure by its own volume', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it.each(['elimination', 'attackDefend'] as const)('%s hands the rounds match the rigged figures’ bodies and legs', (mode) => {
    seen.playMatch.length = 0;
    playModeMatch({ ...base, mode });
    expect(seen.playMatch).toHaveLength(1);
    expect(seen.playMatch[0]!.figureBodies?.length).toBeGreaterThan(0);
    expect(seen.playMatch[0]!.figureLegs).toBeDefined();
  });

  it('extraction hands the run the rigged figures’ bodies and legs', () => {
    seen.setUpRun.length = 0;
    playModeMatch({ ...base, mode: 'extraction' });
    expect(seen.setUpRun).toHaveLength(1);
    expect(seen.setUpRun[0]!.figureBodies?.length).toBeGreaterThan(0);
    expect(seen.setUpRun[0]!.figureLegs).toBeDefined();
  });
});

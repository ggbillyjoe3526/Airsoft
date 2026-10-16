import { describe, expect, it } from 'vitest';
import { GAME_STATS } from './gameStats';
import { BUILT_IN_REPLICAS } from './replicas';
import type { ReplicaStats } from './statsFile';

/**
 * stats.md is what plays; the numbers written in replicas.ts are only the fallback for a row the file can't give (DX0).
 * Two sources of truth that differ mislead whoever reads the other one, so this keeps them equal: change the file and
 * the code together.
 */
describe('the built-in replica numbers equal their stats.md rows (DX0)', () => {
  it.each(BUILT_IN_REPLICAS.map((replica) => [replica.id, replica] as const))('%s', (id, builtIn) => {
    const row = GAME_STATS.replicas[id];
    expect(row, `stats.md has no row for ${id}`).toBeDefined();
    const { siteClass, ...numbers } = row!;
    expect(siteClass ?? builtIn.siteClass, 'site class').toBe(builtIn.siteClass);
    for (const [key, value] of Object.entries(numbers)) expect(builtIn[key as Exclude<keyof ReplicaStats, 'siteClass'>], `${id} ${key}`).toBe(value);
  });
});

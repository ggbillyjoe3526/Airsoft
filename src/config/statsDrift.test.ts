import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * DX7 (audit B5): the config modules' built-in numbers and data/stats.md are two copies of one number; stats.md's is
 * the one that plays (withStats, overlay), and a built-in only stands in where the file can't be read. This fails on
 * any number where the two disagree, so a reader can trust either. Change both together.
 */

const STATS = '../../data/stats.md?raw';

async function configs(): Promise<Record<string, Readonly<Record<string, object>>>> {
  // One at a time: the stats file's mock (below) must be in place before each loads.
  const r = await import('./replicas');
  const a = await import('./attachments');
  const o = await import('./optics');
  const l = await import('./lasers');
  const t = await import('./torches');
  return {
    replicas: Object.fromEntries(r.BUILT_IN_REPLICAS.map((b) => [b.id, [r.AEG, r.GAS_PISTOL, r.CYBER_PISTOL].find((c) => c.id === b.id)!])),
    grips: a.GRIPS,
    magazines: a.MAGAZINES,
    barrels: a.BARRELS,
    muzzles: a.MUZZLES,
    optics: o.OPTICS,
    lasers: l.LASERS,
    torches: t.TORCHES,
  };
}

describe('the built-in numbers and data/stats.md agree (DX7, audit B5)', () => {
  afterEach(() => {
    vi.doUnmock(STATS);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('every replica and part the file numbers plays the same with the file unread', async () => {
    vi.resetModules();
    const shipped = await configs();
    vi.resetModules();
    vi.doMock(STATS, () => ({ default: '' }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const builtIn = await configs();
    const drift: string[] = [];
    for (const [table, rows] of Object.entries(shipped)) {
      for (const [key, row] of Object.entries(rows)) {
        for (const [field, value] of Object.entries(row)) {
          const own = (builtIn[table]![key] as Record<string, unknown>)[field];
          if (JSON.stringify(own) !== JSON.stringify(value)) drift.push(`${table} ${key} ${field}: built-in ${JSON.stringify(own)}, stats.md ${JSON.stringify(value)}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });
});

/**
 * The build's size budget per output chunk (audit L-12, CORE-01), in kB (minified, before gzip): vite.config.ts checks
 * every chunk against it, so the game, three.js and Rapier can't grow unnoticed. Build-time only: the game never imports
 * this. A change to a budget needs a DECISIONS line.
 */
export const CHUNK_BUDGET = {
  /**
   * Rapier inlines its WASM, so it has its own: 4,333 kB measured at @dimforge/rapier3d-compat 0.21.0 plus about 5 %
   * (DECISIONS 2026-10-04), so an upgrade that grows it is a deliberate bump.
   */
  rapierKb: 4550,
  /**
   * Every other chunk. 900 since M50 (DECISIONS 2026-10-05): the game chunk was 794 of 800 kB after Extraction, and 743
   * with the dev maps and the pool and stats tables moved to chunks of their own. 950 since M75 (DECISIONS 2026-10-06):
   * the graphics overhaul (G1-G7, the menus) took it to 898, and M75's figure shadow stand-ins to 901.
   */
  defaultKb: 950,
  /**
   * Share of the default budget at which the build warns, so the next approach is seen before a build fails (CORE-01).
   * Not Rapier's: its budget is a pin set 5 % over the library as measured.
   */
  warnAt: 0.9,
} as const;

/** What the build does with one chunk: nothing, warn that it is near its budget, or fail (warn off CI) as over it. */
export interface ChunkVerdict {
  level: 'ok' | 'near' | 'over';
  message: string;
}

/** The verdict on chunk `name` (written as `fileName`) of `bytes` bytes. Pure. */
export function chunkVerdict(name: string, fileName: string, bytes: number, budget = CHUNK_BUDGET): ChunkVerdict {
  const kb = bytes / 1000;
  const limit = name === 'rapier' ? budget.rapierKb : budget.defaultKb;
  const share = `${fileName} is ${kb.toFixed(0)} kB, ${Math.round((100 * kb) / limit)} % of its ${limit} kB budget (src/config/chunkBudget.ts)`;
  if (kb > limit) return { level: 'over', message: `${share}: over budget` };
  if (name !== 'rapier' && kb >= limit * budget.warnAt) return { level: 'near', message: `${share}: near the budget` };
  return { level: 'ok', message: share };
}

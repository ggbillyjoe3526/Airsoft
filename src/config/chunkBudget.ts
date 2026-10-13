/**
 * The build's size budget per output chunk (audit L-12, CORE-01), in kB (minified, before gzip): vite.config.ts checks
 * every chunk against it, so the game, three.js and Rapier can't grow unnoticed. Build-time only: the game never imports
 * this. A change to a budget needs a DECISIONS line.
 */
export const CHUNK_BUDGET = {
  /**
   * Rapier's code chunk (its classes and wasm-bindgen glue): 224.8 kB measured at @dimforge/rapier3d-compat 0.21.0
   * with its WebAssembly as a plain file (IM3, config/rapierWasm.ts), plus about 5 %, so an upgrade that grows it is a
   * deliberate bump. 4,550 kB until then, when the chunk carried the WebAssembly as base64 (DECISIONS 2026-10-04).
   */
  rapierKb: 236,
  /** Rapier's WebAssembly, the plain file (an asset, checked under RAPIER_WASM_BUDGET): 3,082 kB at 0.21.0 plus about 5 %. */
  rapierWasmKb: 3240,
  /**
   * Every other chunk. 900 since M50 (DECISIONS 2026-10-05): the game chunk was 794 of 800 kB after Extraction, and 743
   * with the dev maps and the pool and stats tables moved to chunks of their own. 950 since M75 (DECISIONS 2026-10-06):
   * the graphics overhaul (G1-G7, the menus) took it to 898, and M75's figure shadow stand-ins to 901. 1000 since FP1
   * (DECISIONS 2026-10-10): the overhaul's camo, arms and bounces (G11, G12) left main's game chunk at 950.2, over the
   * budget, and FP1's hand holds took it to 951.1. 1050 since M80 and M82 (DECISIONS 2026-10-11): main's game chunk was
   * 993.5, and the tutorial's scoreboard and order wheel showcase, its finish pop-up and the rarity bar took it to 1003.2.
   * Back to 1000 since W6b (DECISIONS 2026-10-11): the old renderer (W6a) and the world's GLSL (W6b) gone, it is 975.
   * 1250 since IM1 (owner, DECISIONS 2026-10-12): the Loadout, Armory and Settings screens and the range, fetched on
   * first use, took the start-up code from 990 (with BF1) to 897, and the owner raised the line for room in Dev 6. The
   * start-up code is all in the `game` chunk (vite.config.ts), the page's entry a stub.
   */
  defaultKb: 1250,
  /**
   * Share of the default budget at which the build warns, so the next approach is seen before a build fails (CORE-01).
   * Not Rapier's: its budget is a pin set 5 % over the library as measured.
   */
  warnAt: 0.9,
} as const;

/** The name chunkVerdict() takes for Rapier's WebAssembly, an asset rather than a chunk (vite.config.ts). */
export const RAPIER_WASM_BUDGET = 'rapier-wasm';

/** What the build does with one chunk: nothing, warn that it is near its budget, or fail (warn off CI) as over it. */
export interface ChunkVerdict {
  level: 'ok' | 'near' | 'over';
  message: string;
}

/**
 * The verdict on chunk `name` (written as `fileName`) of `bytes` bytes. Rapier's two budgets are pins set 5 % over the
 * library as measured, so they never warn early. Pure.
 */
export function chunkVerdict(name: string, fileName: string, bytes: number, budget = CHUNK_BUDGET): ChunkVerdict {
  const kb = bytes / 1000;
  const pinned = name === 'rapier' ? budget.rapierKb : name === RAPIER_WASM_BUDGET ? budget.rapierWasmKb : null;
  const limit = pinned ?? budget.defaultKb;
  const share = `${fileName} is ${kb.toFixed(0)} kB, ${Math.round((100 * kb) / limit)} % of its ${limit} kB budget (src/config/chunkBudget.ts)`;
  if (kb > limit) return { level: 'over', message: `${share}: over budget` };
  if (pinned === null && kb >= limit * budget.warnAt) return { level: 'near', message: `${share}: near the budget` };
  return { level: 'ok', message: share };
}

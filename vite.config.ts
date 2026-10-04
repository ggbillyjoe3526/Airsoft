import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Size budgets in kB (minified, before gzip). Rapier inlines its WASM, so it gets its own budget: 4,333 kB measured at
 * @dimforge/rapier3d-compat 0.21.0 plus about 5 % (DECISIONS 2026-10-04), so an upgrade that grows it is a deliberate bump.
 */
const CHUNK_BUDGET_KB = { rapier: 4550, default: 800 };

/** True on a CI runner (the workflow's runner sets CI); read without Node's types, which the project doesn't load. */
const ON_CI = Boolean((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI);

/**
 * Checks every output chunk against its budget, so the game, three.js and Rapier chunks can't grow unnoticed: over
 * budget fails the build on CI and warns locally (audit L-12).
 */
function chunkBudget(): Plugin {
  return {
    name: 'airsoft-chunk-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        const kb = new TextEncoder().encode(file.code).length / 1000;
        const budget = file.name === 'rapier' ? CHUNK_BUDGET_KB.rapier : CHUNK_BUDGET_KB.default;
        if (kb <= budget) continue;
        const message = `${file.fileName} is ${kb.toFixed(0)} kB, over its ${budget} kB budget (vite.config.ts)`;
        if (ON_CI) this.error(message);
        else this.warn(message);
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [chunkBudget()],
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Vendor code in its own chunks so it caches across game updates and each size stays visible.
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\\/]@dimforge/ },
            { name: 'three', test: /node_modules[\\/]three/ },
          ],
        },
      },
    },
    // Vite's single global limit is set just above the Rapier chunk; per-chunk budgets are enforced by chunkBudget().
    chunkSizeWarningLimit: CHUNK_BUDGET_KB.rapier,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

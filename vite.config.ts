import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Size budgets in kB (minified, before gzip). Rapier inlines its WASM, so it gets its own budget. */
const CHUNK_BUDGET_KB = { rapier: 4500, default: 800 };

/** Warns when any output chunk exceeds its budget, so the game and three.js chunks can't grow unnoticed. */
function chunkBudget(): Plugin {
  return {
    name: 'airsoft-chunk-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        const kb = new TextEncoder().encode(file.code).length / 1000;
        const budget = file.name === 'rapier' ? CHUNK_BUDGET_KB.rapier : CHUNK_BUDGET_KB.default;
        if (kb > budget) this.warn(`${file.fileName} is ${kb.toFixed(0)} kB, over its ${budget} kB budget`);
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

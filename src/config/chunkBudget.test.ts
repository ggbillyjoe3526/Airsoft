import { describe, expect, it } from 'vitest';
import { CHUNK_BUDGET, chunkVerdict, RAPIER_WASM_BUDGET } from './chunkBudget';

describe('chunk budgets (audit L-12, CORE-01)', () => {
  it('passes a chunk under 90 % of its budget, warns from 90 % and fails over it', () => {
    const kb = CHUNK_BUDGET.defaultKb;
    expect(chunkVerdict('index', 'index-a.js', kb * 1000 * 0.89).level).toBe('ok');
    expect(chunkVerdict('index', 'index-a.js', kb * 1000 * 0.9).level).toBe('near');
    expect(chunkVerdict('index', 'index-a.js', kb * 1000).level).toBe('near');
    expect(chunkVerdict('index', 'index-a.js', kb * 1000 + 1).level).toBe('over');
  });

  it('holds Rapier to its own budget, with no early warning (the budget is the measured size plus 5 %)', () => {
    const kb = CHUNK_BUDGET.rapierKb;
    expect(chunkVerdict('rapier', 'rapier-a.js', 224_773).level).toBe('ok');
    expect(chunkVerdict('rapier', 'rapier-a.js', kb * 1000).level).toBe('ok');
    expect(chunkVerdict('rapier', 'rapier-a.js', kb * 1000 + 1).level).toBe('over');
    // The chunk with its WebAssembly inlined as base64 (before IM3) is over it.
    expect(chunkVerdict('rapier', 'rapier-a.js', 4_335_380).level).toBe('over');
  });

  it("holds Rapier's WebAssembly file to a budget of its own, also with no early warning (IM3)", () => {
    const kb = CHUNK_BUDGET.rapierWasmKb;
    expect(chunkVerdict(RAPIER_WASM_BUDGET, 'rapier_wasm3d_bg-a.wasm', 3_082_103).level).toBe('ok');
    expect(chunkVerdict(RAPIER_WASM_BUDGET, 'rapier_wasm3d_bg-a.wasm', kb * 1000).level).toBe('ok');
    expect(chunkVerdict(RAPIER_WASM_BUDGET, 'rapier_wasm3d_bg-a.wasm', kb * 1000 + 1).level).toBe('over');
    // A file of its size under any other name is over the default budget.
    expect(chunkVerdict('index', 'index-a.js', 3_082_103).level).toBe('over');
  });

  it('names the file, its size, the share and where the budget lives', () => {
    expect(chunkVerdict('game', 'game-abc.js', 1_187_000).message).toBe('game-abc.js is 1187 kB, 95 % of its 1250 kB budget (src/config/chunkBudget.ts): near the budget');
  });
});

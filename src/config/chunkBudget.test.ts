import { describe, expect, it } from 'vitest';
import { CHUNK_BUDGET, chunkVerdict } from './chunkBudget';

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
    expect(chunkVerdict('rapier', 'rapier-a.js', 4_335_380).level).toBe('ok');
    expect(chunkVerdict('rapier', 'rapier-a.js', kb * 1000 + 1).level).toBe('over');
    // A chunk of Rapier's size under any other name is over the default budget.
    expect(chunkVerdict('index', 'index-a.js', 4_335_380).level).toBe('over');
  });

  it('names the file, its size, the share and where the budget lives', () => {
    expect(chunkVerdict('index', 'index-abc.js', 900_400).message).toBe('index-abc.js is 900 kB, 90 % of its 1000 kB budget (src/config/chunkBudget.ts): near the budget');
  });
});

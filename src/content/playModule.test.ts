import { describe, expect, it } from 'vitest';
import { isPlayModule } from './skinCheckSupport';
import { gamePlayImports } from './report/playImports';

describe('isPlayModule leaves out test-only files (BD1, QA)', () => {
  it('keeps shipped play modules', () => {
    for (const f of ['src/sim/hitbox.ts', 'src/ai/bot.ts', 'src/pool/kit.ts', 'src/sim/figureBody.ts', 'src/ai/depotMatch.ts']) expect(isPlayModule(f), f).toBe(true);
  });
  it('skips Support files, tests and the balance folder', () => {
    for (const f of ['src/ai/depotMatchSupport.ts', 'src/ai/riggedHitsSupport.ts', 'src/sim/testSupport.ts', 'src/sim/hitbox.test.ts', 'src/ai/balance/figures.ts']) expect(isPlayModule(f), f).toBe(false);
  });
  it('still skips files outside the roots', () => {
    expect(isPlayModule('src/render/figures/figureBody.ts')).toBe(false);
  });
  it('still finds a play module that imports config/schemes.ts, and skips a test-only one that does', () => {
    expect(gamePlayImports(['src/render/figures/figureMix.ts']).map((p) => p.file)).toContain('src/render/figures/figureMix.ts');
    expect(gamePlayImports(['src/ai/riggedHitsSupport.ts'])).toEqual([]);
    const reached = gamePlayImports().map((p) => p.file);
    expect(reached).not.toContain('src/render/figures/figureMix.ts');
    for (const f of reached) expect(/Support\.ts$|\.test\.ts$/.test(f), f).toBe(false);
  });
});

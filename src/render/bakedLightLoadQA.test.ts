import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEPOT } from '../map/depot';

/** QA for loading the baked light (G6): a probe file that cannot be used leaves its map without baked light, never the game without a boot. */

/**
 * The tests run with module isolation off (vite.config.ts): the module under test is loaded into a registry of its own
 * (`vi.resetModules` before and after), over a files module whose loader returns text that is no probe file.
 */
async function loadedOverGarbage(): Promise<typeof import('./bakedLight')> {
  vi.resetModules();
  vi.doMock('../map/bakes/files', async (importOriginal) => {
    const files = await importOriginal<typeof import('../map/bakes/files')>();
    return { ...files, BAKE_FILES: { depot: () => Promise.resolve('this is not a probe file\n') } };
  });
  return import('./bakedLight');
}

afterEach(() => {
  vi.doUnmock('../map/bakes/files');
  vi.resetModules();
});

describe('a probe file that does not decode (G6 QA)', () => {
  // QA found loadBakedLight rejecting on a file that loads but fails to decode, which stopped Game.create; fixed in G6.
  it('is left out with a warning, as one that does not load is: loading resolves and the map draws without baked light', async () => {
    const { bakedLightFor, loadBakedLight } = await loadedOverGarbage();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(loadBakedLight()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    expect(bakedLightFor(DEPOT)).toBeNull();
    warn.mockRestore();
  });
});

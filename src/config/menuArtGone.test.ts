import { describe, expect, it } from 'vitest';
import * as art from './menuArt';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { readdirSync, readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readdirSync: (p: URL) => string[];
  readFileSync: (p: URL, enc: string) => string;
};

/** KI2: the unused mode stills and the 'ground' and 'flag' views are gone, and nothing points at them. */
describe('the deleted mode stills', () => {
  it('no mode picture is served, exported or has a camera', () => {
    expect(readdirSync(new URL('../../public/menu/', import.meta.url)).filter((f) => f.startsWith('mode-'))).toEqual([]);
    expect('MODE_STILLS' in art).toBe(false);
    expect(Object.keys(art.STILL_CAMERA).sort()).toEqual(['aerial', 'overview', 'street']);
    for (const s of art.MAP_STILLS) expect(['overview', 'aerial', 'street']).toContain(s.view);
  });

  it('the stills script and the menus do not read them', () => {
    for (const f of ['../../pipeline/map-stills.mjs', '../ui/menus/chrome.ts']) {
      const text = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(text, f).not.toMatch(/MODE_STILLS|mode-(elimination|attackDefend|extraction)|'flag'|'ground'/);
    }
  });
});

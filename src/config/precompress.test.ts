import { describe, expect, it } from 'vitest';
import { PRECOMPRESS, precompressedCopies, precompressWanted, shouldPrecompress, type BuildFile } from './precompress';

const file = (fileName: string, bytes: number): BuildFile => ({ fileName, source: new Uint8Array(bytes) });
/** Stand-in compressors: Brotli halves a file, gzip takes three quarters; neither touches its input. */
const halve = { brotli: async (s: Uint8Array) => s.slice(0, s.byteLength / 2), gzip: async (s: Uint8Array) => s.slice(0, (s.byteLength * 3) / 4) };

describe('precompressed copies of the release build (audit CORE-29)', () => {
  it('compresses code, styles, the page, the icon, the manifest and models, not source maps, images or tiny files', () => {
    for (const name of ['assets/rapier-abc.js', 'assets/index-abc.css', 'index.html', 'icon.svg', 'manifest.webmanifest', 'assets/figure.glb']) {
      expect(shouldPrecompress(file(name, 4096)), name).toBe(true);
    }
    for (const name of ['assets/rapier-abc.js.map', 'assets/texture.png', 'assets/sound.ogg', 'assets/rapier-abc.js.br']) {
      expect(shouldPrecompress(file(name, 4096)), name).toBe(false);
    }
    expect(shouldPrecompress(file('assets/tiny.js', PRECOMPRESS.minBytes - 1))).toBe(false);
  });

  it('writes a .br and a .gz next to each such file', async () => {
    const copies = await precompressedCopies([file('assets/rapier-abc.js', 4000), file('assets/rapier-abc.js.map', 4000), file('index.html', 2000)], halve);
    expect(copies.map((c) => [c.fileName, c.source.byteLength]).sort()).toEqual([
      ['assets/rapier-abc.js.br', 2000],
      ['assets/rapier-abc.js.gz', 3000],
      ['index.html.br', 1000],
      ['index.html.gz', 1500],
    ]);
  });

  it('leaves out a copy that comes out no smaller than the file (the host serves the file itself)', async () => {
    const grows = { brotli: async (s: Uint8Array) => s.slice(0, s.byteLength / 2), gzip: async (s: Uint8Array) => new Uint8Array(s.byteLength + 20) };
    const copies = await precompressedCopies([file('assets/already-packed.js', 2048)], grows);
    expect(copies.map((c) => c.fileName)).toEqual(['assets/already-packed.js.br']);
  });

  it('uses the strongest settings, since it runs once per release build', () => {
    expect(PRECOMPRESS.brotliQuality).toBe(11);
    expect(PRECOMPRESS.gzipLevel).toBe(9);
  });

  it('runs on a release build unless the flag says 0 (audit CORE-11: the gate\'s --quick build), never on the e2e build', () => {
    expect(PRECOMPRESS.envFlag).toBe('AIRSOFT_PRECOMPRESS');
    expect(precompressWanted('production', undefined)).toBe(true);
    expect(precompressWanted('production', '1')).toBe(true);
    expect(precompressWanted('production', '')).toBe(true);
    expect(precompressWanted('production', '0')).toBe(false);
    expect(precompressWanted('production', ' 0\n')).toBe(false);
    expect(precompressWanted('e2e', undefined)).toBe(false);
    expect(precompressWanted('e2e', '1')).toBe(false);
  });
});

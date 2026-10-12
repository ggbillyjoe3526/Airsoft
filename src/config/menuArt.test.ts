import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKDROPS, MAP_STILLS, MENU_ART_DIR, MODE_STILLS, STILL_SIZE } from './menuArt';

const DIR = join(process.cwd(), 'public', MENU_ART_DIR);

/** A black 480x270 JPEG read back from a failed WebGPU canvas was about 1.5 kB; a real picture is 7 kB or more. */
const MIN_BYTES = 4_000;

interface Art { file: string; width: number; height: number; maxBytes: number }
const still = (file: string): Art => ({ file, width: STILL_SIZE.width, height: STILL_SIZE.height, maxBytes: STILL_SIZE.maxBytes });
const ART: Art[] = [
  ...MAP_STILLS.map((s) => still(s.file)),
  ...Object.values(MODE_STILLS).map((s) => still(s.file)),
  ...Object.values(BACKDROPS).map((b) => ({ file: b.file, width: b.width, height: b.height, maxBytes: b.maxBytes })),
];

/** Width and height from the first SOF marker of a JPEG, or null when it isn't one. */
function jpegSize(b: Buffer): { width: number; height: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

describe('menu pictures', () => {
  it('lists every picture once', () => {
    const files = ART.map((a) => a.file);
    expect(new Set(files).size).toBe(files.length);
  });

  describe.each(ART)('$file', (art) => {
    const path = join(DIR, art.file);
    it('exists in public/menu', () => expect(existsSync(path)).toBe(true));
    it('is a JPEG of the listed size', () => expect(jpegSize(readFileSync(path))).toEqual({ width: art.width, height: art.height }));
    it('is under its byte budget', () => expect(statSync(path).size).toBeLessThanOrEqual(art.maxBytes));
    it('is not a blank frame (size floor)', () => expect(statSync(path).size).toBeGreaterThan(MIN_BYTES));
  });

  it('has no two pictures byte-identical', () => {
    const hashes = ART.map((a) => createHash('sha1').update(readFileSync(join(DIR, a.file))).digest('hex'));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('ships no picture menuArt does not list', () => {
    expect(readdirSync(DIR).sort()).toEqual(ART.map((a) => a.file).sort());
  });
});

import { describe, expect, it } from 'vitest';
import { BACKDROPS, MAP_STILLS, MENU_ART_DIR, STILL_SIZE } from './menuArt';

// Node's fs, without its types (the project compiles for the browser).
const nodeFs = 'node:fs';
const { existsSync, readdirSync, readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  existsSync(path: URL): boolean;
  readdirSync(path: URL): string[];
  readFileSync(path: URL): Uint8Array;
};

const DIR = new URL(`../../public/${MENU_ART_DIR}/`, import.meta.url);
const at = (file: string): URL => new URL(file, DIR);

/** A black 480x270 JPEG read back from a failed WebGPU canvas was about 1.5 kB; a real picture is 7 kB or more. */
const MIN_BYTES = 4_000;

interface Art { file: string; width: number; height: number; maxBytes: number }
const still = (file: string): Art => ({ file, width: STILL_SIZE.width, height: STILL_SIZE.height, maxBytes: STILL_SIZE.maxBytes });
const ART: Art[] = [
  ...MAP_STILLS.map((s) => still(s.file)),
  ...Object.values(BACKDROPS).map((b) => ({ file: b.file, width: b.width, height: b.height, maxBytes: b.maxBytes })),
];

/** Width and height from the first SOF marker of a JPEG, or null when it isn't one. */
function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number): number => (b[i]! << 8) | b[i + 1]!;
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: u16(i + 5), width: u16(i + 7) };
    i += 2 + u16(i + 2);
  }
  return null;
}

/** The bytes as one string, to compare two files whole. */
const bytesOf = (file: string): string => Array.from(readFileSync(at(file)), (v) => String.fromCharCode(v)).join('');

describe('menu pictures', () => {
  it('lists every picture once', () => {
    const files = ART.map((a) => a.file);
    expect(new Set(files).size).toBe(files.length);
  });

  describe.each(ART)('$file', (art) => {
    const path = at(art.file);
    it('exists in public/menu', () => expect(existsSync(path)).toBe(true));
    it('is a JPEG of the listed size', () => expect(jpegSize(readFileSync(path))).toEqual({ width: art.width, height: art.height }));
    it('is under its byte budget', () => expect(readFileSync(path).length).toBeLessThanOrEqual(art.maxBytes));
    it('is not a blank frame (size floor)', () => expect(readFileSync(path).length).toBeGreaterThan(MIN_BYTES));
  });

  it('has no two pictures byte-identical', () => {
    const files = ART.map((a) => bytesOf(a.file));
    expect(new Set(files).size).toBe(files.length);
  });

  it('ships no picture menuArt does not list', () => {
    expect(readdirSync(DIR).sort()).toEqual(ART.map((a) => a.file).sort());
  });
});

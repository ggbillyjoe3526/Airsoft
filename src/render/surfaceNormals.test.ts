import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SURFACES } from '../config/render';
import type { ProceduralTexture } from './proceduralTextures';
import { ensureNormalMap, heightToNormal, normalStrength } from './surfaceNormals';

/** A greyscale picture from a height function (0..255 per pixel). */
function picture(w: number, h: number, height: (x: number, y: number) => number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = px[o + 1] = px[o + 2] = height(x, y);
      px[o + 3] = 255;
    }
  }
  return px;
}

const at = (px: Uint8ClampedArray, w: number, x: number, y: number) => [...px.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];

describe('heightToNormal (F4)', () => {
  it('points a flat picture straight out of the surface', () => {
    const out = heightToNormal(picture(4, 4, () => 120), 4, 4, 2);
    expect(at(out, 4, 1, 2)).toEqual([128, 128, 255]);
  });

  it('leans away from a rise: left for a rise to the right, up the texture for a rise down the rows', () => {
    const right = heightToNormal(picture(8, 8, (x) => 100 + x * 10), 8, 8, 2);
    expect(at(right, 8, 4, 4)[0]).toBeLessThan(128);
    expect(at(right, 8, 4, 4)[1]).toBe(128);
    const down = heightToNormal(picture(8, 8, (_x, y) => 100 + y * 10), 8, 8, 2);
    expect(at(down, 8, 4, 4)[1]).toBeGreaterThan(128);
    expect(at(down, 8, 4, 4)[0]).toBe(128);
  });

  it('wraps at the edges, so a tiling picture gives a tiling map (shifting the picture shifts the map)', () => {
    const w = 8;
    const wave = (x: number, y: number) => 128 + 60 * Math.sin((x / w) * Math.PI * 2) * Math.cos((y / w) * Math.PI * 2);
    const a = heightToNormal(picture(w, w, wave), w, w, 3);
    const b = heightToNormal(picture(w, w, (x, y) => wave((x + 1) % w, y)), w, w, 3);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) expect(at(b, w, x, y)).toEqual(at(a, w, (x + 1) % w, y));
  });

  it('a stronger scale leans the same slope further', () => {
    const ramp = picture(8, 8, (x) => 100 + x * 5);
    expect(at(heightToNormal(ramp, 8, 8, 4), 8, 4, 4)[0]).toBeLessThan(at(heightToNormal(ramp, 8, 8, 1), 8, 4, 4)[0]!);
  });
});

describe('normalStrength', () => {
  it('scales with the picture size, so relief reads the same at every Texture detail', () => {
    expect(normalStrength('blockWall', 256)).toBe(SURFACES.normalStrength.blockWall);
    expect(normalStrength('blockWall', 512)).toBe(2 * SURFACES.normalStrength.blockWall);
  });
});

describe('ensureNormalMap', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('works the map out once, at most normalMapMaxSize a side (High is scaled down first), as plain data', () => {
    const drawn: number[] = [];
    const fakeCanvas = () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (_src: unknown, _x: number, _y: number, w: number) => drawn.push(w),
          getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: picture(w, h, () => 128) }),
          putImageData: () => {},
        }),
      };
      return canvas;
    };
    vi.stubGlobal('document', { createElement: fakeCanvas });
    vi.stubGlobal('ImageData', class { constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {} });
    const source = fakeCanvas();
    source.width = source.height = 1024;
    const texture = new THREE.Texture(source as unknown as HTMLCanvasElement);
    texture.name = 'concrete';
    const surface = { texture, worldSize: 2 } as unknown as ProceduralTexture;
    const normal = ensureNormalMap(surface);
    expect(drawn).toEqual([SURFACES.normalMapMaxSize]);
    expect((normal.image as { width: number }).width).toBe(SURFACES.normalMapMaxSize);
    expect(normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(normal.wrapS).toBe(THREE.RepeatWrapping);
    expect(surface.normal).toBe(normal);
    expect(ensureNormalMap(surface)).toBe(normal);
    normal.dispose();
  });
});

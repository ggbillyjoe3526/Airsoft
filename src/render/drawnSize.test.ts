import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUALITY_PRESETS, QUALITY, SURFACES } from '../config/render';
import type { SurfaceTextureId } from '../config/render';
import { addSurfaceTextures, drawnSize } from './proceduralTextures';

const CAPPED: SurfaceTextureId[] = ['plaster', 'cladding', 'asphalt', 'paving', 'glass'];
const ALL = Object.keys(SURFACES.worldSize) as SurfaceTextureId[];

describe('drawnSize (M78 acceptance 2, owner decision 9)', () => {
  it('caps plaster, cladding, asphalt, paving and glass at 512 on a 1024 set', () => {
    for (const id of CAPPED) expect(drawnSize(id, 1024), id).toBe(512);
  });

  it('leaves every other surface at the set size', () => {
    for (const id of ALL.filter((i) => !CAPPED.includes(i))) {
      for (const size of [256, 512, 1024] as const) expect(drawnSize(id, size), `${id} ${size}`).toBe(size);
    }
  });

  it('never raises a size: 256 stays 256 and 512 stays 512', () => {
    for (const id of ALL) {
      for (const size of [256, 512] as const) expect(drawnSize(id, size), `${id} ${size}`).toBe(size);
    }
  });

  it('is data: the capped set is exactly SURFACES.maxSize, each at 512', () => {
    expect(Object.keys(SURFACES.maxSize).sort()).toEqual([...CAPPED].sort());
    for (const id of CAPPED) expect(SURFACES.maxSize[id as keyof typeof SURFACES.maxSize]).toBe(512);
  });

  it('is what High and Ultra draw: their 1024 set gives the flat city finishes 512', () => {
    const big = QUALITY_PRESETS.filter((p) => QUALITY[p].textureSize === 1024);
    expect(big.length).toBeGreaterThan(0);
    for (const p of big) for (const id of CAPPED) expect(drawnSize(id, QUALITY[p].textureSize), `${p} ${id}`).toBe(512);
  });
});

describe('addSurfaceTextures canvases (M78)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Canvas widths asked of the document, per call, in order; no 2D context, so each draw stops after sizing its canvas. */
  function widthsFor(id: SurfaceTextureId, size: 256 | 512 | 1024): number[] {
    const widths: number[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const canvas = {
          _w: 0,
          set width(v: number) {
            this._w = v;
            widths.push(v);
          },
          get width() {
            return this._w;
          },
          height: 0,
          getContext: () => null,
        };
        return canvas;
      },
    });
    try {
      addSurfaceTextures({}, [id], size, 1 as never);
    } catch {
      // "2D canvas unavailable": the canvas was sized first
    }
    return widths;
  }

  it('draws the capped surfaces on a 512 canvas at textureSize 1024, the others on 1024, and Low on 256', () => {
    for (const id of CAPPED) expect(widthsFor(id, 1024)[0], id).toBe(512);
    for (const id of ['concrete', 'blockWall', 'paint', 'tiles'] as SurfaceTextureId[]) expect(widthsFor(id, 1024)[0], id).toBe(1024);
    for (const id of CAPPED) expect(widthsFor(id, 256)[0], id).toBe(256);
  });
});

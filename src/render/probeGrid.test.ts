import { describe, expect, it } from 'vitest';
import { decodeProbeFile, encodeProbeFile, fromBase64, toBase64 } from './probeFile';
import { openSample, type ProbeGrid, type ProbeSample, probeTint, sampleProbes } from './probeGrid';

/** The probe file and its sampling (G6, render/probeGrid.ts). */

/** A 3 × 2 × 2 grid every 0.5 m from (1, 0, -1), each probe's bytes from its index. */
function grid(): ProbeGrid {
  const nx = 3;
  const ny = 2;
  const nz = 2;
  const data = new Uint8Array(nx * ny * nz * 4);
  for (let i = 0; i < nx * ny * nz; i++) data.set([i * 20, 255 - i * 10, (i * 37) % 256, 100 + i * 10], i * 4);
  return { version: 1, preset: 'day', hash: 0xdeadbeef, nx, ny, nz, origin: [1, 0, -1], spacing: 0.5, scale: 2, data };
}

const out = (): ProbeSample => ({ r: 0, g: 0, b: 0, vis: 0 });

describe('the probe file (G6)', () => {
  it('reads back exactly what it wrote, through its base64 text too', () => {
    const g = grid();
    const bytes = encodeProbeFile(g);
    expect(bytes.length).toBe(40 + g.data.length);
    expect(decodeProbeFile(bytes)).toEqual(g);
    const text = toBase64(bytes);
    expect(text.split('\n').every((line) => line.length <= 100)).toBe(true);
    expect(decodeProbeFile(fromBase64(text))).toEqual(g);
    // Night is stored too.
    expect(decodeProbeFile(encodeProbeFile({ ...g, preset: 'night' })).preset).toBe('night');
  });

  it('refuses what isn’t a probe file', () => {
    const bytes = encodeProbeFile(grid());
    expect(() => decodeProbeFile(bytes.subarray(0, 20))).toThrow();
    expect(() => decodeProbeFile(bytes.subarray(0, bytes.length - 4))).toThrow();
    const wrong = bytes.slice();
    wrong[0] = 0;
    expect(() => decodeProbeFile(wrong)).toThrow();
  });
});

describe('sampling the probes (G6)', () => {
  const g = grid();
  const probe = (i: number): ProbeSample => ({ r: (g.data[i * 4]! * g.scale) / 255, g: (g.data[i * 4 + 1]! * g.scale) / 255, b: (g.data[i * 4 + 2]! * g.scale) / 255, vis: g.data[i * 4 + 3]! / 255 });

  it('reads a probe exactly where it stands', () => {
    for (const [i, x, y, z] of [
      [0, 1, 0, -1],
      [2, 2, 0, -1],
      [5, 2, 0.5, -1],
      [11, 2, 0.5, -0.5],
    ] as const) {
      const s = sampleProbes(g, x, y, z, out());
      const p = probe(i);
      expect(s.r).toBeCloseTo(p.r, 9);
      expect(s.g).toBeCloseTo(p.g, 9);
      expect(s.b).toBeCloseTo(p.b, 9);
      expect(s.vis).toBeCloseTo(p.vis, 9);
    }
  });

  it('blends the eight probes round a point (trilinear, as the GPU reads the 3D texture)', () => {
    // Half way between probes 0 and 1 along x.
    const s = sampleProbes(g, 1.25, 0, -1, out());
    expect(s.r).toBeCloseTo((probe(0).r + probe(1).r) / 2, 9);
    // The middle of the first cell: the mean of its eight corners.
    const m = sampleProbes(g, 1.25, 0.25, -0.75, out());
    const corners = [0, 1, 3, 4, 6, 7, 9, 10].map(probe);
    expect(m.vis).toBeCloseTo(corners.reduce((a, c) => a + c.vis, 0) / 8, 9);
  });

  it('reads the nearest edge outside the grid (the texture’s clamp), and writes into the sample it is given', () => {
    const o = out();
    expect(sampleProbes(g, -50, -50, -50, o)).toBe(o);
    expect(o.vis).toBeCloseTo(probe(0).vis, 9);
    sampleProbes(g, 50, 50, 50, o);
    expect(o.vis).toBeCloseTo(probe(11).vis, 9);
  });

  it('turns a sample into a tint: dimmed by the sky it can’t see, lifted by the bounce', () => {
    const t = { r: 0, g: 0, b: 0 };
    probeTint(openSample(out()), 0.5, 1, t);
    expect(t).toEqual({ r: 1, g: 1, b: 1 });
    probeTint({ r: 0.2, g: 0, b: 0, vis: 0 }, 0.5, 0.5, t);
    expect(t.r).toBeCloseTo(0.6, 9);
    expect(t.g).toBeCloseTo(0.5, 9);
  });
});

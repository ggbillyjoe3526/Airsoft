import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SURFACES } from '../config/render';
import { appendCuboid, type Buffers, type CuboidShape, cuts, emptyBuffers, type Paint, PLAIN } from './cuboidMesh';

const BOX = { min: [0, 0, 0] as [number, number, number], max: [3, 2.5, 1.2] as [number, number, number] };
const paint = (grimeFrom: number | null = null): Paint => ({ uv: 'world', worldSize: 2, color: new THREE.Color(0.5, 0.5, 0.5), grimeFrom });
const DETAIL: CuboidShape = { bevel: 0.025, cell: 1, shade: null };

function build(shape: CuboidShape, grimeFrom: number | null = null): Buffers {
  const buf = emptyBuffers();
  appendCuboid(buf, BOX, paint(grimeFrom), shape);
  return buf;
}

/** Every triangle faces the way its first vertex's normal says (counter-clockwise seen from outside). */
function allFaceOut(buf: Buffers): boolean {
  const p = (i: number) => new THREE.Vector3(buf.positions[i * 3], buf.positions[i * 3 + 1], buf.positions[i * 3 + 2]);
  for (let t = 0; t < buf.indices.length; t += 3) {
    const [a, b, c] = [buf.indices[t]!, buf.indices[t + 1]!, buf.indices[t + 2]!];
    const n = new THREE.Vector3(buf.normals[a * 3], buf.normals[a * 3 + 1], buf.normals[a * 3 + 2]);
    const face = p(b).sub(p(a)).cross(p(c).sub(p(a)));
    if (face.lengthSq() < 1e-12 || face.dot(n) <= 0) return false;
  }
  return true;
}

describe('cuts', () => {
  it('keeps the ends, adds the given points inside, and tiles each stretch to about the cell size', () => {
    expect(cuts(0, 3, null)).toEqual([0, 3]);
    expect(cuts(0, 3, null, [1.5, -1, 4])).toEqual([0, 1.5, 3]);
    expect(cuts(0, 3, 1)).toEqual([0, 1, 2, 3]);
    expect(cuts(0, 3, 1, [0.6]).map((v) => +v.toFixed(6))).toEqual([0, 0.6, 1.8, 3]);
  });
});

describe('appendCuboid (map detail, audit section 5)', () => {
  it('draws the plain box as 12 triangles, and splits the sides once across the grime band', () => {
    expect(build(PLAIN).indices.length / 3).toBe(12);
    expect(build(PLAIN, 0).indices.length / 3).toBe(12 + 8);
  });

  it('bevels add strips along the vertical and top edges and a corner triangle each, all facing out', () => {
    const plain = build(PLAIN);
    const bevelled = build({ bevel: 0.025, cell: null, shade: null });
    // 4 vertical strips of one quad, 4 top strips of one quad, 4 corner triangles.
    expect(bevelled.indices.length / 3).toBe(12 + 8 + 8 + 4);
    expect(allFaceOut(plain)).toBe(true);
    expect(allFaceOut(bevelled)).toBe(true);
    expect(allFaceOut(build(DETAIL, 0))).toBe(true);
  });

  it('stays inside its box, with the bevel faces a little lighter (the edge highlight)', () => {
    const buf = build(DETAIL);
    for (let i = 0; i < buf.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        expect(buf.positions[i + a]!).toBeGreaterThanOrEqual(BOX.min[a]! - 1e-9);
        expect(buf.positions[i + a]!).toBeLessThanOrEqual(BOX.max[a]! + 1e-9);
      }
    }
    const diagonal = buf.normals.findIndex((v, i) => i % 3 === 0 && Math.abs(v) > 0.1 && Math.abs(v) < 0.9) / 3;
    expect(buf.colors[diagonal * 3]).toBeCloseTo(0.5 * SURFACES.bevel.highlight);
    expect(buf.colors[0]).toBeCloseTo(0.5);
  });

  it('tiles faces to the cell size and applies the baked shade per vertex', () => {
    const tiled = build({ bevel: 0, cell: 1, shade: null });
    // 3 × 2.5 × 1.2 m at 1 m: x 3, y 3 (2.5 rounds up), z 1 tiles.
    expect(tiled.indices.length / 6).toBe(2 * (3 * 3) + 2 * (3 * 1) + 2 * (3 * 1));
    const shaded = build({ bevel: 0, cell: null, shade: (_x, y) => (y > 1 ? 1 : 0.5) });
    for (let i = 0; i < shaded.positions.length / 3; i++) {
      expect(shaded.colors[i * 3]).toBeCloseTo(shaded.positions[i * 3 + 1]! > 1 ? 0.5 : 0.25);
    }
  });
});

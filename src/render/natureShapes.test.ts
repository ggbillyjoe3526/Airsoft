import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NATURE_SHAPES } from '../config/render';
import type { MapBlock } from '../map/mapTypes';
import { WOODLAND } from '../map/woodland';
import { emptyBuffers, type Buffers } from './cuboidMesh';
import { appendNatureShape, chamferFor, isNatureKind, logCourses, type NaturePaint, octagon } from './natureShapes';

const paint = (): NaturePaint => ({ worldSize: 1.6, color: new THREE.Color(1, 1, 1), grimeFrom: 0 });
const EPS = 1e-6;

/** Woodland's nature blocks, one per kind and size (the shapes depend on nothing else but the course heights). */
function distinctBlocks(): MapBlock[] {
  const seen = new Map<string, MapBlock>();
  for (const b of WOODLAND.blocks) {
    if (!isNatureKind(b.kind)) continue;
    const key = `${b.kind} ${b.size.x} ${b.size.y} ${b.size.z} ${(b.center.y - b.size.y / 2).toFixed(2)}`;
    if (!seen.has(key)) seen.set(key, b);
  }
  return [...seen.values()];
}

function shapeOf(block: MapBlock): Buffers {
  const buf = emptyBuffers();
  appendNatureShape(buf, block, paint(), null);
  return buf;
}

/** The triangles of `buf`. */
function triangles(buf: Buffers): THREE.Triangle[] {
  const v = (i: number) => new THREE.Vector3(buf.positions[i * 3], buf.positions[i * 3 + 1], buf.positions[i * 3 + 2]);
  const out: THREE.Triangle[] = [];
  for (let i = 0; i < buf.indices.length; i += 3) out.push(new THREE.Triangle(v(buf.indices[i]!), v(buf.indices[i + 1]!), v(buf.indices[i + 2]!)));
  return out;
}

/** Points on the box's faces (a grid of `n` × `n` on each), leaving out the faces `skip` names ('top', 'bottom'). */
function boxPoints(block: MapBlock, n: number, skip: readonly ('top' | 'bottom')[]): THREE.Vector3[] {
  const { center: c, size: s } = block;
  const h = [s.x / 2, s.y / 2, s.z / 2];
  const pts: THREE.Vector3[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      if (axis === 1 && sign > 0 && skip.includes('top')) continue;
      if (axis === 1 && sign < 0 && skip.includes('bottom')) continue;
      const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const p = [0, 0, 0];
          p[axis] = sign * h[axis]!;
          p[u] = (-1 + (2 * i) / (n - 1)) * h[u]!;
          p[v] = (-1 + (2 * j) / (n - 1)) * h[v]!;
          pts.push(new THREE.Vector3(c.x + p[0]!, c.y + p[1]!, c.z + p[2]!));
        }
      }
    }
  }
  return pts;
}

/** The farthest any of `points` is from the triangles (the one-sided Hausdorff distance, box to shape). */
function farthest(points: readonly THREE.Vector3[], tris: readonly THREE.Triangle[]): number {
  const q = new THREE.Vector3();
  let worst = 0;
  for (const p of points) {
    let best = Infinity;
    for (const t of tris) best = Math.min(best, t.closestPointToPoint(p, q).distanceTo(p));
    worst = Math.max(worst, best);
  }
  return worst;
}

describe('the woods’ shapes (M33i, owner rule: what you see is what stops you, to within 8 cm)', () => {
  const blocks = distinctBlocks();

  it('covers trees, logs and boulders on Woodland', () => {
    expect(new Set(blocks.map((b) => b.kind))).toEqual(new Set(['tree', 'log', 'boulder']));
  });

  it('keeps every vertex inside its block (nothing drawn where nothing stops you)', () => {
    for (const b of blocks) {
      const buf = shapeOf(b);
      for (let i = 0; i < buf.positions.length; i += 3) {
        const [x, y, z] = [buf.positions[i]!, buf.positions[i + 1]!, buf.positions[i + 2]!];
        expect(Math.abs(x - b.center.x), b.kind).toBeLessThanOrEqual(b.size.x / 2 + EPS);
        expect(Math.abs(y - b.center.y), b.kind).toBeLessThanOrEqual(b.size.y / 2 + EPS);
        expect(Math.abs(z - b.center.z), b.kind).toBeLessThanOrEqual(b.size.z / 2 + EPS);
      }
    }
  });

  it('leaves no point of a block’s box more than maxGap from its shape (invisible corners ≤ 8 cm)', () => {
    expect(NATURE_SHAPES.maxGap).toBeLessThanOrEqual(0.08);
    for (const b of blocks) {
      // A trunk's top is inside its crown, high over any eye; a boulder's bottom and every block's foot are in the ground.
      const skip = b.kind === 'tree' ? (['top', 'bottom'] as const) : (['bottom'] as const);
      const gap = farthest(boxPoints(b, 7, skip), triangles(shapeOf(b)));
      expect(gap, `${b.kind} ${b.size.x}×${b.size.y}×${b.size.z}`).toBeLessThanOrEqual(NATURE_SHAPES.maxGap + EPS);
    }
  });

  it('cuts corners no deeper than the gap allows', () => {
    expect(chamferFor(0.08, 1) / Math.SQRT2).toBeCloseTo(0.08, 9);
    expect(chamferFor(0.08, 0.05)).toBe(0.05);
    const o = octagon(0.3, 0.2, 0.1);
    expect(o).toHaveLength(16);
    for (let i = 0; i < o.length; i += 2) {
      expect(Math.abs(o[i]!)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(o[i + 1]!)).toBeLessThanOrEqual(0.2);
    }
  });

  it('lays log walls in courses level with the world’s, so neighbouring walls meet course to course', () => {
    const L = NATURE_SHAPES.log;
    const wall: MapBlock = { kind: 'log', center: { x: 0, y: 1.05, z: 0 }, size: { x: 0.8, y: 2.1, z: 4 } };
    const ys = logCourses(wall);
    expect(ys[0]).toBeCloseTo(0, 9);
    expect(ys[ys.length - 1]).toBeCloseTo(2.1, 9);
    for (const y of ys.slice(1, -1)) expect((y / L.course) % 1).toBeCloseTo(0, 6);
    // A wall on a step: same world courses, no sliver at its foot.
    const raised = logCourses({ ...wall, center: { x: 0, y: 1.1, z: 0 }, size: { x: 0.8, y: 2, z: 4 } });
    expect(raised[1]! - raised[0]!).toBeGreaterThanOrEqual(L.course / 2);
    for (const y of raised.slice(1, -1)) expect((y / L.course) % 1).toBeCloseTo(0, 6);
    // A low, thick log pile: equal rounds.
    const pile = logCourses({ kind: 'log', center: { x: 0, y: 0.5, z: 0 }, size: { x: 3, y: 1, z: 1 } });
    expect(pile).toHaveLength(L.rounds + 1);
  });

  it('stays cheap: a trunk under 40 triangles, a log course under 40, a boulder under 120', () => {
    const tri = (b: MapBlock) => shapeOf(b).indices.length / 3;
    const tree = blocks.find((b) => b.kind === 'tree')!;
    const boulder = blocks.find((b) => b.kind === 'boulder')!;
    expect(tri(tree)).toBeLessThan(40);
    expect(tri(boulder)).toBeLessThan(120);
    for (const b of blocks.filter((x) => x.kind === 'log')) expect(tri(b) / (logCourses(b).length - 1)).toBeLessThan(40);
  });

  it('draws nothing for other kinds (Depot’s boxes stay boxes)', () => {
    const buf = emptyBuffers();
    appendNatureShape(buf, { kind: 'crate', center: { x: 0, y: 0.5, z: 0 }, size: { x: 1, y: 1, z: 1 } }, paint(), null);
    expect(buf.positions).toHaveLength(0);
    expect(isNatureKind('crate')).toBe(false);
  });
});

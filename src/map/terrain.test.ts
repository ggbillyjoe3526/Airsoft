import { describe, expect, it } from 'vitest';
import { createRng, rngNext } from '../sim/rng';
import { SLOPE_YARD_TERRAIN, planeTerrain } from './testSupport';
import { buildTerrain, steepestSlope, terrainHeightAt, terrainMaxX, terrainMaxZ, terrainMesh, terrainRange, type Terrain, vertexHeight } from './terrain';

/** A 3 × 2 cell terrain with a different bumpy height at every vertex, so a wrong diagonal shows. */
function bumpy(): Terrain {
  const rng = createRng(3);
  return buildTerrain(-3, 2, 2, 3, 2, () => rngNext(rng) * 4 - 1);
}

describe('terrainHeightAt (M33c: one set of triangles)', () => {
  it('reads each vertex height back exactly, and builds heights row by row from the function', () => {
    const t = buildTerrain(10, -4, 0.5, 4, 3, (x, z) => 2 * x + 3 * z);
    expect(t.heights.length).toBe(5 * 4);
    for (let j = 0; j <= 3; j++) for (let i = 0; i <= 4; i++) expect(terrainHeightAt(t, 10 + i * 0.5, -4 + j * 0.5)).toBeCloseTo(2 * (10 + i * 0.5) + 3 * (-4 + j * 0.5), 5);
    const b = bumpy();
    for (let j = 0; j <= b.rows; j++) for (let i = 0; i <= b.cols; i++) expect(terrainHeightAt(b, b.minX + i * b.cell, b.minZ + j * b.cell)).toBeCloseTo(vertexHeight(b, i, j), 6);
  });

  it('interpolates the two triangles of a cell, split along the (x0, z0) to (x1, z1) diagonal', () => {
    // One cell with corner heights h00 = 0, h10 = 1, h01 = 2, h11 = 4 (not a plane).
    const t: Terrain = { minX: 0, minZ: 0, cell: 1, cols: 1, rows: 1, heights: Float32Array.from([0, 1, 2, 4]) };
    // Lower triangle (00, 10, 11), where x >= z: height = 0 + u * 1 + v * (4 - 1).
    expect(terrainHeightAt(t, 0.5, 0.25)).toBeCloseTo(0.5 + 0.25 * 3, 6);
    // Upper triangle (00, 01, 11), where z > x: height = 0 + v * 2 + u * (4 - 2).
    expect(terrainHeightAt(t, 0.25, 0.5)).toBeCloseTo(0.5 * 2 + 0.25 * 2, 6);
    // On the diagonal both agree: halfway from h00 to h11.
    expect(terrainHeightAt(t, 0.5, 0.5)).toBeCloseTo(2, 6);
    expect(terrainHeightAt(t, 0.3, 0.3)).toBeCloseTo(1.2, 6);
    // Centre of the cell: the other diagonal's midpoint (1.5) is NOT the height; the split is (0,0)-(1,1).
    expect(terrainHeightAt(t, 0.5, 0.5)).not.toBeCloseTo(1.5, 3);
  });

  it('is continuous across cell borders', () => {
    const t = bumpy();
    const rng = createRng(11);
    for (let n = 0; n < 200; n++) {
      // A point on a vertical border between cells (x a multiple of the cell), and one on a horizontal border.
      const z = t.minZ + rngNext(rng) * t.rows * t.cell;
      const x = t.minX + (1 + Math.floor(rngNext(rng) * (t.cols - 1))) * t.cell;
      expect(terrainHeightAt(t, x - 1e-6, z)!).toBeCloseTo(terrainHeightAt(t, x + 1e-6, z)!, 4);
      const x2 = t.minX + rngNext(rng) * t.cols * t.cell;
      const z2 = t.minZ + (1 + Math.floor(rngNext(rng) * (t.rows - 1))) * t.cell;
      expect(terrainHeightAt(t, x2, z2 - 1e-6)!).toBeCloseTo(terrainHeightAt(t, x2, z2 + 1e-6)!, 4);
    }
  });

  it('counts the outer edges as inside and is undefined beyond them', () => {
    const t = bumpy();
    expect(terrainMaxX(t)).toBe(3);
    expect(terrainMaxZ(t)).toBe(6);
    expect(terrainHeightAt(t, t.minX, t.minZ)).toBeCloseTo(vertexHeight(t, 0, 0), 6);
    expect(terrainHeightAt(t, terrainMaxX(t), terrainMaxZ(t))).toBeCloseTo(vertexHeight(t, 3, 2), 6);
    expect(terrainHeightAt(t, terrainMaxX(t), 3)).toBeDefined();
    expect(terrainHeightAt(t, 0, terrainMaxZ(t))).toBeDefined();
    expect(terrainHeightAt(t, t.minX - 0.001, 3)).toBeUndefined();
    expect(terrainHeightAt(t, terrainMaxX(t) + 0.001, 3)).toBeUndefined();
    expect(terrainHeightAt(t, 0, t.minZ - 0.001)).toBeUndefined();
    expect(terrainHeightAt(t, 0, terrainMaxZ(t) + 0.001)).toBeUndefined();
    expect(terrainHeightAt(t, 1e6, -1e6)).toBeUndefined();
  });
});

describe('terrainMesh (the same triangles, facing up)', () => {
  it('has two triangles per cell, all wound so the face points up (normal y > 0)', () => {
    for (const t of [bumpy(), SLOPE_YARD_TERRAIN, planeTerrain(0.4, 2, 10)]) {
      const { positions, indices } = terrainMesh(t);
      expect(positions.length).toBe((t.cols + 1) * (t.rows + 1) * 3);
      expect(indices.length).toBe(t.cols * t.rows * 6);
      for (let k = 0; k < indices.length; k += 3) {
        const [a, b, c] = [indices[k]! * 3, indices[k + 1]! * 3, indices[k + 2]! * 3];
        const e1 = [positions[b]! - positions[a]!, positions[b + 1]! - positions[a + 1]!, positions[b + 2]! - positions[a + 2]!];
        const e2 = [positions[c]! - positions[a]!, positions[c + 1]! - positions[a + 1]!, positions[c + 2]! - positions[a + 2]!];
        const ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
        expect(ny).toBeGreaterThan(0);
      }
    }
  });

  it('interpolates to terrainHeightAt at random points: a point on the ground is on the mesh', () => {
    for (const t of [bumpy(), SLOPE_YARD_TERRAIN]) {
      const { positions, indices } = terrainMesh(t);
      const rng = createRng(29);
      for (let n = 0; n < 500; n++) {
        const x = t.minX + rngNext(rng) * t.cols * t.cell;
        const z = t.minZ + rngNext(rng) * t.rows * t.cell;
        // Find the mesh triangle over (x, z) by barycentric coordinates in the xz plane and read its height there.
        let found: number | undefined;
        for (let k = 0; k < indices.length && found === undefined; k += 3) {
          const i0 = indices[k]! * 3;
          const i1 = indices[k + 1]! * 3;
          const i2 = indices[k + 2]! * 3;
          const x0 = positions[i0]!;
          const z0 = positions[i0 + 2]!;
          const det = (positions[i1 + 2]! - positions[i2 + 2]!) * (x0 - positions[i2]!) + (positions[i2]! - positions[i1]!) * (z0 - positions[i2 + 2]!);
          const l0 = ((positions[i1 + 2]! - positions[i2 + 2]!) * (x - positions[i2]!) + (positions[i2]! - positions[i1]!) * (z - positions[i2 + 2]!)) / det;
          const l1 = ((positions[i2 + 2]! - z0) * (x - positions[i2]!) + (x0 - positions[i2]!) * (z - positions[i2 + 2]!)) / det;
          const l2 = 1 - l0 - l1;
          if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) found = l0 * positions[i0 + 1]! + l1 * positions[i1 + 1]! + l2 * positions[i2 + 1]!;
        }
        expect(found, `(${x}, ${z}) is over some triangle`).toBeDefined();
        expect(found!, `(${x}, ${z})`).toBeCloseTo(terrainHeightAt(t, x, z)!, 4);
      }
    }
  });
});

describe('steepestSlope and terrainRange', () => {
  it('reads the gradient of a plane whichever way it tilts', () => {
    expect(steepestSlope(planeTerrain(0.3))).toBeCloseTo(0.3, 5);
    expect(steepestSlope(planeTerrain(0))).toBe(0);
    const tilted = buildTerrain(0, 0, 0.5, 6, 6, (x, z) => 0.3 * x + 0.4 * z);
    expect(steepestSlope(tilted)).toBeCloseTo(0.5, 5);
    // A grid spacing other than 1 m does not change the slope (rise over run).
    expect(steepestSlope(planeTerrain(0.25, 2.5, 15))).toBeCloseTo(0.25, 5);
  });

  it('finds the steepest triangle of uneven ground, not the average', () => {
    // Flat except one cell with a 1 m step up its far corner: its lower triangle (00, 10, 11) has gradient (0, 1).
    const t = buildTerrain(0, 0, 1, 4, 4, (x, z) => (x === 3 && z === 3 ? 1 : 0));
    expect(steepestSlope(t)).toBeGreaterThanOrEqual(1);
    expect(steepestSlope(SLOPE_YARD_TERRAIN)).toBeGreaterThan(0.15);
  });

  it('gives the lowest and highest vertex heights', () => {
    const t = buildTerrain(0, 0, 1, 2, 2, (x, z) => x - 2 * z);
    expect(terrainRange(t)).toEqual({ min: -4, max: 2 });
  });
});

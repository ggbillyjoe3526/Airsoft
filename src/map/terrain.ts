/**
 * Ground that rises and falls (M33c, for Woodland's gentle slope, hill and creek): a heightfield over the map's
 * footprint. Heights sit on a regular grid of vertices `cell` metres apart; each cell is two triangles split along the
 * diagonal from its (x0, z0) corner to its (x1, z1) corner, and every module (physics, the level ray, the nav grid, the
 * mesh) uses those same triangles, so what you see is what you stand on and what stops a BB.
 *
 * Terrain is walkable everywhere it is drawn; maps with terrain keep no floor or ramp block over it (one walkable
 * surface per point, as map/surfaces.ts says). Pure data and maths: no Three.js, no Rapier.
 */
export interface Terrain {
  /** The grid's corner (m): vertex (0, 0) is at (minX, minZ). */
  minX: number;
  minZ: number;
  /** Distance between neighbouring vertices (m). */
  cell: number;
  /** Cells along x and z; there are (cols + 1) × (rows + 1) vertices. */
  cols: number;
  rows: number;
  /** Vertex heights (m), row by row along z: vertex (i, j) is heights[j * (cols + 1) + i]. */
  heights: Float32Array;
}

/** Builds a terrain over [minX, minX + cols × cell] × [minZ, minZ + rows × cell] from a height function. */
export function buildTerrain(minX: number, minZ: number, cell: number, cols: number, rows: number, heightAt: (x: number, z: number) => number): Terrain {
  const heights = new Float32Array((cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) heights[j * (cols + 1) + i] = heightAt(minX + i * cell, minZ + j * cell);
  return { minX, minZ, cell, cols, rows, heights };
}

export const terrainMaxX = (t: Terrain): number => t.minX + t.cols * t.cell;
export const terrainMaxZ = (t: Terrain): number => t.minZ + t.rows * t.cell;

/** Height of vertex (i, j). */
export function vertexHeight(t: Terrain, i: number, j: number): number {
  return t.heights[j * (t.cols + 1) + i]!;
}

/**
 * The ground's height at (x, z), on the cell's triangles; undefined outside the terrain (its edges count as inside).
 */
export function terrainHeightAt(t: Terrain, x: number, z: number): number | undefined {
  const fx = (x - t.minX) / t.cell;
  const fz = (z - t.minZ) / t.cell;
  if (fx < 0 || fz < 0 || fx > t.cols || fz > t.rows) return undefined;
  const i = Math.min(t.cols - 1, Math.floor(fx));
  const j = Math.min(t.rows - 1, Math.floor(fz));
  const u = fx - i;
  const v = fz - j;
  const h00 = vertexHeight(t, i, j);
  const h11 = vertexHeight(t, i + 1, j + 1);
  // Split along (0, 0)–(1, 1): the triangle with (1, 0) below the diagonal, the one with (0, 1) above it.
  if (u >= v) {
    const h10 = vertexHeight(t, i + 1, j);
    return h00 + u * (h10 - h00) + v * (h11 - h10);
  }
  const h01 = vertexHeight(t, i, j + 1);
  return h00 + v * (h01 - h00) + u * (h11 - h01);
}

/** The highest and lowest vertex heights. */
export function terrainRange(t: Terrain): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const h of t.heights) {
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  return { min, max };
}

/**
 * The terrain as a triangle mesh (two per cell, the split terrainHeightAt uses), wound counter-clockwise seen from above
 * so the faces point up: vertex positions (x, y, z) and triangle indices.
 */
export function terrainMesh(t: Terrain): { positions: Float32Array; indices: Uint32Array } {
  const vx = t.cols + 1;
  const positions = new Float32Array(vx * (t.rows + 1) * 3);
  for (let j = 0; j <= t.rows; j++) {
    for (let i = 0; i <= t.cols; i++) {
      const k = (j * vx + i) * 3;
      positions[k] = t.minX + i * t.cell;
      positions[k + 1] = vertexHeight(t, i, j);
      positions[k + 2] = t.minZ + j * t.cell;
    }
  }
  const indices = new Uint32Array(t.cols * t.rows * 6);
  let n = 0;
  for (let j = 0; j < t.rows; j++) {
    for (let i = 0; i < t.cols; i++) {
      const a = j * vx + i; // (0, 0)
      const b = a + 1; // (1, 0)
      const c = a + vx; // (0, 1)
      const d = c + 1; // (1, 1)
      // With +z towards the viewer from above (y up, x right, z down the screen), (a, d, b) runs counter-clockwise.
      indices[n++] = a;
      indices[n++] = d;
      indices[n++] = b;
      indices[n++] = a;
      indices[n++] = c;
      indices[n++] = d;
    }
  }
  return { positions, indices };
}

/** The steepest slope (rise over run) of any of the terrain's triangles. */
export function steepestSlope(t: Terrain): number {
  let worst = 0;
  for (let j = 0; j < t.rows; j++) {
    for (let i = 0; i < t.cols; i++) {
      const h00 = vertexHeight(t, i, j);
      const h10 = vertexHeight(t, i + 1, j);
      const h01 = vertexHeight(t, i, j + 1);
      const h11 = vertexHeight(t, i + 1, j + 1);
      // Lower triangle: gradient (h10 - h00, h11 - h10); upper: (h11 - h01, h01 - h00), per cell length.
      worst = Math.max(worst, Math.hypot(h10 - h00, h11 - h10) / t.cell, Math.hypot(h11 - h01, h01 - h00) / t.cell);
    }
  }
  return worst;
}

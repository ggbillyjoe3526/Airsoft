import type { MapBlock, MapData } from '../map/mapTypes';
import { surfaceHeightAt } from '../map/surfaces';
import { terrainHeightAt, terrainMaxX, terrainMaxZ } from '../map/terrain';
import type { Vec3 } from '../sim/vec';

/**
 * Walkability grid built from map blocks: each cell has one floor height (the walkable surface under its
 * centre; maps never put one walkable surface over another), and is walkable if a character standing
 * there keeps `clearance` from every block that stops walking and from every drop. Neighbouring cells
 * connect only if their floors differ by at most `maxStep`. Pure data, shared by bots (routes) and the
 * simulation (walk-off to the dead zone).
 */
export interface NavGrid {
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  /** 1 = walkable, 0 = blocked; index = row * cols + col. */
  walkable: Uint8Array;
  /** Height of the walkable surface at each cell's centre; NaN where there is none. */
  floorY: Float32Array;
  /** Largest floor height difference between neighbouring cells that a character walks across. */
  maxStep: number;
}

export interface NavGridConfig {
  /** Cell size (metres). Small enough that door gaps still have walkable cells. */
  cell: number;
  /** Distance kept from blocks: the body radius plus a margin so routes don't scrape walls. */
  clearance: number;
  /** Blocks whose top is less than this above a cell's floor can be walked onto (don't block). */
  maxLedge: number;
  /** Blocks whose bottom is this far or more above a cell's floor pass overhead (don't block). */
  bodyHeight: number;
  /** Neighbouring cells whose floors differ by more than this are not connected (a drop, or a platform's side). */
  maxStep: number;
}

const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;
const isSurface = (b: MapBlock): boolean => b.kind === 'floor' || b.kind === 'ramp';

export function buildNavGrid(map: MapData, cfg: NavGridConfig): NavGrid {
  // Bounds: the floor and ramp blocks, and the terrain (M33c).
  const terrain = map.terrain;
  let minX = terrain ? terrain.minX : Number.POSITIVE_INFINITY;
  let maxX = terrain ? terrainMaxX(terrain) : Number.NEGATIVE_INFINITY;
  let minZ = terrain ? terrain.minZ : Number.POSITIVE_INFINITY;
  let maxZ = terrain ? terrainMaxZ(terrain) : Number.NEGATIVE_INFINITY;
  for (const b of map.blocks) {
    if (!isSurface(b)) continue;
    minX = Math.min(minX, b.center.x - b.size.x / 2);
    maxX = Math.max(maxX, b.center.x + b.size.x / 2);
    minZ = Math.min(minZ, b.center.z - b.size.z / 2);
    maxZ = Math.max(maxZ, b.center.z + b.size.z / 2);
  }
  if (!Number.isFinite(minX)) throw new Error(`Map ${map.name} has no floor`);
  const cols = Math.ceil((maxX - minX) / cfg.cell);
  const rows = Math.ceil((maxZ - minZ) / cfg.cell);
  const walkable = new Uint8Array(cols * rows);
  const floorY = new Float32Array(cols * rows).fill(Number.NaN);
  const grid: NavGrid = { cell: cfg.cell, cols, rows, minX, minZ, walkable, floorY, maxStep: cfg.maxStep };

  // Floor heights: the highest walkable surface under each cell's centre (the terrain's ground first, M33c). A cell
  // without one is not walkable.
  if (terrain) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const y = terrainHeightAt(terrain, cellX(grid, i), cellZ(grid, j));
        if (y !== undefined) floorY[j * cols + i] = y;
      }
    }
  }
  for (const b of map.blocks) {
    if (!isSurface(b)) continue;
    forCellsUnder(grid, b, 0, (c, x, z) => {
      const y = surfaceHeightAt(b, x, z);
      if (y !== undefined && !(y <= floorY[c]!)) floorY[c] = y;
    });
  }
  for (let c = 0; c < walkable.length; c++) walkable[c] = Number.isNaN(floorY[c]!) ? 0 : 1;

  // Stamp every blocking box, grown by the clearance, onto the cells it stops walking on: those whose floor
  // it stands on or above (higher than a walkable ledge) without passing overhead.
  const r = cfg.clearance;
  for (const b of map.blocks) {
    if (isSurface(b)) continue;
    forCellsUnder(grid, b, r, (c) => {
      const f = floorY[c]!;
      if (bottom(b) < f + cfg.bodyHeight && top(b) > f + cfg.maxLedge) walkable[c] = 0;
    });
  }
  // Drops inside the level (a platform's edge, a gap between floors): keep the clearance from them on both
  // sides, as from a wall. Cells past the outer edge (the last row or column can overhang it) are left to
  // the outer-edge rule below.
  const inside = (i: number, j: number): boolean => cellX(grid, i) <= maxX && cellZ(grid, j) <= maxZ;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!inside(i, j)) continue;
      if (i + 1 < cols && inside(i + 1, j)) blockNearDrop(grid, r, j * cols + i, j * cols + i + 1);
      if (j + 1 < rows && inside(i, j + 1)) blockNearDrop(grid, r, j * cols + i, (j + 1) * cols + i);
    }
  }
  // The floor's own edge.
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = cellX(grid, i);
      const z = cellZ(grid, j);
      if (x - minX < r || maxX - x < r || z - minZ < r || maxZ - z < r) walkable[j * cols + i] = 0;
    }
  }
  return grid;
}

export const cellX = (g: NavGrid, i: number): number => g.minX + (i + 0.5) * g.cell;
export const cellZ = (g: NavGrid, j: number): number => g.minZ + (j + 0.5) * g.cell;

/** Calls `fn` for every cell whose centre lies within block `b`'s footprint grown by `grow`. */
function forCellsUnder(g: NavGrid, b: MapBlock, grow: number, fn: (c: number, x: number, z: number) => void): void {
  const i0 = Math.max(0, Math.ceil((b.center.x - b.size.x / 2 - grow - g.minX) / g.cell - 0.5));
  const i1 = Math.min(g.cols - 1, Math.floor((b.center.x + b.size.x / 2 + grow - g.minX) / g.cell - 0.5));
  const j0 = Math.max(0, Math.ceil((b.center.z - b.size.z / 2 - grow - g.minZ) / g.cell - 0.5));
  const j1 = Math.min(g.rows - 1, Math.floor((b.center.z + b.size.z / 2 + grow - g.minZ) / g.cell - 0.5));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * g.cols + i, cellX(g, i), cellZ(g, j));
}

/**
 * If neighbouring cells `a` and `b` are split by a drop (floors more than maxStep apart, or one without a
 * floor), blocks every cell within `r` of the edge between them.
 */
function blockNearDrop(g: NavGrid, r: number, a: number, b: number): void {
  const fa = g.floorY[a]!;
  const fb = g.floorY[b]!;
  if (Math.abs(fa - fb) <= g.maxStep || (Number.isNaN(fa) && Number.isNaN(fb))) return;
  const ai = a % g.cols;
  const bi = b % g.cols;
  const ex = (cellX(g, ai) + cellX(g, bi)) / 2;
  const ez = (cellZ(g, (a - ai) / g.cols) + cellZ(g, (b - bi) / g.cols)) / 2;
  const reach = Math.ceil(r / g.cell);
  const i0 = Math.max(0, ai - reach);
  const i1 = Math.min(g.cols - 1, ai + reach);
  const j0 = Math.max(0, (a - ai) / g.cols - reach);
  const j1 = Math.min(g.rows - 1, (a - ai) / g.cols + reach);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (Math.hypot(cellX(g, i) - ex, cellZ(g, j) - ez) < r) g.walkable[j * g.cols + i] = 0;
    }
  }
}

/** True if a character can walk from cell `a` to its neighbour `b`: both walkable, floors at most maxStep apart. */
export function canStep(g: NavGrid, a: number, b: number): boolean {
  return g.walkable[a] === 1 && g.walkable[b] === 1 && Math.abs(g.floorY[a]! - g.floorY[b]!) <= g.maxStep;
}

/** Floor height of the cell containing (x, z): NaN outside the grid or where there is no walkable surface. */
export function floorAt(g: NavGrid, x: number, z: number): number {
  const c = cellIndex(g, x, z);
  return c >= 0 ? g.floorY[c]! : Number.NaN;
}

/** Cell index containing (x, z), or -1 outside the grid. */
export function cellIndex(g: NavGrid, x: number, z: number): number {
  const i = Math.floor((x - g.minX) / g.cell);
  const j = Math.floor((z - g.minZ) / g.cell);
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return -1;
  return j * g.cols + i;
}

export function isWalkableAt(g: NavGrid, x: number, z: number): boolean {
  const c = cellIndex(g, x, z);
  return c >= 0 && g.walkable[c] === 1;
}

/** Nearest walkable cell to (x, z) within `maxRadius` metres (ring search), or -1. */
export function nearestWalkable(g: NavGrid, x: number, z: number, maxRadius: number): number {
  const ci = Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.minX) / g.cell)));
  const cj = Math.min(g.rows - 1, Math.max(0, Math.floor((z - g.minZ) / g.cell)));
  const maxRing = Math.ceil(maxRadius / g.cell);
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let j = cj - ring; j <= cj + ring; j++) {
      for (let i = ci - ring; i <= ci + ring; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
        if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) continue;
        const c = j * g.cols + i;
        if (!g.walkable[c]) continue;
        const d = Math.hypot(cellX(g, i) - x, cellZ(g, j) - z);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    // Anything in a later ring is at least `ring * cell` away.
    if (best >= 0 && bestD <= ring * g.cell) break;
  }
  return bestD <= maxRadius ? best : -1;
}

/**
 * True if a character can walk the straight line a → b: every cell under it (sampled finely) is walkable,
 * and each step from one of those cells to the next is one a character can take (canStep).
 */
export function clearLine(g: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.5)));
  let prev = -1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const c = cellIndex(g, ax + (bx - ax) * t, az + (bz - az) * t);
    if (c < 0 || g.walkable[c] !== 1) return false;
    if (prev >= 0 && c !== prev && !canStep(g, prev, c)) return false;
    prev = c;
  }
  return true;
}

/**
 * True if walking the straight line a → b would step off a floor: some cell under it has no floor, or its
 * floor differs from the one before by more than maxStep (a platform's edge, a ramp's side). Walls and
 * other blocks don't count, only drops; past the grid's edge counts as a drop. Flat maps never have one.
 */
export function dropOnLine(g: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.5)));
  let prev = cellIndex(g, ax, az);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const c = cellIndex(g, ax + (bx - ax) * t, az + (bz - az) * t);
    if (c < 0 || Number.isNaN(g.floorY[c]!)) return true;
    if (prev >= 0 && Math.abs(g.floorY[c]! - g.floorY[prev]!) > g.maxStep) return true;
    prev = c;
  }
  return false;
}

/** Reusable A* working memory for one grid (so searches don't allocate). */
export interface NavSearch {
  g: Float32Array;
  from: Int32Array;
  /** Search generation per cell: a cell's g/from are valid only if stamp === current generation. */
  stamp: Uint32Array;
  closed: Uint32Array;
  generation: number;
  heap: Int32Array;
  heapF: Float32Array;
  cells: number[];
}

export function createNavSearch(grid: NavGrid): NavSearch {
  const n = grid.cols * grid.rows;
  return {
    g: new Float32Array(n),
    from: new Int32Array(n),
    stamp: new Uint32Array(n),
    closed: new Uint32Array(n),
    generation: 0,
    // A cell can be pushed again each time a shorter route to it is found (at most once per neighbour).
    heap: new Int32Array(n * 8),
    heapF: new Float32Array(n * 8),
    cells: [],
  };
}

const SQRT2 = Math.SQRT2;
/** 8 neighbours as (di, dj, cost). */
const NDI = [1, -1, 0, 0, 1, 1, -1, -1];
const NDJ = [0, 0, 1, -1, 1, -1, 1, -1];
const NCOST = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

/**
 * Shortest walkable route from `start` to `goal` (both snapped to the nearest walkable cell within
 * `snap` metres), smoothed into straight segments, written into `out` as waypoints (excluding the
 * start, ending at the goal, or the nearest walkable cell to it). Returns false if there is no route.
 */
export function findPath(g: NavGrid, s: NavSearch, start: Vec3, goal: Vec3, snap: number, out: Vec3[]): boolean {
  const a = nearestWalkable(g, start.x, start.z, snap);
  const b = nearestWalkable(g, goal.x, goal.z, snap);
  if (a < 0 || b < 0 || !astar(g, s, a, b)) {
    out.length = 0;
    return false;
  }
  // Waypoints reuse the objects already in `out`, so re-planning a route doesn't allocate new ones. Each
  // stands on its cell's floor.
  let n = 0;
  const emit = (c: number): void => {
    const x = cellX(g, c % g.cols);
    const y = g.floorY[c]!;
    const z = cellZ(g, Math.floor(c / g.cols));
    const p = out[n];
    if (p) {
      p.x = x;
      p.y = y;
      p.z = z;
    } else {
      out.push({ x, y, z });
    }
    n++;
  };

  // Cells from goal back to start, reversed.
  const cells = s.cells;
  cells.length = 0;
  for (let c = b; c !== a; c = s.from[c]!) cells.push(c);
  cells.push(a);
  cells.reverse();

  // String-pull: from the current anchor, jump to the furthest cell still in a clear straight line.
  let ax = start.x;
  let az = start.z;
  if (!isWalkableAt(g, ax, az)) {
    ax = cellX(g, a % g.cols);
    az = cellZ(g, Math.floor(a / g.cols));
  }
  let k = 0;
  while (k < cells.length - 1) {
    // Walk forward while the straight line from the anchor stays clear (checking every few cells).
    let next = k + 1;
    for (let m = Math.min(cells.length - 1, k + 2); ; m = Math.min(cells.length - 1, m + 2)) {
      const c = cells[m]!;
      if (!clearLine(g, ax, az, cellX(g, c % g.cols), cellZ(g, Math.floor(c / g.cols)))) break;
      next = m;
      if (m === cells.length - 1) break;
    }
    const c = cells[next]!;
    ax = cellX(g, c % g.cols);
    az = cellZ(g, Math.floor(c / g.cols));
    emit(c);
    k = next;
  }
  if (n === 0) emit(b);
  out.length = n;
  // End exactly on the goal when it's walkable (the search works in cell centres).
  const end = out[n - 1]!;
  const fromX = n > 1 ? out[n - 2]!.x : start.x;
  const fromZ = n > 1 ? out[n - 2]!.z : start.z;
  if (isWalkableAt(g, goal.x, goal.z) && clearLine(g, fromX, fromZ, goal.x, goal.z)) {
    end.x = goal.x;
    end.y = floorAt(g, goal.x, goal.z);
    end.z = goal.z;
  }
  return true;
}

/** 8-neighbour A* without corner cutting (octile heuristic). Fills s.from; returns false if `b` is unreachable. */
function astar(g: NavGrid, s: NavSearch, a: number, b: number): boolean {
  const gen = ++s.generation;
  const cols = g.cols;
  const rows = g.rows;
  const walk = g.walkable;
  const floorY = g.floorY;
  const maxStep = g.maxStep;
  const heap = s.heap;
  const heapF = s.heapF;
  const bi = b % cols;
  const bj = (b - bi) / cols;
  let size = 0;

  s.stamp[a] = gen;
  s.g[a] = 0;
  s.from[a] = a;
  heap[0] = a;
  heapF[0] = 0;
  size = 1;
  while (size > 0) {
    // Pop the lowest f.
    const c: number = heap[0]!;
    size--;
    if (size > 0) {
      const lc = heap[size]!;
      const lf = heapF[size]!;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= size) break;
        const r = l + 1;
        const m = r < size && heapF[r]! < heapF[l]! ? r : l;
        if (heapF[m]! >= lf) break;
        heap[i] = heap[m]!;
        heapF[i] = heapF[m]!;
        i = m;
      }
      heap[i] = lc;
      heapF[i] = lf;
    }
    if (s.closed[c] === gen) continue;
    s.closed[c] = gen;
    if (c === b) return true;
    const ci = c % cols;
    const cj: number = (c - ci) / cols;
    const gc = s.g[c]!;
    const fc = floorY[c]!;
    for (let k = 0; k < 8; k++) {
      const ni = ci + NDI[k]!;
      const nj: number = cj + NDJ[k]!;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const n = nj * cols + ni;
      // canStep(c, n), inlined (c is walkable).
      if (!walk[n] || s.closed[n] === gen || Math.abs(floorY[n]! - fc) > maxStep) continue;
      // No squeezing diagonally past a blocked cell (or a drop).
      if (k >= 4) {
        const sa = cj * cols + ni;
        const sb = nj * cols + ci;
        if (!walk[sa] || !walk[sb] || Math.abs(floorY[sa]! - fc) > maxStep || Math.abs(floorY[sb]! - fc) > maxStep) continue;
      }
      const ng = gc + NCOST[k]!;
      if (s.stamp[n] === gen && s.g[n]! <= ng) continue;
      s.stamp[n] = gen;
      s.g[n] = ng;
      s.from[n] = c;
      if (size >= heap.length) return false;
      const di = Math.abs(ni - bi);
      const dj = Math.abs(nj - bj);
      const f = ng + (di > dj ? di + (SQRT2 - 1) * dj : dj + (SQRT2 - 1) * di);
      // Push and sift up.
      let i = size++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heapF[p]! <= f) break;
        heap[i] = heap[p]!;
        heapF[i] = heapF[p]!;
        i = p;
      }
      heap[i] = n;
      heapF[i] = f;
    }
  }
  return false;
}

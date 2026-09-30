import type { MapBlock, MapData } from '../map/mapTypes';
import type { Vec3 } from '../sim/vec';

/**
 * Walkability grid built from map blocks: a cell is walkable if a character standing at its centre
 * keeps `clearance` from every block that stops walking. Pure data, shared by bots (routes) and the
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
}

export interface NavGridConfig {
  /** Cell size (metres). Small enough that door gaps still have walkable cells. */
  cell: number;
  /** Distance kept from blocks: the body radius plus a margin so routes don't scrape walls. */
  clearance: number;
  /** Blocks lower than this can be walked onto (don't block). */
  maxLedge: number;
  /** Blocks whose bottom is above this pass overhead (don't block). */
  bodyHeight: number;
}

const top = (b: MapBlock): number => b.center.y + b.size.y / 2;
const bottom = (b: MapBlock): number => b.center.y - b.size.y / 2;

export function buildNavGrid(map: MapData, cfg: NavGridConfig): NavGrid {
  // Bounds: the floor blocks.
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const b of map.blocks) {
    if (b.kind !== 'floor') continue;
    minX = Math.min(minX, b.center.x - b.size.x / 2);
    maxX = Math.max(maxX, b.center.x + b.size.x / 2);
    minZ = Math.min(minZ, b.center.z - b.size.z / 2);
    maxZ = Math.max(maxZ, b.center.z + b.size.z / 2);
  }
  if (!Number.isFinite(minX)) throw new Error(`Map ${map.name} has no floor`);
  const cols = Math.ceil((maxX - minX) / cfg.cell);
  const rows = Math.ceil((maxZ - minZ) / cfg.cell);
  const walkable = new Uint8Array(cols * rows).fill(1);
  const grid: NavGrid = { cell: cfg.cell, cols, rows, minX, minZ, walkable };

  // Stamp every blocking box, grown by the clearance, onto the grid.
  const r = cfg.clearance;
  for (const b of map.blocks) {
    if (b.kind === 'floor' || bottom(b) >= cfg.bodyHeight || top(b) <= cfg.maxLedge) continue;
    const x0 = b.center.x - b.size.x / 2 - r;
    const x1 = b.center.x + b.size.x / 2 + r;
    const z0 = b.center.z - b.size.z / 2 - r;
    const z1 = b.center.z + b.size.z / 2 + r;
    const i0 = Math.max(0, Math.ceil((x0 - minX) / cfg.cell - 0.5));
    const i1 = Math.min(cols - 1, Math.floor((x1 - minX) / cfg.cell - 0.5));
    const j0 = Math.max(0, Math.ceil((z0 - minZ) / cfg.cell - 0.5));
    const j1 = Math.min(rows - 1, Math.floor((z1 - minZ) / cfg.cell - 0.5));
    for (let j = j0; j <= j1; j++) walkable.fill(0, j * cols + i0, j * cols + i1 + 1);
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

/** True if a character can walk the straight line a → b (every cell under it, sampled finely, is walkable). */
export function clearLine(g: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.5)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (!isWalkableAt(g, ax + (bx - ax) * t, az + (bz - az) * t)) return false;
  }
  return true;
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
  out.length = 0;
  const a = nearestWalkable(g, start.x, start.z, snap);
  const b = nearestWalkable(g, goal.x, goal.z, snap);
  if (a < 0 || b < 0) return false;
  if (!astar(g, s, a, b)) return false;

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
    out.push({ x: ax, y: goal.y, z: az });
    k = next;
  }
  if (out.length === 0) out.push({ x: cellX(g, b % g.cols), y: goal.y, z: cellZ(g, Math.floor(b / g.cols)) });
  // End exactly on the goal when it's walkable (the search works in cell centres).
  const end = out[out.length - 1]!;
  if (isWalkableAt(g, goal.x, goal.z) && clearLine(g, out.length > 1 ? out[out.length - 2]!.x : start.x, out.length > 1 ? out[out.length - 2]!.z : start.z, goal.x, goal.z)) {
    end.x = goal.x;
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
    for (let k = 0; k < 8; k++) {
      const ni = ci + NDI[k]!;
      const nj: number = cj + NDJ[k]!;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const n = nj * cols + ni;
      if (!walk[n] || s.closed[n] === gen) continue;
      // No squeezing diagonally between two blocked cells.
      if (k >= 4 && (!walk[cj * cols + ni] || !walk[nj * cols + ci])) continue;
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

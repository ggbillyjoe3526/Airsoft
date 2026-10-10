import type { MapBlock, MapData } from '../map/mapTypes';
import { surfaceHeightAt } from '../map/surfaces';
import { terrainHeightAt, terrainMaxX, terrainMaxZ } from '../map/terrain';
import type { Vec3 } from '../sim/vec';

/**
 * Walkability grid built from map blocks, in layers (M34b): each cell holds a node per floor over it (the walkable
 * surfaces under its centre with headroom above them, lowest first), so a hall under an upper floor and the floor above
 * it are two nodes of the same cells. A node is walkable if a character standing on it keeps `clearance` from every
 * block that stops walking and from every drop on its own floor. A node connects to the node of a neighbouring cell
 * whose floor is within `maxStep` of its own (at most one: floors in a cell are a body's height apart). Pure data,
 * shared by bots (routes) and the simulation (walk-off to the dead zone). On a map with no floor over another every cell
 * has at most one node and the grid is the flat one it always was.
 *
 * Every query that names a point takes its height too, and answers for the floor at that height: the highest floor
 * at most `NODE_PICK_ABOVE` above it (the floor someone standing, crouching or jumping there is over), or the cell's
 * lowest floor if they are below them all.
 */
export interface NavGrid {
  cell: number;
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  /** Cell c's floors are nodes cellStart[c] .. cellStart[c + 1] - 1, lowest first; index = row * cols + col. */
  cellStart: Int32Array;
  /** The cell each node is in. */
  nodeCell: Int32Array;
  /** Per node: 1 = walkable, 0 = blocked. */
  walkable: Uint8Array;
  /** Per node: height of its floor at the cell's centre. */
  floorY: Float32Array;
  /** Most floors any one cell has: 1 on a map without a floor over another. */
  layers: number;
  /** Largest floor height difference between neighbouring nodes that a character walks across. */
  maxStep: number;
  /** The headroom a floor needs (the body's height): a route end never snaps to a floor further below it than this. */
  headroom: number;
  /** A route end snaps to a floor further below it than this only when none nearer its height is in reach (G11). */
  snapDrop: number;
}

export interface NavGridConfig {
  /** Cell size (metres). Small enough that door gaps still have walkable cells. */
  cell: number;
  /** Distance kept from blocks: the body radius plus a margin so routes don't scrape walls. */
  clearance: number;
  /** Blocks whose top is less than this above a node's floor can be walked onto (don't block). */
  maxLedge: number;
  /** Blocks whose bottom is this far or more above a node's floor pass overhead (don't block); also the headroom a floor needs. */
  bodyHeight: number;
  /** Neighbouring nodes whose floors differ by more than this are not connected (a drop, or a platform's side). */
  maxStep: number;
  /** NavGrid.snapDrop as a share of bodyHeight. */
  snapDropShare: number;
}

/**
 * How far above a point (m) a floor still counts as the one under it. Less than any storey (floors in a cell are at
 * least a body's height apart) and more than a jump lifts the feet off the floor below.
 */
export const NODE_PICK_ABOVE = 0.5;

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
  const n = cols * rows;
  const frame = { cell: cfg.cell, cols, rows, minX, minZ };

  // Every walkable surface over each cell's centre, as (height there, the bottom of the solid under it) pairs, packed
  // per cell (counted first, then filled): the terrain's ground (M33c), with nothing under it, then the floor and ramp
  // tops.
  const surfStart = new Int32Array(n + 1);
  const ground = terrain ? new Float64Array(n).fill(Number.NaN) : undefined;
  if (terrain && ground) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const y = terrainHeightAt(terrain, cellX(frame, i), cellZ(frame, j));
        if (y === undefined) continue;
        ground[j * cols + i] = y;
        surfStart[j * cols + i + 1]!++;
      }
    }
  }
  for (const b of map.blocks) {
    if (!isSurface(b)) continue;
    forCellsUnder(frame, b, 0, (c, x, z) => {
      if (surfaceHeightAt(b, x, z) !== undefined) surfStart[c + 1]!++;
    });
  }
  for (let c = 0; c < n; c++) surfStart[c + 1]! += surfStart[c]!;
  const total = surfStart[n]!;
  const surfY = new Float64Array(total);
  const surfBottom = new Float64Array(total);
  const fill = surfStart.slice(0, n);
  if (ground) {
    for (let c = 0; c < n; c++) {
      if (Number.isNaN(ground[c]!)) continue;
      const k = fill[c]!++;
      surfY[k] = ground[c]!;
      surfBottom[k] = Number.NEGATIVE_INFINITY;
    }
  }
  for (const b of map.blocks) {
    if (!isSurface(b)) continue;
    forCellsUnder(frame, b, 0, (c, x, z) => {
      const y = surfaceHeightAt(b, x, z);
      if (y === undefined) return;
      const k = fill[c]!++;
      surfY[k] = y;
      surfBottom[k] = bottom(b);
    });
  }

  // A cell's floors: each surface with headroom over it (no other surface's solid within a body's height above it, at
  // the centre), lowest first; of two floors closer than a body's height (one surface just over another) the higher.
  const cellStart = new Int32Array(n + 1);
  const floors = new Float32Array(total);
  const cellOf = new Int32Array(total);
  let count = 0;
  let layers = 0;
  const kept: number[] = [];
  for (let c = 0; c < n; c++) {
    cellStart[c] = count;
    const s0 = surfStart[c]!;
    const s1 = surfStart[c + 1]!;
    if (s0 === s1) continue;
    kept.length = 0;
    for (let k = s0; k < s1; k++) {
      const f = surfY[k]!;
      let free = true;
      for (let o = s0; o < s1 && free; o++) {
        if (o !== k && surfBottom[o]! < f + cfg.bodyHeight && surfY[o]! > f + cfg.maxLedge) free = false;
      }
      if (free) kept.push(f);
    }
    if (kept.length > 1) kept.sort((a, b) => a - b);
    const first = count;
    for (let k = 0; k < kept.length; k++) {
      if (k + 1 < kept.length && kept[k + 1]! - kept[k]! < cfg.bodyHeight) continue;
      floors[count] = kept[k]!;
      cellOf[count] = c;
      count++;
    }
    layers = Math.max(layers, count - first);
  }
  cellStart[n] = count;
  const grid: NavGrid = {
    ...frame,
    cellStart,
    nodeCell: cellOf.slice(0, count),
    walkable: new Uint8Array(count).fill(1),
    floorY: floors.slice(0, count),
    layers,
    maxStep: cfg.maxStep,
    headroom: cfg.bodyHeight,
    snapDrop: cfg.bodyHeight * cfg.snapDropShare,
  };

  // Stamp every blocking box, grown by the clearance, onto the nodes it stops walking on: those whose floor it stands
  // on or above (higher than a walkable ledge) without passing overhead.
  const r = cfg.clearance;
  for (const b of map.blocks) {
    if (isSurface(b)) continue;
    forCellsUnder(grid, b, r, (c) => {
      for (let k = cellStart[c]!; k < cellStart[c + 1]!; k++) {
        const f = grid.floorY[k]!;
        if (bottom(b) < f + cfg.bodyHeight && top(b) > f + cfg.maxLedge) grid.walkable[k] = 0;
      }
    });
  }
  // Drops inside the level (a platform's edge, a gap between floors): keep the clearance from them on both
  // sides, as from a wall. Cells past the outer edge (the last row or column can overhang it) are left to
  // the outer-edge rule below.
  const inside = (i: number, j: number): boolean => cellX(grid, i) <= maxX && cellZ(grid, j) <= maxZ;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (!inside(i, j)) continue;
      if (i + 1 < cols && inside(i + 1, j)) blockNearDrops(grid, r, j * cols + i, j * cols + i + 1, cfg.bodyHeight / 2);
      if (j + 1 < rows && inside(i, j + 1)) blockNearDrops(grid, r, j * cols + i, (j + 1) * cols + i, cfg.bodyHeight / 2);
    }
  }
  // The floor's own edge.
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = cellX(grid, i);
      const z = cellZ(grid, j);
      if (x - minX < r || maxX - x < r || z - minZ < r || maxZ - z < r) {
        const c = j * cols + i;
        grid.walkable.fill(0, cellStart[c]!, cellStart[c + 1]!);
      }
    }
  }
  return grid;
}

/** The grid's frame: what cell positions need. */
type GridFrame = Pick<NavGrid, 'cell' | 'cols' | 'rows' | 'minX' | 'minZ'>;

export const cellX = (g: GridFrame, i: number): number => g.minX + (i + 0.5) * g.cell;
export const cellZ = (g: GridFrame, j: number): number => g.minZ + (j + 0.5) * g.cell;
/** Position of node `k`'s cell centre on the ground plane. */
export const nodeX = (g: NavGrid, k: number): number => cellX(g, g.nodeCell[k]! % g.cols);
export const nodeZ = (g: NavGrid, k: number): number => cellZ(g, Math.floor(g.nodeCell[k]! / g.cols));

/** Calls `fn` for every cell whose centre lies within block `b`'s footprint grown by `grow`. */
function forCellsUnder(g: GridFrame, b: MapBlock, grow: number, fn: (c: number, x: number, z: number) => void): void {
  const i0 = Math.max(0, Math.ceil((b.center.x - b.size.x / 2 - grow - g.minX) / g.cell - 0.5));
  const i1 = Math.min(g.cols - 1, Math.floor((b.center.x + b.size.x / 2 + grow - g.minX) / g.cell - 0.5));
  const j0 = Math.max(0, Math.ceil((b.center.z - b.size.z / 2 - grow - g.minZ) / g.cell - 0.5));
  const j1 = Math.min(g.rows - 1, Math.floor((b.center.z + b.size.z / 2 + grow - g.minZ) / g.cell - 0.5));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * g.cols + i, cellX(g, i), cellZ(g, j));
}

/**
 * Neighbouring cells `a` and `b`: every floor of either with no floor within maxStep across the edge between them
 * (a platform's edge, a balcony's, a ramp's side, the end of a floor) is a drop at that floor's height. Blocks, within
 * `r` of the edge, each cell's floor nearest that height (if it is within `level` of it: the same storey).
 */
function blockNearDrops(g: NavGrid, r: number, a: number, b: number, level: number): void {
  for (let k = g.cellStart[a]!; k < g.cellStart[a + 1]!; k++) if (stepNode(g, k, b) < 0) blockNearEdge(g, r, a, b, g.floorY[k]!, level);
  for (let k = g.cellStart[b]!; k < g.cellStart[b + 1]!; k++) if (stepNode(g, k, a) < 0) blockNearEdge(g, r, a, b, g.floorY[k]!, level);
}

function blockNearEdge(g: NavGrid, r: number, a: number, b: number, y: number, level: number): void {
  const ai = a % g.cols;
  const bi = b % g.cols;
  const aj = (a - ai) / g.cols;
  const ex = (cellX(g, ai) + cellX(g, bi)) / 2;
  const ez = (cellZ(g, aj) + cellZ(g, (b - bi) / g.cols)) / 2;
  const reach = Math.ceil(r / g.cell);
  const i0 = Math.max(0, ai - reach);
  const i1 = Math.min(g.cols - 1, ai + reach);
  const j0 = Math.max(0, aj - reach);
  const j1 = Math.min(g.rows - 1, aj + reach);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (Math.hypot(cellX(g, i) - ex, cellZ(g, j) - ez) >= r) continue;
      const k = nearestNode(g, j * g.cols + i, y);
      if (k >= 0 && Math.abs(g.floorY[k]! - y) < level) g.walkable[k] = 0;
    }
  }
}

/** The node of cell `c` whose floor is nearest height `y`, or -1 if the cell has none. */
function nearestNode(g: NavGrid, c: number, y: number): number {
  let best = -1;
  let bestD = Number.POSITIVE_INFINITY;
  for (let k = g.cellStart[c]!; k < g.cellStart[c + 1]!; k++) {
    const d = Math.abs(g.floorY[k]! - y);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/** The node of cell `c` a character on node `k` steps onto (floors at most maxStep apart, walkable or not), or -1. */
export function stepNode(g: NavGrid, k: number, c: number): number {
  const s = g.cellStart[c]!;
  // One floor (most cells): no search.
  const n = g.cellStart[c + 1]! - s === 1 ? s : nearestNode(g, c, g.floorY[k]!);
  return n >= 0 && Math.abs(g.floorY[n]! - g.floorY[k]!) <= g.maxStep ? n : -1;
}

/** True if a character can walk from node `a` to node `b` of a neighbouring cell: both walkable, floors at most maxStep apart. */
export function canStep(g: NavGrid, a: number, b: number): boolean {
  return g.walkable[a] === 1 && g.walkable[b] === 1 && Math.abs(g.floorY[a]! - g.floorY[b]!) <= g.maxStep;
}

/** Cell index containing (x, z), or -1 outside the grid. */
export function cellIndex(g: GridFrame, x: number, z: number): number {
  const i = Math.floor((x - g.minX) / g.cell);
  const j = Math.floor((z - g.minZ) / g.cell);
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return -1;
  return j * g.cols + i;
}

/** The floor of cell `c` under height `y` (see NavGrid), or -1 if the cell has none. */
function pickNode(g: NavGrid, c: number, y: number): number {
  const s = g.cellStart[c]!;
  const e = g.cellStart[c + 1]!;
  if (s === e) return -1;
  for (let k = e - 1; k > s; k--) if (g.floorY[k]! <= y + NODE_PICK_ABOVE) return k;
  return s;
}

/** The node under the point (x, y, z): its cell's floor under that height, or -1 outside the grid or where there is none. */
export function nodeAt(g: NavGrid, x: number, y: number, z: number): number {
  const c = cellIndex(g, x, z);
  return c >= 0 ? pickNode(g, c, y) : -1;
}

/** Floor height under the point (x, y, z): NaN outside the grid or where there is no walkable surface. */
export function floorAt(g: NavGrid, x: number, y: number, z: number): number {
  const k = nodeAt(g, x, y, z);
  return k >= 0 ? g.floorY[k]! : Number.NaN;
}

/** True if the floor under the point (x, y, z) is walkable there. */
export function isWalkableAt(g: NavGrid, x: number, y: number, z: number): boolean {
  const k = nodeAt(g, x, y, z);
  return k >= 0 && g.walkable[k] === 1;
}

/**
 * Nearest walkable node to (x, z) within `maxRadius` metres (ring search), each cell judged at its floor under `y`; or
 * -1. A floor more than a storey's headroom below `y` doesn't count: from a balcony's edge, the nearest spot is on the
 * balcony, not in the street under it. Nor, where one in reach is, does a floor more than `snapDrop` below `y` (G11): a
 * body standing on a dock's lip lower than a storey, its middle just past the edge, stands over the ground below,
 * which was the nearest walkable cell; a route from there walked a bot off the dock (Depot seed 11).
 */
export function nearestWalkable(g: NavGrid, x: number, y: number, z: number, maxRadius: number): number {
  const k = nearestWalkableFrom(g, x, y, z, maxRadius, g.snapDrop);
  return k >= 0 ? k : nearestWalkableFrom(g, x, y, z, maxRadius, Number.POSITIVE_INFINITY);
}

/** nearestWalkable's ring search, counting only floors at most `level` below `y` (as well as the headroom rule). */
function nearestWalkableFrom(g: NavGrid, x: number, y: number, z: number, maxRadius: number, level: number): number {
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
        const k = pickNode(g, j * g.cols + i, y);
        if (k < 0 || !g.walkable[k] || g.floorY[k]! < y - Math.min(level, g.headroom)) continue;
        const d = Math.hypot(cellX(g, i) - x, cellZ(g, j) - z);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
    }
    // Anything in a later ring is at least `ring * cell` away.
    if (best >= 0 && bestD <= ring * g.cell) break;
  }
  return bestD <= maxRadius ? best : -1;
}

/** Eight unit directions (x, z) round a point, for the leg probes. */
const PROBE_X = [1, -1, 0, 0, Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2, -Math.SQRT1_2];
const PROBE_Z = [0, 0, 1, -1, Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2];

/**
 * Walks the straight line from the point (ax, ay, az) to (bx, bz) on foot, from the floor under the start, stepping from
 * floor to floor (stepNode) as it crosses cells. Returns the node it ends on, or -1 if a step is not one a character can
 * take (no floor within maxStep, or a blocked node). With `probe` > 0 every sample must also have walkable nodes on its
 * own floor `probe` metres away in eight directions (see clearLineFor).
 */
function walkLine(g: NavGrid, ax: number, ay: number, az: number, bx: number, bz: number, probe: number): number {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.5)));
  let node = nodeAt(g, ax, ay, az);
  if (node < 0 || g.walkable[node] !== 1) return -1;
  let cell = g.nodeCell[node]!;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const c = cellIndex(g, x, z);
    if (c < 0) return -1;
    if (c !== cell) {
      const next = stepNode(g, node, c);
      if (next < 0 || g.walkable[next] !== 1) return -1;
      node = next;
      cell = c;
    }
    if (probe > 0) {
      for (let k = 0; k < PROBE_X.length; k++) {
        const pc = cellIndex(g, x + PROBE_X[k]! * probe, z + PROBE_Z[k]! * probe);
        if (pc < 0) return -1;
        if (pc === cell) continue;
        const p = stepNode(g, node, pc);
        if (p < 0 || g.walkable[p] !== 1) return -1;
      }
    }
  }
  return node;
}

/**
 * True if a character can walk the straight line from the point (ax, ay, az) to (bx, bz): every cell under it (sampled
 * finely) has a walkable floor, and each step from one of those floors to the next is one a character can take.
 */
export function clearLine(g: NavGrid, ax: number, ay: number, az: number, bx: number, bz: number): boolean {
  return walkLine(g, ax, ay, az, bx, bz, 0) >= 0;
}

/**
 * clearLine that also keeps a body clear of corners (audit AI-12): every sample of the line must have walkable nodes
 * `probe` metres away from it in eight directions. A walkable cell's centre keeps the grid's clearance from blocks,
 * but a point inside the cell can be up to half a cell's diagonal nearer, so a plain clearLine leg can pass ~8 cm
 * inside the body at a corner. A probe's node is blocked whenever the probe point is within clearance minus half a
 * cell diagonal of a block (or drop), so with `probe` = radius + half a cell diagonal − clearance (NAV.legProbe) a
 * passing line keeps at least `radius` from every block. Only the bots' route string-pulling uses it: a leg it
 * refuses costs a waypoint, never the route. `probe` 0 is plain clearLine.
 */
export function clearLineFor(g: NavGrid, ax: number, ay: number, az: number, bx: number, bz: number, probe: number): boolean {
  return walkLine(g, ax, ay, az, bx, bz, probe) >= 0;
}

/**
 * True if walking the straight line from the point (ax, ay, az) to (bx, bz) would step off a floor: some cell under it
 * has no floor within maxStep of the one before (a platform's edge, a balcony's, a ramp's side). Walls and other blocks
 * don't count, only drops; past the grid's edge counts as a drop. Flat maps never have one. Given `wallAbove`, a cell
 * whose every floor is more than that above the one before is a wall the body is stopped by, not a ledge: the line
 * goes on past it on its own floor (G11: only a side low enough to ride up onto counts, besides drops).
 */
export function dropOnLine(g: NavGrid, ax: number, ay: number, az: number, bx: number, bz: number, wallAbove = Number.POSITIVE_INFINITY): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / (g.cell * 0.5)));
  let node = nodeAt(g, ax, ay, az);
  let cell = cellIndex(g, ax, az);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const c = cellIndex(g, ax + (bx - ax) * t, az + (bz - az) * t);
    if (c < 0 || g.cellStart[c] === g.cellStart[c + 1]) return true;
    if (c === cell) continue;
    // Starting off any floor, the first floor met is where the line is.
    const next = node >= 0 ? stepNode(g, node, c) : pickNode(g, c, ay);
    if (next < 0 && node >= 0 && g.floorY[g.cellStart[c]!]! > g.floorY[node]! + wallAbove) continue;
    if (next < 0) return true;
    node = next;
    cell = c;
  }
  return false;
}

/**
 * Reusable A* working memory for one grid (so searches don't allocate). It also holds a search that is part-way done
 * (audit AI-04: a bot's route search runs a budget of node expansions a tick and carries on from here the next tick).
 */
export interface NavSearch {
  g: Float32Array;
  from: Int32Array;
  /** Search generation per node: a node's g/from are valid only if stamp === current generation. */
  stamp: Uint32Array;
  closed: Uint32Array;
  generation: number;
  heap: Int32Array;
  heapF: Float32Array;
  /** Entries in the open list of the search under way. */
  size: number;
  /** Node expansions the last stepRoute made (what it spent of its budget). */
  expanded: number;
  /** The search under way: its first start node and its goal node (-1: none, a distance field's search). */
  startNode: number;
  goalNode: number;
  nodes: number[];
}

export function createNavSearch(grid: NavGrid): NavSearch {
  const n = grid.floorY.length;
  return {
    g: new Float32Array(n),
    from: new Int32Array(n),
    stamp: new Uint32Array(n),
    closed: new Uint32Array(n),
    generation: 0,
    // The open list holds a node again each time a shorter route to it is found, but on a real map it peaks far
    // below the node count (audit AI-11: low thousands on Depot's 42k cells); twice the nodes is ample, and a search
    // that ever needs more grows it once (astar) rather than failing.
    heap: new Int32Array(n * NAV_HEAP_PER_CELL),
    heapF: new Float32Array(n * NAV_HEAP_PER_CELL),
    size: 0,
    expanded: 0,
    startNode: -1,
    goalNode: -1,
    nodes: [],
  };
}

/** Open-list slots per grid node a NavSearch starts with (see createNavSearch). */
export const NAV_HEAP_PER_CELL = 2;

/** Doubles a search's open list, keeping its first `size` entries (only when a search outgrows it). */
function growHeap(s: NavSearch, size: number): void {
  const heap = new Int32Array(s.heap.length * 2);
  const heapF = new Float32Array(s.heapF.length * 2);
  heap.set(s.heap.subarray(0, size));
  heapF.set(s.heapF.subarray(0, size));
  s.heap = heap;
  s.heapF = heapF;
}

const SQRT2 = Math.SQRT2;
/** 8 neighbours as (di, dj, cost). */
const NDI = [1, -1, 0, 0, 1, 1, -1, -1];
const NDJ = [0, 0, 1, -1, 1, -1, 1, -1];
const NCOST = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

/** How a route search's step ended: the goal reached, no route, or its expansion budget spent with the search open. */
export type SearchStep = 'found' | 'none' | 'pending';

/**
 * Shortest walkable route from `start` to `goal` (both snapped to the nearest walkable node within `snap` metres, on
 * the floor under each), smoothed into straight segments, written into `out` as waypoints (excluding the start, ending
 * at the goal, or the nearest walkable node to it), each on its floor. Returns false if there is no route. `legProbe`
 * (> 0) keeps the straight legs a body's width from corners (see clearLineFor). The whole search runs in this call;
 * beginRoute, stepRoute and endRoute run one a budget at a time.
 */
export function findPath(g: NavGrid, s: NavSearch, start: Vec3, goal: Vec3, snap: number, out: Vec3[], legProbe = 0): boolean {
  if (!beginRoute(g, s, start, goal, snap) || stepRoute(g, s, Number.POSITIVE_INFINITY) !== 'found') {
    out.length = 0;
    return false;
  }
  endRoute(g, s, start, goal, out, legProbe);
  return true;
}

/**
 * Opens a route search from `start` to `goal` in `s` (snapped as findPath does), dropping any search left open there.
 * Returns false, with nothing open, when either end has no walkable node within `snap`.
 */
export function beginRoute(g: NavGrid, s: NavSearch, start: Vec3, goal: Vec3, snap: number): boolean {
  s.size = 0;
  const a = nearestWalkable(g, start.x, start.y, start.z, snap);
  const b = nearestWalkable(g, goal.x, goal.y, goal.z, snap);
  if (a < 0 || b < 0) return false;
  openSearch(s, b);
  pushStart(s, a);
  return true;
}

/** Runs the open search for at most `budget` node expansions (audit AI-04). */
export function stepRoute(g: NavGrid, s: NavSearch, budget: number): SearchStep {
  return expand(g, s, budget);
}

/**
 * Writes the route a search that returned 'found' leads to into `out`, as findPath does, smoothed from `start` (where
 * the walker is now: a few ticks on from where the search began, it still reaches the first node in a straight line
 * or the string-pulling below steps back to it).
 */
export function endRoute(g: NavGrid, s: NavSearch, start: Vec3, goal: Vec3, out: Vec3[], legProbe: number): void {
  const a = s.startNode;
  const nodes = s.nodes;
  nodes.length = 0;
  for (let k = s.goalNode; k !== a; k = s.from[k]!) nodes.push(k);
  nodes.push(a);
  nodes.reverse();
  s.size = 0;
  pullRoute(g, nodes, start, goal, out, legProbe);
}

/**
 * Walking distance from every node to the nearest of `sources` (each snapped to its nearest walkable node within
 * `snap`), in cells, +Infinity where none can be reached: one search over the whole grid, run when a match is set up
 * (audit SIM-01) so a walk-off route is a walk down it (descendField) rather than a search at the hit. Steps are the
 * route search's, both ways alike: floors at most maxStep apart, no corner cutting.
 */
export function buildDistanceField(g: NavGrid, sources: readonly Vec3[], snap: number): Float32Array {
  const field = new Float32Array(g.floorY.length).fill(Number.POSITIVE_INFINITY);
  const s = createNavSearch(g);
  openSearch(s, -1);
  for (const p of sources) {
    const k = nearestWalkable(g, p.x, p.y, p.z, snap);
    if (k >= 0) pushStart(s, k);
  }
  if (s.size === 0) return field;
  expand(g, s, Number.POSITIVE_INFINITY);
  for (let k = 0; k < field.length; k++) if (s.closed[k] === s.generation) field[k] = s.g[k]!;
  return field;
}

/**
 * Writes into `nodes` the route from node `a` down `field` (buildDistanceField) to one of its sources: each step to the
 * neighbour whose distance plus the step's length is least, which is a shortest route. Of steps that tie (on a grid
 * many routes are equally short) it takes the one ending nearest (towardX, towardZ), so the route keeps near the
 * straight line there and smooths into the same legs a search's would. Returns false, `nodes` empty, when `a` can't
 * reach a source.
 */
export function descendField(g: NavGrid, field: Float32Array, a: number, towardX: number, towardZ: number, nodes: number[]): boolean {
  nodes.length = 0;
  if (a < 0 || !(field[a]! < Number.POSITIVE_INFINITY)) return false;
  let c = a;
  nodes.push(c);
  while (field[c]! > 0) {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    let bestAway = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 8; k++) {
      const n = neighbour(g, c, k);
      if (n < 0 || !(field[n]! < field[c]!)) continue;
      const d = field[n]! + NCOST[k]!;
      if (d > bestD + DESCENT_TIE) continue;
      const away = Math.hypot(nodeX(g, n) - towardX, nodeZ(g, n) - towardZ);
      if (d < bestD - DESCENT_TIE || away < bestAway) {
        best = n;
        bestD = d;
        bestAway = away;
      }
    }
    // Every reachable node but a source has a neighbour nearer to one; were a float tie ever to leave none, the walk
    // ends there and the route's last leg goes straight on from it.
    if (best < 0) break;
    nodes.push(best);
    c = best;
  }
  return true;
}

/** Steps whose distances differ by less than this (cells; float rounding over a long field) tie in descendField. */
const DESCENT_TIE = 1e-3;

/** The node a walker on node `c` (walkable) reaches stepping to neighbour `k` (NDI/NDJ), or -1 (the search's rules). */
function neighbour(g: NavGrid, c: number, k: number): number {
  const cols = g.cols;
  const cc = g.nodeCell[c]!;
  const ci = cc % cols;
  const cj = (cc - ci) / cols;
  const ni = ci + NDI[k]!;
  const nj = cj + NDJ[k]!;
  if (ni < 0 || nj < 0 || ni >= cols || nj >= g.rows) return -1;
  // No squeezing diagonally past a blocked node (or a drop): both straight neighbours it passes must be walkable.
  if (k >= 4 && (!walkableStep(g, c, nj * cols + ci) || !walkableStep(g, c, cj * cols + ni))) return -1;
  const n = stepNode(g, c, nj * cols + ni);
  return n >= 0 && g.walkable[n] === 1 ? n : -1;
}

function walkableStep(g: NavGrid, c: number, cell: number): boolean {
  const n = stepNode(g, c, cell);
  return n >= 0 && g.walkable[n] === 1;
}

/**
 * String-pulls the node route `nodes` (start first) into straight legs from `start`, written into `out` as findPath
 * describes, ending exactly on `goal` when it is walkable and in a straight line on foot from the last leg.
 */
export function pullRoute(g: NavGrid, nodes: readonly number[], start: Vec3, goal: Vec3, out: Vec3[], legProbe: number): void {
  const a = nodes[0]!;
  const b = nodes[nodes.length - 1]!;
  let n = 0;
  // From the current anchor, jump to the furthest node still in a clear straight line on foot.
  let ax = start.x;
  let ay = start.y;
  let az = start.z;
  if (!isWalkableAt(g, ax, ay, az)) {
    ax = nodeX(g, a);
    ay = g.floorY[a]!;
    az = nodeZ(g, a);
  }
  let k = 0;
  while (k < nodes.length - 1) {
    // Walk forward while the straight line from the anchor stays clear (checking every few nodes).
    let next = k + 1;
    for (let m = Math.min(nodes.length - 1, k + 2); ; m = Math.min(nodes.length - 1, m + 2)) {
      const c = nodes[m]!;
      if (walkLine(g, ax, ay, az, nodeX(g, c), nodeZ(g, c), legProbe) !== c) break;
      next = m;
      if (m === nodes.length - 1) break;
    }
    const c = nodes[next]!;
    ax = nodeX(g, c);
    ay = g.floorY[c]!;
    az = nodeZ(g, c);
    n = emitNode(g, out, n, c);
    k = next;
  }
  if (n === 0) n = emitNode(g, out, n, b);
  out.length = n;
  // End exactly on the goal when it's walkable and in a straight line on foot (the search works in cell centres).
  const end = out[n - 1]!;
  const from = n > 1 ? out[n - 2]! : start;
  const goalNode = nodeAt(g, goal.x, goal.y, goal.z);
  if (goalNode >= 0 && g.walkable[goalNode] === 1 && walkLine(g, from.x, from.y, from.z, goal.x, goal.z, legProbe) === goalNode) {
    end.x = goal.x;
    end.y = g.floorY[goalNode]!;
    end.z = goal.z;
  }
}

/**
 * Writes node `k` (on its floor) as waypoint `n` of `out`, reusing the object already there so re-planning a route
 * doesn't allocate (audit AI-11: a module function, not a closure made per search). Returns n + 1.
 */
function emitNode(g: NavGrid, out: Vec3[], n: number, k: number): number {
  const x = nodeX(g, k);
  const y = g.floorY[k]!;
  const z = nodeZ(g, k);
  const p = out[n];
  if (p) {
    p.x = x;
    p.y = y;
    p.z = z;
  } else {
    out.push({ x, y, z });
  }
  return n + 1;
}

/** Starts a new search generation in `s` towards node `goal` (-1: no goal, every reachable node, no heuristic). */
function openSearch(s: NavSearch, goal: number): void {
  s.generation++;
  s.size = 0;
  s.startNode = -1;
  s.goalNode = goal;
}

/** Adds node `a` to the open search as a start, at distance 0. */
function pushStart(s: NavSearch, a: number): void {
  if (s.startNode < 0) s.startNode = a;
  if (s.stamp[a] === s.generation) return;
  s.stamp[a] = s.generation;
  s.g[a] = 0;
  s.from[a] = a;
  if (s.size >= s.heap.length) growHeap(s, s.size);
  // A start's f is its heuristic: with one start (a route) that's the heap's only entry, with several (a distance
  // field, no goal) all are 0, so pushing to the end keeps the heap ordered either way.
  s.heap[s.size] = a;
  s.heapF[s.size] = 0;
  s.size++;
}

/**
 * 8-neighbour A* over nodes without corner cutting (octile heuristic towards s.goalNode; none and run to the end when
 * it is -1), carrying on the open search in `s` for at most `budget` expansions. Fills s.g and s.from.
 */
function expand(g: NavGrid, s: NavSearch, budget: number): SearchStep {
  const gen = s.generation;
  const cols = g.cols;
  const rows = g.rows;
  const walk = g.walkable;
  let heap = s.heap;
  let heapF = s.heapF;
  const b = s.goalNode;
  const bc = b >= 0 ? g.nodeCell[b]! : 0;
  const bi = bc % cols;
  const bj = (bc - bi) / cols;
  const h = b >= 0 ? 1 : 0;
  let size = s.size;
  let spent = 0;

  while (size > 0) {
    if (spent >= budget) {
      s.size = size;
      s.expanded = spent;
      return 'pending';
    }
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
    spent++;
    if (c === b) {
      s.size = 0;
      s.expanded = spent;
      return 'found';
    }
    const cc: number = g.nodeCell[c]!;
    const ci: number = cc % cols;
    const cj: number = (cc - ci) / cols;
    const gc = s.g[c]!;
    // The four straight neighbours' nodes, looked up once: each diagonal checks two of them.
    const o0: number = ci + 1 < cols ? stepNode(g, c, cc + 1) : -1;
    const o1: number = ci > 0 ? stepNode(g, c, cc - 1) : -1;
    const o2: number = cj + 1 < rows ? stepNode(g, c, cc + cols) : -1;
    const o3: number = cj > 0 ? stepNode(g, c, cc - cols) : -1;
    const w0 = o0 >= 0 && walk[o0] === 1;
    const w1 = o1 >= 0 && walk[o1] === 1;
    const w2 = o2 >= 0 && walk[o2] === 1;
    const w3 = o3 >= 0 && walk[o3] === 1;
    for (let k = 0; k < 8; k++) {
      const ni = ci + NDI[k]!;
      const nj: number = cj + NDJ[k]!;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      // No squeezing diagonally past a blocked node (or a drop).
      if (k >= 4 && !(k === 4 ? w0 && w2 : k === 5 ? w0 && w3 : k === 6 ? w1 && w2 : w1 && w3)) continue;
      // canStep(c, n), inlined (c is walkable).
      const n = k === 0 ? o0 : k === 1 ? o1 : k === 2 ? o2 : k === 3 ? o3 : stepNode(g, c, nj * cols + ni);
      if (n < 0 || !walk[n] || s.closed[n] === gen) continue;
      const ng = gc + NCOST[k]!;
      if (s.stamp[n] === gen && s.g[n]! <= ng) continue;
      s.stamp[n] = gen;
      s.g[n] = ng;
      s.from[n] = c;
      if (size >= heap.length) {
        growHeap(s, size);
        heap = s.heap;
        heapF = s.heapF;
      }
      const di = Math.abs(ni - bi);
      const dj = Math.abs(nj - bj);
      const f = ng + h * (di > dj ? di + (SQRT2 - 1) * dj : dj + (SQRT2 - 1) * di);
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
  s.size = 0;
  s.expanded = spent;
  return b >= 0 ? 'none' : 'found';
}

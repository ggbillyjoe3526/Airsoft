import type { BotBehaviour } from '../config/bots';
import type { Bush } from '../map/foliage';
import { canStep, type NavGrid, stepNode } from '../nav/navGrid';
import type { CoverBlock } from './cover';

/**
 * What a held angle can be besides a wall's edge (M40): the map's own data and nav, worked out once per match (as it
 * loads, when a team holds angles; BotWorld.angleFeatures), never where anyone stands. Stair and ramp tops on layered
 * floors, the narrow tall blocks a tree gap is made of, and the bushes tall enough to hide someone (findHeldAngles
 * reads all three).
 */
export interface AngleFeatures {
  nav: NavGrid;
  /** Stair and ramp tops: x, y (the top's floor), z per top. */
  tops: Float32Array;
  topCount: number;
  /** Narrow tall blocks (trunks, posts): x, z and half width per post. */
  posts: Float32Array;
  postCount: number;
  /** Bushes at least angleBushMinHeight tall. */
  bushes: readonly Bush[];
}

type FeatureConfig = Pick<
  BotBehaviour,
  'angleBushMinHeight' | 'anglePostMaxHalf' | 'anglePostSquareness' | 'angleLevelRise' | 'angleRampRun' | 'angleRampSlope' | 'angleFlatSlope' | 'angleLandingRun' | 'angleTopMerge'
>;

/** The four grid directions a ramp can run (column step, row step). */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function angleFeaturesOf(nav: NavGrid, tallCover: readonly CoverBlock[], foliage: readonly Bush[], cfg: FeatureConfig): AngleFeatures {
  const posts: number[] = [];
  for (const b of tallCover) {
    if (b.halfX > cfg.anglePostMaxHalf || b.halfZ > cfg.anglePostMaxHalf) continue;
    // Round or square, as a trunk or a pillar is: a wall's short stub by a door or a window is no post.
    if (Math.min(b.halfX, b.halfZ) < cfg.anglePostSquareness * Math.max(b.halfX, b.halfZ)) continue;
    posts.push(b.x, b.z, Math.max(b.halfX, b.halfZ));
  }
  const tops = rampTops(nav, cfg);
  return {
    nav,
    tops: Float32Array.from(tops),
    topCount: tops.length / 3,
    posts: Float32Array.from(posts),
    postCount: posts.length / 3,
    bushes: foliage.filter((b) => b.height >= cfg.angleBushMinHeight),
  };
}

/**
 * Stair and ramp tops: walkable nodes on a landing (flat floor behind, see `flat`) from which the floor falls
 * (angleRampSlope or steeper on average) by angleLevelRise or more onto another landing within angleRampRun. A hillside
 * eases into a field that still slopes instead of meeting a flat floor, so terrain has none. Neighbouring tops merge.
 */
function rampTops(g: NavGrid, cfg: FeatureConfig): number[] {
  const found: number[] = [];
  const maxRun = Math.ceil(cfg.angleRampRun / g.cell);
  const landing = Math.max(1, Math.ceil(cfg.angleLandingRun / g.cell));
  const steepStep = cfg.angleRampSlope * g.cell;
  const flatStep = cfg.angleFlatSlope * g.cell;
  const nodes = g.walkable.length;
  for (let k = 0; k < nodes; k++) {
    if (g.walkable[k] !== 1) continue;
    const c = g.nodeCell[k]!;
    const col = c % g.cols;
    const row = Math.floor(c / g.cols);
    for (const [dc, dr] of DIRS) {
      // The floor falls away from here (one lookup rules out every node of a flat floor).
      const first = neighbour(g, k, col + dc, row + dr);
      if (first < 0 || g.floorY[k]! - g.floorY[first]! <= flatStep) continue;
      // Behind it, a landing (checked first: it rules out nearly every node of a hillside).
      if (!flat(g, k, col, row, -dc, -dr, landing, flatStep)) continue;
      // Down the slope while it falls (a ramp's first cell may be only partly on it), to flat floor within angleRampRun:
      // a drop of angleLevelRise or more, at angleRampSlope or steeper on average.
      let at = k;
      let steps = 0;
      while (steps < maxRun) {
        const next = neighbour(g, at, col + dc * (steps + 1), row + dr * (steps + 1));
        if (next < 0 || g.floorY[at]! - g.floorY[next]! <= flatStep) break;
        at = next;
        steps++;
      }
      const drop = g.floorY[k]! - g.floorY[at]!;
      if (steps === 0 || drop < cfg.angleLevelRise || drop < steps * steepStep) continue;
      if (!flat(g, at, col + dc * steps, row + dr * steps, dc, dr, landing, flatStep)) continue;
      found.push(gridX(g, col), g.floorY[k]!, gridZ(g, row));
    }
  }
  return merge(found, cfg.angleTopMerge);
}

/** The node a character on `k` steps onto in cell (col, row), or -1 (off the grid, no floor within a step, or blocked). */
function neighbour(g: NavGrid, k: number, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return -1;
  const n = stepNode(g, k, row * g.cols + col);
  return n >= 0 && canStep(g, k, n) ? n : -1;
}

/**
 * True if the floor runs on from node `k` (in cell col, row) for `cells` cells along (dc, dr), never rising or falling more
 * than `flatStep` a cell, or up to a wall or the grid's edge after at least one such cell (a stairwell's landing turns a
 * corner). A drop ends it.
 */
function flat(g: NavGrid, k: number, col: number, row: number, dc: number, dr: number, cells: number, flatStep: number): boolean {
  let at = k;
  for (let i = 1; i <= cells; i++) {
    const c = col + dc * i;
    const r = row + dr * i;
    const next = neighbour(g, at, c, r);
    if (next < 0) return i > 1 && walled(g, at, c, r);
    if (Math.abs(g.floorY[next]! - g.floorY[at]!) > flatStep) return false;
    at = next;
  }
  return true;
}

/** True if a character on node `k` can't step into cell (col, row) because it is off the grid or blocked at that floor (not a drop). */
function walled(g: NavGrid, k: number, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return true;
  const n = stepNode(g, k, row * g.cols + col);
  return n >= 0 && g.walkable[n] !== 1;
}

const gridX = (g: NavGrid, col: number): number => g.minX + (col + 0.5) * g.cell;
const gridZ = (g: NavGrid, row: number): number => g.minZ + (row + 0.5) * g.cell;

/** Greedy clusters of the (x, y, z) points within `radius` of a cluster's first point (and about level with it), each as its mean. */
function merge(points: readonly number[], radius: number): number[] {
  const n = points.length / 3;
  const used = new Uint8Array(n);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let count = 0;
    for (let j = i; j < n; j++) {
      if (used[j]) continue;
      if (Math.hypot(points[3 * j]! - points[3 * i]!, points[3 * j + 2]! - points[3 * i + 2]!) > radius) continue;
      if (Math.abs(points[3 * j + 1]! - points[3 * i + 1]!) > radius / 2) continue;
      used[j] = 1;
      sx += points[3 * j]!;
      sy += points[3 * j + 1]!;
      sz += points[3 * j + 2]!;
      count++;
    }
    out.push(sx / count, sy / count, sz / count);
  }
  return out;
}

import { blockMaterial } from '../config/materials';
import { PHYSICS } from '../config/physics';
import type { ImpactMaterial } from '../config/sounds';
import type { MapBlock } from '../map/mapTypes';
import { rampCorners } from '../map/surfaces';
import type { SurfaceHit } from './armament';
import type { Vec3 } from './vec';

/**
 * Ray casts against the level without Rapier (audit SIM-01). The level is axis-aligned boxes and ramp wedges, so each
 * block is a handful of planes and a ray meets it where it enters all of their half-spaces (a slab test); nothing is
 * allocated per cast. Rapier stays for the character controller. The results match Rapier's ray against the same
 * blocks as closed triangle meshes (physics/physicsWorld.ts), which `physics/levelRay.rapier.test.ts` checks on every
 * Depot and range block: the nearest surface along the ray, its normal turned to face back along the ray, and its
 * material; a ray starting inside a block meets that block's far side.
 */
export interface LevelRay {
  /** Per block, its bounding planes as (nx, ny, nz, d): a point p is inside where n·p <= d for every plane. */
  readonly planes: Float64Array;
  /** Block b's planes are planes[planeStart[b] * 4 ... planeStart[b + 1] * 4). */
  readonly planeStart: Int32Array;
  readonly materials: readonly ImpactMaterial[];
  /** The column grid over the map's footprint (x, z): its corner, cell size and cells along x and z. */
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  readonly cell: number;
  readonly nx: number;
  readonly nz: number;
  /** Cell (ix, iz)'s blocks are cellBlocks[cellStart[iz * nx + ix] ... cellStart[iz * nx + ix + 1]). */
  readonly cellStart: Int32Array;
  readonly cellBlocks: Int32Array;
  /** The cast that last tested each block, so a block spanning several cells is tested once per cast. */
  readonly stamps: Uint32Array;
  /** The current cast's number (wraps safely: the stamps are cleared then). */
  cast: number;
  /** Scratch from the last block test: the plane the ray met (its offset in `planes`) and whether from inside. */
  plane: number;
  inside: boolean;
}

/** A block's footprint is widened by this much (m) when filed into cells, so a face on a cell edge is in both. */
const CELL_MARGIN = 1e-6;
/** A ray this close to parallel with a plane (|n·dir|) is treated as parallel. */
const PARALLEL = 1e-12;

function pushPlane(out: number[], nx: number, ny: number, nz: number, d: number): void {
  out.push(nx, ny, nz, d);
}

/** Builds the planes and the column grid for a map's blocks (once per map; allocates). */
export function buildLevelRay(blocks: readonly MapBlock[], cell: number = PHYSICS.rayGridCell): LevelRay {
  const planes: number[] = [];
  const planeStart = new Int32Array(blocks.length + 1);
  const corners: number[] = [];
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  blocks.forEach((b, i) => {
    planeStart[i] = planes.length / 4;
    const x0 = b.center.x - b.size.x / 2;
    const x1 = b.center.x + b.size.x / 2;
    const y0 = b.center.y - b.size.y / 2;
    const y1 = b.center.y + b.size.y / 2;
    const z0 = b.center.z - b.size.z / 2;
    const z1 = b.center.z + b.size.z / 2;
    pushPlane(planes, 1, 0, 0, x1);
    pushPlane(planes, -1, 0, 0, -x0);
    pushPlane(planes, 0, 1, 0, y1);
    pushPlane(planes, 0, -1, 0, -y0);
    pushPlane(planes, 0, 0, 1, z1);
    pushPlane(planes, 0, 0, -1, -z0);
    if (b.kind === 'ramp') {
      // The slope: the face through the low edge's bottom corners (0, 1) and the high edge's top ones (5, 4), wound
      // outward (map/surfaces.ts RAMP_FACES[2]). The box planes above bound the rest of the wedge.
      rampCorners(b, corners);
      const ax = corners[3]! - corners[0]!;
      const ay = corners[4]! - corners[1]!;
      const az = corners[5]! - corners[2]!;
      const bx = corners[15]! - corners[0]!;
      const by = corners[16]! - corners[1]!;
      const bz = corners[17]! - corners[2]!;
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const px = b.center.x + corners[0]!;
      const py = b.center.y + corners[1]!;
      const pz = b.center.z + corners[2]!;
      pushPlane(planes, nx, ny, nz, nx * px + ny * py + nz * pz);
    }
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x1);
    minZ = Math.min(minZ, z0);
    maxZ = Math.max(maxZ, z1);
  });
  planeStart[blocks.length] = planes.length / 4;
  if (blocks.length === 0) minX = maxX = minZ = maxZ = 0;

  const nx = Math.max(1, Math.ceil((maxX - minX) / cell));
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell));
  const cellOf = (v: number, min: number, n: number): number => Math.min(n - 1, Math.max(0, Math.floor((v - min) / cell)));
  const span = (b: MapBlock): [number, number, number, number] => [
    cellOf(b.center.x - b.size.x / 2 - CELL_MARGIN, minX, nx),
    cellOf(b.center.x + b.size.x / 2 + CELL_MARGIN, minX, nx),
    cellOf(b.center.z - b.size.z / 2 - CELL_MARGIN, minZ, nz),
    cellOf(b.center.z + b.size.z / 2 + CELL_MARGIN, minZ, nz),
  ];
  // Two passes: count each cell's blocks, then file them (a compact list per cell).
  const cellStart = new Int32Array(nx * nz + 1);
  for (const b of blocks) {
    const [ix0, ix1, iz0, iz1] = span(b);
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) cellStart[iz * nx + ix + 1]!++;
  }
  for (let c = 0; c < nx * nz; c++) cellStart[c + 1]! += cellStart[c]!;
  const cellBlocks = new Int32Array(cellStart[nx * nz]!);
  const fill = cellStart.slice(0, nx * nz);
  blocks.forEach((b, i) => {
    const [ix0, ix1, iz0, iz1] = span(b);
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) cellBlocks[fill[iz * nx + ix]!++] = i;
  });

  return {
    planes: Float64Array.from(planes),
    planeStart,
    materials: blocks.map(blockMaterial),
    minX,
    minZ,
    maxX: minX + nx * cell,
    maxZ: minZ + nz * cell,
    cell,
    nx,
    nz,
    cellStart,
    cellBlocks,
    stamps: new Uint32Array(blocks.length),
    cast: 0,
    plane: -1,
    inside: false,
  };
}

/**
 * Distance along unit `dir` from `origin` to block `b`'s surface, or -1 if the ray misses it (or meets it beyond
 * `maxDist`). Sets `level.plane` and `level.inside` for the normal.
 */
function rayBlock(level: LevelRay, b: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
  const p = level.planes;
  let tEnter = -Infinity;
  let tExit = Infinity;
  let enter = -1;
  let exit = -1;
  for (let k = level.planeStart[b]! * 4, end = level.planeStart[b + 1]! * 4; k < end; k += 4) {
    const nx = p[k]!;
    const ny = p[k + 1]!;
    const nz = p[k + 2]!;
    // How far outside the plane the origin is, and how fast the ray closes on it.
    const outside = nx * ox + ny * oy + nz * oz - p[k + 3]!;
    const along = nx * dx + ny * dy + nz * dz;
    if (along > -PARALLEL && along < PARALLEL) {
      if (outside > 0) return -1;
      continue;
    }
    const t = -outside / along;
    if (along < 0) {
      if (t > tEnter) {
        tEnter = t;
        enter = k;
      }
    } else if (t < tExit) {
      tExit = t;
      exit = k;
    }
    if (tEnter > tExit || tEnter > maxDist) return -1;
  }
  if (tEnter >= 0) {
    level.plane = enter;
    level.inside = false;
    return tEnter;
  }
  // Starting inside the block: the ray meets its far side from within (as a ray against a closed mesh does).
  if (tExit > 0 && tExit <= maxDist && exit >= 0) {
    level.plane = exit;
    level.inside = true;
    return tExit;
  }
  return -1;
}

/**
 * Distance along unit `dir` to the first level surface, or -1 if none within `maxDist`. With `out`, also the surface's
 * unit normal (facing back along the ray) and material. Walks the grid's columns along the ray from the origin and
 * stops at the first column whose far edge is past the nearest hit found so far. Allocates nothing.
 */
export function castLevelRay(level: LevelRay, origin: Readonly<Vec3>, dir: Readonly<Vec3>, maxDist: number, out?: SurfaceHit): number {
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const dx = dir.x;
  const dy = dir.y;
  const dz = dir.z;
  // Clip the ray to the grid's footprint.
  let t0 = 0;
  let t1 = maxDist;
  if (dx > -PARALLEL && dx < PARALLEL) {
    if (ox < level.minX || ox > level.maxX) return -1;
  } else {
    const a = (level.minX - ox) / dx;
    const b = (level.maxX - ox) / dx;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (dz > -PARALLEL && dz < PARALLEL) {
    if (oz < level.minZ || oz > level.maxZ) return -1;
  } else {
    const a = (level.minZ - oz) / dz;
    const b = (level.maxZ - oz) / dz;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (t0 > t1) return -1;

  if (++level.cast === 0xffffffff) {
    level.stamps.fill(0);
    level.cast = 1;
  }
  const cast = level.cast;
  const cell = level.cell;
  const nx = level.nx;
  const nz = level.nz;
  let ix = Math.min(nx - 1, Math.max(0, Math.floor((ox + dx * t0 - level.minX) / cell)));
  let iz = Math.min(nz - 1, Math.max(0, Math.floor((oz + dz * t0 - level.minZ) / cell)));
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const flatX = dx > -PARALLEL && dx < PARALLEL;
  const flatZ = dz > -PARALLEL && dz < PARALLEL;
  // Ray distance to the next column edge along x and z, and between edges.
  let nextX = flatX ? Infinity : (level.minX + (ix + (dx > 0 ? 1 : 0)) * cell - ox) / dx;
  let nextZ = flatZ ? Infinity : (level.minZ + (iz + (dz > 0 ? 1 : 0)) * cell - oz) / dz;
  const stepTX = flatX ? Infinity : cell / Math.abs(dx);
  const stepTZ = flatZ ? Infinity : cell / Math.abs(dz);

  let best = Infinity;
  let bestBlock = -1;
  let bestPlane = -1;
  let bestInside = false;
  for (;;) {
    const c = iz * nx + ix;
    for (let k = level.cellStart[c]!, end = level.cellStart[c + 1]!; k < end; k++) {
      const b = level.cellBlocks[k]!;
      if (level.stamps[b] === cast) continue;
      level.stamps[b] = cast;
      const t = rayBlock(level, b, ox, oy, oz, dx, dy, dz, Math.min(best, maxDist));
      if (t >= 0 && t < best) {
        best = t;
        bestBlock = b;
        bestPlane = level.plane;
        bestInside = level.inside;
      }
    }
    const edge = Math.min(nextX, nextZ);
    if (best <= edge || edge > t1) break;
    if (nextX < nextZ) {
      ix += stepX;
      nextX += stepTX;
      if (ix < 0 || ix >= nx) break;
    } else {
      iz += stepZ;
      nextZ += stepTZ;
      if (iz < 0 || iz >= nz) break;
    }
  }
  if (bestBlock < 0) return -1;
  if (out) {
    // The plane's outward normal, turned to face back along the ray (from inside, the far side faces away).
    const s = bestInside ? -1 : 1;
    out.normal.x = level.planes[bestPlane]! * s;
    out.normal.y = level.planes[bestPlane + 1]! * s;
    out.normal.z = level.planes[bestPlane + 2]! * s;
    out.material = level.materials[bestBlock]!;
  }
  return best;
}

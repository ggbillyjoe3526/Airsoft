import type { PracticeSpotsConfig } from '../config/practice';
import { cellX, cellZ, nearestWalkable, type NavGrid, nodeAt } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { type Vec3, vec3 } from '../sim/vec';
import type { MapData, SpawnPoint } from './mapTypes';

/**
 * Why a bot would be at a spot (M94): a lane point it stops at, its team's start, a watch spot over a city floor (a
 * window or balcony), or a point on a lane's leg it walks along.
 */
export type SpotSource = 'lane' | 'start' | 'overlook' | 'leg';

/** A place a target stands in Practice on a map (M94), on the floor, facing its way (map/practiceLayout.ts gives it a kind). */
export interface TargetSpot {
  /** On the floor (m). */
  position: Vec3;
  /** The way it faces, a unit vector on the floor (x, z): never into a wall. */
  face: { x: number; z: number };
  /** Cover lower than its shoulders right in front of it: a bot there would crouch behind it. */
  crouched: boolean;
  source: SpotSource;
  /** How far it is from your start (m), across the floor. */
  fromStart: number;
}

/** A place a target may stand, before it is put on the floor: a point and the way it faces (x, z; any length). */
interface Candidate {
  x: number;
  y: number;
  z: number;
  fx: number;
  fz: number;
  source: SpotSource;
}

const down = vec3(0, -1, 0);
const from = vec3();
const along = vec3();

/** Where you start practising on `map` (M94): end 0's first spawn, where Alpha starts round 1. */
export function practiceStart(map: MapData): SpawnPoint {
  return map.spawns[0][0]!;
}

/**
 * Where Practice puts its targets on a map (M94, playtest note 11: "instead of bots there would be targets"): where the
 * other team's bots would play, read from the map's own data, so a new map gets its targets with no extra work. In
 * order of how surely a bot stands there:
 * 1. every lane point (MapData.lanes: a bot advancing on a lane stops at each), facing back along the lane towards your
 *    end, the way a bot holding it watches;
 * 2. the other team's starts (end 1's spawns), facing your start;
 * 3. Extraction's home-team starts, where its bots start a run, facing your start;
 * 4. the watch spots over a city floor (MapData.overlooks: windows and balconies), facing the floor they watch;
 * 5. points along the lanes' long legs, where a bot walks between lane points.
 * Each is put on the walkable floor under it (or dropped), none near your start and none crowding another on its floor,
 * and marked crouched where low cover is right in front of it. Sorted near to far from your start; map/practiceLayout.ts
 * picks each one's kind. Pure (reads the map, its nav grid and its colliders).
 */
export function practiceSpots(map: MapData, nav: NavGrid, query: WorldQuery, cfg: PracticeSpotsConfig): TargetSpot[] {
  const start = practiceStart(map).position;
  const candidates: Candidate[] = [];
  const facing = (source: SpotSource, x: number, y: number, z: number, toX: number, toZ: number): Candidate => ({ x, y, z, fx: toX - x, fz: toZ - z, source });
  const facingStart = (s: SpawnPoint): Candidate => facing('start', s.position.x, s.position.y, s.position.z, start.x, start.z);
  for (const lane of map.lanes) {
    lane.forEach((p, i) => {
      const back = i > 0 ? lane[i - 1]! : start;
      candidates.push(facing('lane', p.x, p.y, p.z, back.x, back.z));
    });
  }
  for (const s of map.spawns[1]) candidates.push(facingStart(s));
  for (const s of map.extraction?.opponentStarts ?? []) candidates.push(facingStart(s));
  for (const o of map.overlooks ?? []) {
    const [x0, x1, z0, z1] = o.area;
    for (const p of o.from) candidates.push(facing('overlook', p.x, p.y, p.z, (x0 + x1) / 2, (z0 + z1) / 2));
  }
  for (const lane of map.lanes) {
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1]!;
      const b = lane[i]!;
      const steps = Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / cfg.legStep);
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        candidates.push(facing('leg', a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t, a.x, a.z));
      }
    }
  }

  const out: TargetSpot[] = [];
  for (const c of candidates) {
    if (out.length >= cfg.maxTargets) break;
    const spot = placed(c, map, nav, query, cfg, start);
    if (!spot) continue;
    const p = spot.position;
    const crowded = out.some((o) => Math.hypot(o.position.x - p.x, o.position.z - p.z) < cfg.minGap && Math.abs(o.position.y - p.y) < cfg.storeyGap);
    if (!crowded) out.push(spot);
  }
  out.sort((a, b) => a.fromStart - b.fromStart);
  return out;
}

/** A candidate on the walkable floor under it, facing its way, crouched or not; null when it can't stand there. */
function placed(c: Candidate, map: MapData, nav: NavGrid, query: WorldQuery, cfg: PracticeSpotsConfig, start: { x: number; z: number }): TargetSpot | null {
  let k = nodeAt(nav, c.x, c.y, c.z);
  let x = c.x;
  let z = c.z;
  if (k < 0 || nav.walkable[k] !== 1) {
    k = nearestWalkable(nav, c.x, c.y, c.z, cfg.snapReach);
    if (k < 0) return null;
    const cell = nav.nodeCell[k]!;
    x = cellX(nav, cell % nav.cols);
    z = cellZ(nav, Math.floor(cell / nav.cols));
  }
  // Not at your start: every start of your end keeps its clearing (the spawn yard).
  if (map.spawns[0].some((s) => Math.hypot(s.position.x - x, s.position.z - z) < cfg.clearOfStart)) return null;
  const floor = floorUnder(x, nav.floorY[k]!, z, query, cfg);
  const way = clearWay(x, floor + cfg.highRayHeight, z, c.fx, c.fz, start.x - x, start.z - z, cfg, query);
  if (!way) return null;
  const { fx, fz } = way;
  // Its way is open at head height (clearWay), so cover at waist height in front is cover it can crouch behind.
  const crouched = blocked(x, floor + cfg.lowRayHeight, z, fx, fz, cfg.coverReach, query);
  return { position: vec3(x, floor, z), face: { x: fx, z: fz }, crouched, source: c.source, fromStart: Math.hypot(x - start.x, z - start.z) };
}

/**
 * The way a target at (x, y, z) faces: `fx, fz` (its spot's way) unless a wall is right in front (a lane's last point in a
 * corner), else towards your start (`sx, sz`), else the open way nearest that, from `cfg.turns` ways round; null when it
 * is walled in every way. A plate rings only from its face side, so it never faces a wall.
 */
function clearWay(x: number, y: number, z: number, fx: number, fz: number, sx: number, sz: number, cfg: PracticeSpotsConfig, query: WorldQuery): { fx: number; fz: number } | null {
  for (const [wx, wz] of [
    [fx, fz],
    [sx, sz],
  ] as const) {
    const len = Math.hypot(wx, wz);
    if (len > 1e-6 && !blocked(x, y, z, wx / len, wz / len, cfg.coverReach, query)) return { fx: wx / len, fz: wz / len };
  }
  const toStart = Math.atan2(sx, sz);
  for (let k = 1; k < cfg.turns; k++) {
    // 1, -1, 2, -2, ... steps either side of your start's way.
    const step = Math.ceil(k / 2) * (k % 2 === 1 ? 1 : -1);
    const a = toStart + (step * 2 * Math.PI) / cfg.turns;
    const wx = Math.sin(a);
    const wz = Math.cos(a);
    if (!blocked(x, y, z, wx, wz, cfg.coverReach, query)) return { fx: wx, fz: wz };
  }
  return null;
}

/** The floor's real height at (x, z) (a ramp or the terrain between nav cells' centres), from the nav floor `navY`. */
export function floorUnder(x: number, navY: number, z: number, query: WorldQuery, cfg: PracticeSpotsConfig): number {
  from.x = x;
  from.y = navY + cfg.floorProbeUp;
  from.z = z;
  const t = query.raycastStatic(from, down, cfg.floorProbeUp + cfg.floorProbeDown);
  return t >= 0 ? from.y - t : navY;
}

/** Whether something solid is within `reach` of (x, y, z) along the floor direction (fx, fz). */
export function blocked(x: number, y: number, z: number, fx: number, fz: number, reach: number, query: WorldQuery): boolean {
  from.x = x;
  from.y = y;
  from.z = z;
  along.x = fx;
  along.y = 0;
  along.z = fz;
  return query.raycastStatic(from, along, reach) >= 0;
}

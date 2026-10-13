import { BODY } from '../config/movement';
import { PHYSICS } from '../config/physics';
import type { PracticeSpotsConfig } from '../config/practice';
import { RANGE, type RangeTargetSpec, targetSpec } from '../config/range';
import { type NavGrid, nodeAt } from '../nav/navGrid';
import type { WorldQuery } from '../sim/armament';
import { vec3 } from '../sim/vec';
import type { MapData } from './mapTypes';
import { blocked, floorUnder, practiceSpots, practiceStart, type TargetSpot } from './practiceSpots';

const up = vec3(0, 1, 0);
const from = vec3();
const along = vec3();

/**
 * Practice's targets on a map (M94), as the range's are laid out (config/range.ts rangeLayout): M93's kinds, stood where
 * the other team's bots would play (map/practiceSpots.ts), and the timed challenge's START plate in front of your start.
 * Each spot's kind follows why a bot is there (config/practice.ts steelEvery): one behind low cover peeks over it (a
 * crouched pop-up and a crouched figure in turn), one at a window or balcony pops up, one on a lane's leg walks it (a
 * mover, where its track fits), and the rest stand, every `steelEvery`-th as steel (a plate, a small plate and a swinger
 * in turn, the swinger where its frame fits) and the figures among them moving in turn (`figureMotions`). Pure (reads the
 * map, its nav grid and its colliders).
 */
export function practiceLayout(map: MapData, nav: NavGrid, query: WorldQuery, cfg: PracticeSpotsConfig): RangeTargetSpec[] {
  const L = cfg.labels;
  const out: RangeTargetSpec[] = [];
  let crouched = 0;
  let movers = 0;
  let standing = 0;
  let steel = 0;
  let figures = 0;
  for (const s of practiceSpots(map, nav, query, cfg)) {
    const p = s.position;
    const at = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(s.face.x, s.face.z), distance: Math.round(s.fromStart) };
    if (s.crouched) {
      const popup = crouched++ % 2 === 0;
      out.push(targetSpec({ ...at, kind: 'figure', motion: popup ? 'popup' : 'still', crouched: true, label: popup ? L.crouchedPopup : L.crouched }));
    } else if (s.source === 'overlook') {
      out.push(targetSpec({ ...at, kind: 'figure', motion: 'popup', label: L.popup }));
    } else if (s.source === 'leg' && moverFits(s, nav, query, cfg)) {
      out.push(mover(at, movers++, cfg));
    } else if (++standing % cfg.steelEvery === 0) {
      const y = p.y + RANGE.plateHeight;
      const turn = steel++ % 3;
      if (turn === 1) out.push(targetSpec({ ...at, y, kind: 'steel', radius: RANGE.smallPlateRadius, label: L.smallSteel }));
      else if (turn === 2 && swingerFits(s, nav, query, cfg)) out.push(targetSpec({ ...at, y, kind: 'steel', motion: 'swinger', label: L.swinger }));
      else out.push(targetSpec({ ...at, y, kind: 'steel', label: L.steel }));
    } else {
      const motion = cfg.figureMotions[figures++ % cfg.figureMotions.length]!;
      if (motion === 'mover' && moverFits(s, nav, query, cfg)) out.push(mover(at, movers++, cfg));
      else if (motion === 'still') out.push(targetSpec({ ...at, kind: 'figure', label: L.figure }));
      else out.push(targetSpec({ ...at, kind: 'figure', motion: 'popup', label: L.popup }));
    }
  }
  const start = startPlate(map, nav, query, cfg);
  if (start) out.push(start);
  return out;
}

/**
 * The timed challenge's START plate on `map` (M93's, M94): a little ahead of your start, facing you, on a floor near
 * yours and in plain sight from your eye there; null when no place in front of you fits (no challenge on that map).
 */
export function startPlate(map: MapData, nav: NavGrid, query: WorldQuery, cfg: PracticeSpotsConfig): RangeTargetSpec | null {
  const s = practiceStart(map);
  const p = s.position;
  const eye = p.y + PHYSICS.groundRestGap + BODY.standEyeHeight;
  for (const ahead of cfg.start.ahead) {
    for (const turn of cfg.start.turns) {
      // Yaw 0 faces -z (sim/vec.ts forward); the plate faces back along the way to it.
      const dx = -Math.sin(s.yaw + turn);
      const dz = -Math.cos(s.yaw + turn);
      const x = p.x + dx * ahead;
      const z = p.z + dz * ahead;
      const floor = floorAt(x, p.y, z, nav, query, cfg);
      if (Number.isNaN(floor) || Math.abs(floor - p.y) > cfg.start.climb) continue;
      const y = floor + RANGE.start.height;
      if (!clearBetween(p.x, eye, p.z, x, y, z, query)) continue;
      return targetSpec({ kind: 'steel', x, y, z, yaw: Math.atan2(-dx, -dz), label: 'START', distance: ahead, start: true });
    }
  }
  return null;
}

/** The `n`th mover on the map, at `at` (its track's middle, on its trolley), at the next of the movers' speeds and phases. */
function mover(at: { x: number; y: number; z: number; yaw: number; distance: number }, n: number, cfg: PracticeSpotsConfig): RangeTargetSpec {
  const M = cfg.mover;
  return targetSpec({ ...at, y: at.y + RANGE.mover.trolleyHeight, kind: 'figure', motion: 'mover', track: M.track, speed: M.speeds[n % M.speeds.length]!, phase: n * M.phaseStep, label: cfg.labels.mover });
}

/** Whether a mover's track fits at `s`: level floor under both ends, and nothing across its face along it. */
function moverFits(s: TargetSpot, nav: NavGrid, query: WorldQuery, cfg: PracticeSpotsConfig): boolean {
  const M = cfg.mover;
  const { x, y, z } = s.position;
  // Its own x across its face: the face (fx, fz) turned a quarter to the right.
  const rx = s.face.z;
  const rz = -s.face.x;
  for (const side of [-1, 1]) {
    const end = floorAt(x + rx * side * M.track, y, z + rz * side * M.track, nav, query, cfg);
    if (Number.isNaN(end) || Math.abs(end - y) > M.flat) return false;
    for (const h of M.rayHeights) if (blocked(x, y + h, z, rx * side, rz * side, M.track + M.margin, query)) return false;
  }
  return true;
}

/** Whether a swinger's frame fits at `s`: level floor under both legs, nothing across its swing, nothing over its pivot. */
function swingerFits(s: TargetSpot, nav: NavGrid, query: WorldQuery, cfg: PracticeSpotsConfig): boolean {
  const W = RANGE.swinger;
  const C = cfg.swinger;
  const { x, y, z } = s.position;
  const rx = s.face.z;
  const rz = -s.face.x;
  // The legs stand just outside the plate's widest swing.
  const leg = W.arm * Math.sin(W.amplitude) + RANGE.plateRadius + W.frameClearance + W.frameWidth;
  const plate = y + RANGE.plateHeight;
  const pivot = plate + W.arm;
  for (const side of [-1, 1]) {
    const under = floorAt(x + rx * side * leg, y, z + rz * side * leg, nav, query, cfg);
    if (Number.isNaN(under) || Math.abs(under - y) > C.flat) return false;
    for (const h of [plate, pivot]) if (blocked(x, h, z, rx * side, rz * side, leg + C.margin, query)) return false;
  }
  from.x = x;
  from.y = plate;
  from.z = z;
  return query.raycastStatic(from, up, pivot - plate + C.headroom) < 0;
}

/** The walkable floor's real height at (x, z) on the storey nearest `y`, or NaN where none is walkable. */
function floorAt(x: number, y: number, z: number, nav: NavGrid, query: WorldQuery, cfg: PracticeSpotsConfig): number {
  const k = nodeAt(nav, x, y, z);
  return k >= 0 && nav.walkable[k] === 1 ? floorUnder(x, nav.floorY[k]!, z, query, cfg) : Number.NaN;
}

/** Whether nothing solid stands between (ax, ay, az) and (bx, by, bz). */
function clearBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, query: WorldQuery): boolean {
  const len = Math.hypot(bx - ax, by - ay, bz - az);
  from.x = ax;
  from.y = ay;
  from.z = az;
  along.x = (bx - ax) / len;
  along.y = (by - ay) / len;
  along.z = (bz - az) / len;
  return query.raycastStatic(from, along, len) < 0;
}

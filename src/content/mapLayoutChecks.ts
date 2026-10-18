import { MAP_STANDARD } from '../config/contentRules';
import { OVERTIME } from '../config/modes';
import { MOVEMENT } from '../config/movement';
import type { MapEntry } from '../map/maps';
import { foliageDepth } from '../map/foliage';
import type { MapData } from '../map/mapTypes';
import { nearestWalkable, nodeAt, nodeX, nodeZ } from '../nav/navGrid';
import { CANOPY } from '../config/renderSurfaces';
import { blockPieces } from '../render/field/mapPieces/pieceTable';
import type { Vec3 } from '../sim/vec';
import { vec3 } from '../sim/vec';
import { type CheckResult, num, result } from './checks';
import { longestSightline, type MapGeometry, mapGeometry, routeBetween, sees, type Sightline, spawnYard, spawnYardsSeen, STANDING_EYE, standPoints, stretchSightline, walkField, walkFrom } from './mapLayout';
import { at, gameMapContext, type MapContext, mapItem, plural, where } from './mapCheckSupport';

/** Level 2 of a map's checks (CT2): its layout, measured against Depot's (MAP_STANDARD), and the figures the report shows. */

/** A map's layout figures (CT2): what the report shows beside Depot's, and what the layout checks judge. */
export interface MapFigures {
  /** The walkable ground's extent (m, x then z) and area (m²). */
  size: { x: number; z: number; area: number };
  lanes: number;
  sightline: Sightline | null;
  /** The spacing (m) the sightline was sampled at. */
  sightSpacing: number;
  /** The first line from one spawn yard into the other's, or null (the yards can't see each other). */
  spawnsSeen: ReturnType<typeof spawnYardsSeen>;
  /** The middle of the walkable ground, and each end's mean walk to it from its spawns (m). */
  middle: Vec3;
  middleWalk: [number, number];
  /** Attack / Defend: each end's mean walk to the flag (m; end 0 attacks), or null without a flag. */
  flagWalk: [number, number] | null;
  /** Whether the flag can be seen from the attackers' spawn yard (standing), or null without a flag. */
  flagSeen: boolean | null;
}

const measured = new WeakMap<MapData, Partial<MapFigures>>();

/** One of a map's layout figures, measured the first time it is asked for. */
function figure<K extends keyof MapFigures>(map: MapData, key: K, measure: (geo: MapGeometry) => MapFigures[K]): MapFigures[K] {
  let own = measured.get(map);
  if (!own) measured.set(map, (own = {}));
  if (!(key in own)) own[key] = measure(mapGeometry(map));
  return own[key] as MapFigures[K];
}

/** The walkable ground's bounds. */
function groundBounds(geo: MapGeometry): { x0: number; x1: number; z0: number; z1: number; area: number } {
  const g = geo.nav;
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  let n = 0;
  for (let k = 0; k < g.floorY.length; k++) {
    if (g.walkable[k] !== 1) continue;
    n++;
    const x = nodeX(g, k);
    const z = nodeZ(g, k);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return { x0, x1, z0, z1, area: n * g.cell * g.cell };
}

/** The mean walk (m) from each end's spawns to `p`. */
function endWalks(geo: MapGeometry, p: Vec3): [number, number] {
  const field = walkField(geo, [p]);
  return [0, 1].map((end) => {
    const spawns = geo.map.spawns[end]!;
    return spawns.reduce((s, sp) => s + walkFrom(geo, field, sp.position), 0) / Math.max(1, spawns.length);
  }) as [number, number];
}

/** The middle of the walkable ground, on the lowest floor there (the street, not a balcony over it), or the nearest walkable ground to it. */
function middleOf(geo: MapGeometry): Vec3 {
  const b = groundBounds(geo);
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const lowest = nodeAt(geo.nav, cx, Number.NEGATIVE_INFINITY, cz);
  const ground = lowest >= 0 && geo.nav.walkable[lowest] === 1 ? lowest : nearestWalkable(geo.nav, cx, lowest >= 0 ? geo.nav.floorY[lowest]! : 0, cz, 10);
  return ground >= 0 ? vec3(nodeX(geo.nav, ground), geo.nav.floorY[ground]!, nodeZ(geo.nav, ground)) : vec3(cx, 0, cz);
}

const sizeOf = (map: MapData): MapFigures['size'] =>
  figure(map, 'size', (geo) => {
    const b = groundBounds(geo);
    return { x: b.x1 - b.x0, z: b.z1 - b.z0, area: b.area };
  });
/** Sampled finely on a small field and coarser on a big one, so every map costs about the same. */
const spacingOf = (map: MapData): number => figure(map, 'sightSpacing', () => Math.max(MAP_STANDARD.sightSpacing, Math.sqrt(sizeOf(map).area / MAP_STANDARD.sightPoints)));
const sightlineOf = (map: MapData): Sightline | null =>
  figure(map, 'sightline', (geo) => {
    const coarse = longestSightline(geo, standPoints(geo, spacingOf(map)));
    return coarse && stretchSightline(geo, coarse, 2 * spacingOf(map));
  });
const spawnsSeenOf = (map: MapData): MapFigures['spawnsSeen'] => figure(map, 'spawnsSeen', (geo) => spawnYardsSeen(geo, MAP_STANDARD.spawnYardRadius, MAP_STANDARD.sightSpacing));
const middlePointOf = (map: MapData): Vec3 => figure(map, 'middle', middleOf);
const middleWalkOf = (map: MapData): [number, number] => figure(map, 'middleWalk', (geo) => endWalks(geo, middlePointOf(map)));
const flagWalkOf = (map: MapData): [number, number] | null => figure(map, 'flagWalk', (geo) => (map.flag ? endWalks(geo, map.flag) : null));
const flagSeenOf = (map: MapData): boolean | null =>
  figure(map, 'flagSeen', (geo) => {
    const flag = map.flag;
    if (!flag) return null;
    return spawnYard(geo, map.spawns[0], MAP_STANDARD.spawnYardRadius, MAP_STANDARD.sightSpacing).some((p) => sees(geo, p, flag, STANDING_EYE, STANDING_EYE));
  });

/** A map's layout figures (each measured once per map data). */
export function mapFigures(map: MapData): MapFigures {
  return {
    size: sizeOf(map),
    lanes: map.lanes.length,
    sightline: sightlineOf(map),
    sightSpacing: spacingOf(map),
    spawnsSeen: spawnsSeenOf(map),
    middle: middlePointOf(map),
    middleWalk: middleWalkOf(map),
    flagWalk: flagWalkOf(map),
    flagSeen: flagSeenOf(map),
  };
}

/** Seconds at a run (MOVEMENT.runSpeed) for `metres`. */
export const runSeconds = (metres: number): number => metres / MOVEMENT.runSpeed;
const walkWords = (m: number): string => (Number.isFinite(m) ? `${num(m, 1)} m (${num(runSeconds(m), 1)} s at a run)` : 'no way there');

export function laneChecks(entry: MapEntry, map: MapData): CheckResult[] {
  const geo = mapGeometry(map);
  const item = mapItem(entry);
  const n = map.lanes.length;
  const out: CheckResult[] = [];
  if (n < MAP_STANDARD.minLanes) out.push(result('compatibility', 'map.lanes', item, 'fail', `${plural(n, 'lane')}: a field needs at least ${MAP_STANDARD.minLanes}, so there is a way round.`));
  else if (n < MAP_STANDARD.lanes) out.push(result('compatibility', 'map.lanes', item, 'warn', `${plural(n, 'lane')}, one fewer than Depot's ${MAP_STANDARD.lanes}: fine for a small field, if its brief says so.`));
  else out.push(result('compatibility', 'map.lanes', item, 'pass', `${plural(n, 'lane')} (Depot has ${MAP_STANDARD.lanes}).`));
  // Each lane walks from its first point to its last, from end 0's half towards end 1's.
  const centre = (end: number): Vec3 => {
    const s = map.spawns[end]!;
    return vec3(s.reduce((a, p) => a + p.position.x, 0) / s.length, 0, s.reduce((a, p) => a + p.position.z, 0) / s.length);
  };
  const [c0, c1] = [centre(0), centre(1)];
  const from0 = (p: Vec3): number => Math.hypot(p.x - c0.x, p.z - c0.z);
  const nearer = (p: Vec3): number => (from0(p) <= Math.hypot(p.x - c1.x, p.z - c1.z) ? 0 : 1);
  const broken: string[] = [];
  map.lanes.forEach((lane, l) => {
    for (let i = 1; i < lane.length; i++) if (!routeBetween(geo, lane[i - 1]!, lane[i]!)) broken.push(`lane ${l + 1} can't be walked from point ${i} to ${i + 1} (${at(lane[i - 1]!)} to ${at(lane[i]!)})`);
    if (lane.length < 2) broken.push(`lane ${l + 1} has fewer than two points`);
    else if (nearer(lane[0]!) !== 0 || !(from0(lane[lane.length - 1]!) > from0(lane[0]!))) broken.push(`lane ${l + 1} does not run from end 0 towards end 1`);
  });
  if (broken.length > 0) out.push(result('compatibility', 'map.laneWalk', item, 'fail', `${broken.slice(0, 3).join('; ')}.`));
  else out.push(result('compatibility', 'map.laneWalk', item, 'pass', `Every lane walks end to end, from end 0 towards end 1.`));
  return out;
}

/** Every spawn reaches every spawn at the other end, the middle and the flag. */
export function routeCheck(entry: MapEntry, map: MapData): CheckResult {
  const geo = mapGeometry(map);
  const cut: string[] = [];
  const targets: { what: string; p: Vec3 }[] = [{ what: 'the middle', p: middlePointOf(map) }, ...(map.flag ? [{ what: 'the flag', p: map.flag }] : [])];
  for (const end of [0, 1]) {
    for (const [i, s] of map.spawns[end]!.entries()) {
      for (const t of targets) if (!routeBetween(geo, s.position, t.p)) cut.push(`end ${end} spawn ${i + 1} can't reach ${t.what}`);
      if (end === 0) for (const [j, o] of map.spawns[1].entries()) if (!routeBetween(geo, s.position, o.position)) cut.push(`end 0 spawn ${i + 1} can't reach end 1 spawn ${j + 1}`);
    }
  }
  if (cut.length > 0) return result('compatibility', 'map.routes', mapItem(entry), 'fail', `${cut.slice(0, 3).join('; ')}${cut.length > 3 ? `; and ${cut.length - 3} more` : ''}.`);
  return result('compatibility', 'map.routes', mapItem(entry), 'pass', `Every spawn reaches the other end${map.flag ? ', the flag' : ''} and the middle on foot.`);
}

export function spawnSightCheck(entry: MapEntry, map: MapData): CheckResult {
  const r = MAP_STANDARD.spawnYardRadius;
  const s = spawnsSeenOf(map);
  if (s) return result('compatibility', 'map.spawnSight', mapItem(entry), 'fail', `The spawns see each other: someone ${s.eye} at ${at(s.from)} sees ${at(s.to)} (each within ${r} m of a spawn).`);
  return result('compatibility', 'map.spawnSight', mapItem(entry), 'pass', `Nobody within ${r} m of one end's spawns sees anyone within ${r} m of the other's, standing or crouched.`);
}

export function sightlineCheck(entry: MapEntry, map: MapData, ctx: MapContext = gameMapContext()): CheckResult {
  const item = mapItem(entry);
  const s = sightlineOf(map);
  if (!s) return result('compatibility', 'map.sightline', item, 'fail', 'No two places to stand see each other: the map has no walkable ground.');
  const allowed = ctx.exceptions[entry.id]?.longestSightline;
  const limit = allowed?.metres ?? MAP_STANDARD.longestSightline;
  const says = `The longest clear line is ${num(s.metres, 1)} m, from ${at(s.from)} to ${at(s.to)}`;
  const against = allowed ? `allowed up to ${limit} m: ${allowed.reason}` : `Depot's standard is ${limit} m`;
  if (s.metres > limit) return result('compatibility', 'map.sightline', item, 'fail', `${says}; ${against}. Break it with cover, or write down why it stays.`);
  return result('compatibility', 'map.sightline', item, 'pass', `${says} (${against}).`);
}

export function middleCheck(entry: MapEntry, map: MapData): CheckResult {
  const [a, b] = middleWalkOf(map);
  const item = mapItem(entry);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return result('compatibility', 'map.middle', item, 'fail', `An end can't walk to the middle of the field (${at(middlePointOf(map))}).`);
  const spread = Math.max(a, b) / Math.min(a, b) - 1;
  const says = `From its spawns, end 0 walks ${walkWords(a)} to the middle and end 1 ${walkWords(b)}: ${num(spread * 100, 0)} % apart`;
  if (spread > MAP_STANDARD.walkSpreadWarn) return result('compatibility', 'map.middle', item, 'fail', `${says}, more than ${MAP_STANDARD.walkSpreadWarn * 100} %. One end gets there first.`);
  if (spread > MAP_STANDARD.walkSpread) return result('compatibility', 'map.middle', item, 'warn', `${says}, past the standard ${MAP_STANDARD.walkSpread * 100} %. Worth a look in play.`);
  return result('compatibility', 'map.middle', item, 'pass', `${says} (within the standard ${MAP_STANDARD.walkSpread * 100} %).`);
}

export function flagCheck(entry: MapEntry, map: MapData): CheckResult | null {
  const walks = flagWalkOf(map);
  if (!walks) return null;
  const [attack, defend] = walks;
  const item = mapItem(entry);
  if (!Number.isFinite(attack) || !Number.isFinite(defend)) return result('compatibility', 'map.flag', item, 'fail', 'An end can\'t walk to the flag.');
  const ratio = attack / defend;
  const says = `The attackers (end 0) walk ${walkWords(attack)} to the flag, the defenders ${walkWords(defend)}: ${num(ratio, 2)} times as far`;
  if (ratio < MAP_STANDARD.flagHeadStart) return result('compatibility', 'map.flag', item, 'fail', `${says}. The defenders need a head start: at least ${MAP_STANDARD.flagHeadStart} times.`);
  if (flagSeenOf(map)) return result('compatibility', 'map.flag', item, 'fail', `${says}, but the flag can be seen from the attackers' spawn.`);
  return result('compatibility', 'map.flag', item, 'pass', `${says} (at least ${MAP_STANDARD.flagHeadStart}), and it is out of sight of the attackers' spawn.`);
}

/** The overtime flag's bush test starts this far over its foot (metres): ground cover at the foot hides nothing. */
const FLAG_FOOT_CLEAR = 0.1;

/**
 * Elimination's overtime flag (Dev 6 item 45): where a flag goes up when a round runs out level, and the first team to
 * touch it wins. Fair as the middle is (each end's walk from its spawns within MAP_STANDARD.walkSpread; past it a look,
 * past walkSpreadWarn a failure), close enough that both ends get there within the overtime at a run (else a look), and
 * out of the bushes, where nobody would see it. Without one a level time-out is a draw at once: a look, not a failure.
 */
export function overtimeFlagCheck(entry: MapEntry, map: MapData): CheckResult {
  const item = mapItem(entry);
  const spot = map.overtimeFlag;
  if (!spot) return result('compatibility', 'map.overtimeFlag', item, 'warn', 'It has no overtime flag: an Elimination round that runs out of time level is a draw at once.');
  // Any leaves on the pole from just off the ground to a standing player's eyes hide it.
  if (map.foliage && foliageDepth(map.foliage, vec3(spot.x, spot.y + FLAG_FOOT_CLEAR, spot.z), vec3(spot.x, spot.y + STANDING_EYE, spot.z)) > 0) {
    return result('compatibility', 'map.overtimeFlag', item, 'fail', `The overtime flag at ${at(spot)} stands in a bush, where nobody sees it.`);
  }
  const [a, b] = endWalks(mapGeometry(map), spot);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return result('compatibility', 'map.overtimeFlag', item, 'fail', `An end can't walk to the overtime flag at ${at(spot)}.`);
  const spread = Math.abs(a - b) / Math.min(a, b);
  const says = `From its spawns, end 0 walks ${walkWords(a)} to the overtime flag and end 1 ${walkWords(b)}: ${num(spread * 100, 0)} % apart`;
  if (spread > MAP_STANDARD.walkSpreadWarn) return result('compatibility', 'map.overtimeFlag', item, 'fail', `${says}, more than ${MAP_STANDARD.walkSpreadWarn * 100} %. One end gets there first.`);
  if (spread > MAP_STANDARD.walkSpread) return result('compatibility', 'map.overtimeFlag', item, 'warn', `${says}, past the standard ${MAP_STANDARD.walkSpread * 100} %. Worth a look in play.`);
  if (runSeconds(Math.max(a, b)) > OVERTIME.time) return result('compatibility', 'map.overtimeFlag', item, 'warn', `${says}, longer than the overtime's ${OVERTIME.time} s at a run.`);
  return result('compatibility', 'map.overtimeFlag', item, 'pass', `${says} (within the standard ${MAP_STANDARD.walkSpread * 100} %), inside the overtime's ${OVERTIME.time} s.`);
}

/**
 * What you see is what stops a BB: every block is drawn inside its own box (render/field/mapPieces/pieceTable.ts blockPieces, plain and
 * with map detail), so nothing drawn hangs out where a BB passes but a player cannot see through. Look-only blocks
 * lie flat (map.lookOnly); bushes stop a BB as deep in as you can't see through them, and one through an edge flies on
 * thrown off (Dev 6 item 44, BallisticsConfig.leaves); tree crowns hang CANOPY.minBase over the ground, above a standing player. Ramps are wedges inside their box and are not drawn in pieces.
 * `pieces` is the drawing (the game's; a test's for a fault).
 */
export function seeThroughCheck(entry: MapEntry, map: MapData, pieces: typeof blockPieces = blockPieces): CheckResult {
  const item = mapItem(entry);
  const out: string[] = [];
  for (const b of map.blocks) {
    if (b.kind === 'ramp') continue;
    let worst = 0;
    for (const p of [...pieces(b, map.blocks), ...pieces(b, map.blocks, true)]) {
      for (const [axis, key] of [[0, 'x'], [1, 'y'], [2, 'z']] as const) {
        worst = Math.max(worst, b.center[key] - b.size[key] / 2 - p.box.min[axis]!, p.box.max[axis]! - (b.center[key] + b.size[key] / 2));
      }
    }
    if (worst > 1e-6) out.push(`the ${where(b)} is drawn ${num(worst)} m outside its box`);
  }
  if (out.length > 0) return result('compatibility', 'map.seeThrough', item, 'fail', `${plural(out.length, 'block')} drawn where a BB passes through: ${out.slice(0, 3).join('; ')}. Draw it inside its box, or make the box fit what is drawn.`);
  const crowns = map.blocks.some((b) => b.kind === 'tree') ? `; tree crowns hang ${num(CANOPY.minBase)} m over the ground, above everyone` : '';
  const bushes = map.foliage?.length ? `; its ${plural(map.foliage.length, 'bush', 'bushes')} stop a BB as deep in as you can't see through them, as in airsoft` : '';
  return result('compatibility', 'map.seeThrough', item, 'pass', `Every block is drawn inside its own box, so a BB stops on what you see${crowns}${bushes}.`);
}

/** Level 2 for one map: its layout, measured against Depot's. */
export function mapLayoutChecks(entry: MapEntry, map: MapData, ctx: MapContext = gameMapContext()): CheckResult[] {
  const flag = flagCheck(entry, map);
  return [...laneChecks(entry, map), routeCheck(entry, map), spawnSightCheck(entry, map), sightlineCheck(entry, map, ctx), middleCheck(entry, map), ...(flag ? [flag] : []), overtimeFlagCheck(entry, map), seeThroughCheck(entry, map)];
}

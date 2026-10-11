import * as THREE from 'three';
import { MAP_EXCEPTIONS, MAP_STANDARD, type MapException, PUBLIC_MAPS, TEAM_COLOUR_RULE } from '../config/contentRules';
import { MATCH_MODES } from '../config/modes';
import { MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { TEAM_COLOUR_SETS } from '../config/teams';
import { lightingChoices, playsAtNight } from '../map/lightingChoice';
import type { MapEntry } from '../map/maps';
import type { MapBlock, MapData } from '../map/mapTypes';
import { modeOffered, playableMode } from '../map/playableMode';
import { steepestSlope, terrainRange } from '../map/terrain';
import { floorAt, isWalkableAt, nearestWalkable, nodeAt, nodeX, nodeZ } from '../nav/navGrid';
import { CANOPY } from '../config/renderSurfaces';
import { blockPieces, blockTint } from '../render/mapMeshes';
import type { Vec3 } from '../sim/vec';
import { vec3 } from '../sim/vec';
import { type CheckResult, num, result } from './checks';
import { longestSightline, type MapGeometry, mapGeometry, routeBetween, sees, type Sightline, spawnYard, spawnYardsSeen, STANDING_EYE, standPoints, walkField, walkFrom } from './mapLayout';

/**
 * A map's rules and layout checks (CT2; the rulebook is docs/content/maps.md): levels 1 and 2 of the content toolkit
 * for every map in map/maps.ts MAPS. Pure over the map's entry, its data and the context (the game's own rules, or one
 * with a fault in it in the checks' tests). Level 2 is the map's layout, measured against Depot's (MAP_STANDARD).
 */

/** What the map checks read besides the map: the registers, the team colours and how a block is coloured. */
export interface MapContext {
  publicMaps: Readonly<Record<string, string>>;
  exceptions: Readonly<Record<string, MapException>>;
  /** Every team colour of every set (Settings › Accessibility). */
  teamColours: readonly number[];
  /** A block's drawn colour (render/mapMeshes.ts blockTint: its paint, or its kind's palette). */
  tint(block: MapBlock): number;
  /** The ids of the other maps in the list, so an id is never used twice. */
  ids: readonly string[];
}

/** The game's own context. */
export function gameMapContext(ids: readonly string[] = []): MapContext {
  return {
    publicMaps: PUBLIC_MAPS,
    exceptions: MAP_EXCEPTIONS,
    teamColours: Object.values(TEAM_COLOUR_SETS).flatMap((s) => s.figures),
    tint: blockTint,
    ids,
  };
}

const at = (p: Readonly<Vec3>): string => `${num(p.x, 1)}, ${num(p.y, 1)}, ${num(p.z, 1)}`;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A map's name in a result: its label and id. */
export const mapItem = (entry: Pick<MapEntry, 'id' | 'label'>): string => `${entry.label} (${entry.id})`;

// ---- Level 1: the rules -------------------------------------------------------------------------------------------

/** Registered with a label, a blurb, team sizes it has room for, a unique id; public only through the public gate. */
function registered(entry: MapEntry, ctx: MapContext): CheckResult[] {
  const item = mapItem(entry);
  const out: CheckResult[] = [];
  const missing = [!entry.label.trim() && 'a label', !entry.blurb.trim() && 'a blurb'].filter(Boolean);
  const { standard, max } = entry.teamSize;
  if (missing.length > 0) out.push(result('rules', 'map.registered', item, 'fail', `Its entry in map/maps.ts has no ${missing.join(' or ')}.`));
  else if (!(Number.isInteger(standard) && Number.isInteger(max) && standard >= 1 && standard <= max)) out.push(result('rules', 'map.registered', item, 'fail', `Its team sizes are wrong: ${standard} a side standard, ${max} at most.`));
  else if (ctx.ids.filter((id) => id === entry.id).length > 1) out.push(result('rules', 'map.registered', item, 'fail', `Its id "${entry.id}" is used by another map too. Ids are save keys and never change.`));
  else out.push(result('rules', 'map.registered', item, 'pass', `Registered as "${entry.id}": ${standard} a side standard, up to ${max}.`));
  if (entry.tag === 'dev') out.push(result('rules', 'map.access', item, 'pass', 'Tagged dev: only you see it, with Dev content on.'));
  else if (ctx.publicMaps[entry.id]) out.push(result('rules', 'map.access', item, 'pass', `Public (${ctx.publicMaps[entry.id]}).`));
  else out.push(result('rules', 'map.access', item, 'fail', 'Tagged public without going through the public gate. Tag it dev until it passes.'));
  return out;
}

/** A spawn and a dead-zone spot per player at each end, for the largest team it offers. */
function room(entry: MapEntry, map: MapData): CheckResult {
  const max = entry.teamSize.max;
  const short = [0, 1].flatMap((end) => [
    ...(map.spawns[end]!.length < max ? [`end ${end} has ${plural(map.spawns[end]!.length, 'spawn')}`] : []),
    ...(map.deadZones[end]!.length < max ? [`end ${end} has ${plural(map.deadZones[end]!.length, 'dead-zone spot')}`] : []),
  ]);
  if (short.length > 0) return result('rules', 'map.room', mapItem(entry), 'fail', `Not enough room for ${max} a side: ${short.join(', ')}.`);
  return result('rules', 'map.room', mapItem(entry), 'pass', `${plural(max, 'spawn')} and dead-zone spots at each end, for up to ${max} a side.`);
}

/** Every point play stands someone on: spawns, dead-zone spots, lane points and the flag. */
export function mapPoints(map: MapData): { what: string; p: Vec3 }[] {
  return [
    ...map.spawns.flatMap((end, e) => end.map((s, i) => ({ what: `end ${e} spawn ${i + 1}`, p: s.position }))),
    ...map.deadZones.flatMap((end, e) => end.map((s, i) => ({ what: `end ${e} dead-zone spot ${i + 1}`, p: s.position }))),
    ...map.lanes.flatMap((lane, l) => lane.map((p, i) => ({ what: `lane ${l + 1} point ${i + 1}`, p }))),
    ...(map.flag ? [{ what: 'the flag', p: map.flag }] : []),
  ];
}

/** The places points of `map` stand off the floor or on unwalkable ground, in words. */
export function offTheFloor(geo: MapGeometry): string[] {
  // On a slope a point sits anywhere in its nav cell, whose floor is taken at the cell's middle.
  const slack = MAP_STANDARD.onFloor + (geo.map.terrain ? PHYSICS.maxRampSlope * NAV.cell : 0);
  const out: string[] = [];
  for (const { what, p } of mapPoints(geo.map)) {
    const floor = floorAt(geo.nav, p.x, p.y, p.z);
    if (!Number.isFinite(floor)) out.push(`${what} at ${at(p)} is off the map`);
    else if (Math.abs(p.y - floor) > slack) out.push(`${what} at ${at(p)} is ${num(p.y - floor)} m off the floor`);
    else if (!isWalkableAt(geo.nav, p.x, p.y, p.z)) out.push(`${what} at ${at(p)} is where nobody can stand`);
  }
  return out;
}

function onFloor(entry: MapEntry, geo: MapGeometry): CheckResult {
  const off = offTheFloor(geo);
  if (off.length > 0) return result('rules', 'map.onFloor', mapItem(entry), 'fail', `${off.slice(0, 4).join('; ')}${off.length > 4 ? `; and ${off.length - 4} more` : ''}.`);
  return result('rules', 'map.onFloor', mapItem(entry), 'pass', `All ${mapPoints(geo.map).length} spawns, dead-zone spots, lane points and flag stand on walkable floor.`);
}

/** The ramps steeper than the physics walks, in words, and the terrain's steepest slope if it is too steep. */
export function tooSteep(map: MapData): string[] {
  const out: string[] = [];
  for (const b of map.blocks) {
    if (b.kind !== 'ramp') continue;
    const run = b.rise === '+x' || b.rise === '-x' ? b.size.x : b.size.z;
    if (b.size.y / run > PHYSICS.maxRampSlope + 1e-9) out.push(`the ramp at ${at(b.center)} rises 1:${num(run / b.size.y)}`);
  }
  if (map.terrain && steepestSlope(map.terrain) > PHYSICS.maxRampSlope + 1e-9) out.push(`the ground rises 1:${num(1 / steepestSlope(map.terrain))} somewhere`);
  return out;
}

function ramps(entry: MapEntry, map: MapData): CheckResult {
  const steep = tooSteep(map);
  const limit = `1:${num(1 / PHYSICS.maxRampSlope)}`;
  if (steep.length > 0) return result('rules', 'map.ramps', mapItem(entry), 'fail', `Too steep to walk (${limit} at most): ${steep.join('; ')}.`);
  return result('rules', 'map.ramps', mapItem(entry), 'pass', `Every ramp${map.terrain ? ' and all its ground' : ''} is ${limit} or gentler.`);
}

/** The floor of last resort (killY) is under every block and the ground, so nothing playable is below it. */
function killFloor(entry: MapEntry, map: MapData): CheckResult {
  const lowest = Math.min(...map.blocks.map((b) => b.center.y - b.size.y / 2), map.terrain ? terrainRange(map.terrain).min : Number.POSITIVE_INFINITY);
  if (!(map.killY < lowest)) return result('rules', 'map.killY', mapItem(entry), 'fail', `Its floor of last resort (${num(map.killY)} m) is not under everything: the lowest block or ground is at ${num(lowest)} m.`);
  return result('rules', 'map.killY', mapItem(entry), 'pass', `Its floor of last resort (${num(map.killY)} m) is under everything (lowest ${num(lowest)} m).`);
}

const AXES = ['x', 'y', 'z'] as const;
const lo = (b: MapBlock, a: (typeof AXES)[number]): number => b.center[a] - b.size[a] / 2;
const hi = (b: MapBlock, a: (typeof AXES)[number]): number => b.center[a] + b.size[a] / 2;
const overlap = (a: MapBlock, b: MapBlock, axis: (typeof AXES)[number]): number => Math.min(hi(a, axis), hi(b, axis)) - Math.max(lo(a, axis), lo(b, axis));
const where = (b: MapBlock): string => `${b.kind} at ${b.center.x.toFixed(2)}, ${b.center.y.toFixed(2)}, ${b.center.z.toFixed(2)}`;

/**
 * The pairs of blocks that fill the same space (overlapping by more than the seam slack every way), in words: two
 * colliders where one would do, a BB's material a toss-up where their faces meet, and faces drawn in one place (they
 * flicker).
 */
export function blockClashes(blocks: readonly MapBlock[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!;
      const b = blocks[j]!;
      if (AXES.every((axis) => overlap(a, b, axis) > MAP_STANDARD.seamSlack)) out.push(`${where(a)} and ${where(b)} fill the same space`);
    }
  }
  return out;
}

function clashes(entry: MapEntry, map: MapData, ctx: MapContext): CheckResult[] {
  const item = mapItem(entry);
  const found = blockClashes(map.blocks);
  const allowed = ctx.exceptions[entry.id]?.clashes;
  const known = new Set(allowed?.list ?? []);
  const unexpected = found.filter((c) => !known.has(c));
  const gone = [...known].filter((c) => !found.includes(c));
  const out: CheckResult[] = [];
  if (unexpected.length > 0) out.push(result('rules', 'map.blocks', item, 'fail', `Blocks stand inside each other: ${unexpected.slice(0, 3).join('; ')}${unexpected.length > 3 ? `; and ${unexpected.length - 3} more` : ''}.`));
  else out.push(result('rules', 'map.blocks', item, 'pass', `No block stands inside another${known.size > 0 ? `, except ${plural(known.size, 'pair')} written down (${allowed!.reason})` : ''}.`));
  if (gone.length > 0) out.push(result('rules', 'map.blocks', item, 'warn', `The exceptions list ${plural(gone.length, 'clash', 'clashes')} no longer there (${gone.join('; ')}): take ${gone.length === 1 ? 'it' : 'them'} off MAP_EXCEPTIONS.`));
  return out;
}

function hsl(hex: number): { h: number; s: number } {
  const out = { h: 0, s: 0, l: 0 };
  new THREE.Color(hex).getHSL(out);
  return { h: out.h * 360, s: out.s };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Whether `colour` reads as one of `teams` (saturated and close in hue). */
export function readsAsTeam(colour: number, teams: readonly number[]): boolean {
  const c = hsl(colour);
  return c.s >= TEAM_COLOUR_RULE.minSaturation && teams.some((t) => hueDistance(c.h, hsl(t).h) <= TEAM_COLOUR_RULE.hueMarginDeg);
}

/**
 * No paint in a team colour: blocks, look-only blocks and painted markings. Glowing signs, lit windows and light pools
 * are light, not paint, and every map's neon may glow any colour.
 */
function teamColour(entry: MapEntry, map: MapData, ctx: MapContext): CheckResult {
  const bad = [
    ...map.blocks.filter((b) => readsAsTeam(ctx.tint(b), ctx.teamColours)).map((b) => `the ${where(b)}`),
    ...(map.decor ?? []).filter((b) => readsAsTeam(ctx.tint(b), ctx.teamColours)).map((b) => `the look-only ${where(b)}`),
    ...(map.signs ?? []).filter((s) => s.kind === 'paint' && readsAsTeam(s.colour, ctx.teamColours)).map((s) => `the marking at ${at(s.centre)}`),
  ];
  if (bad.length > 0) return result('rules', 'map.teamColour', mapItem(entry), 'fail', `Painted in a team colour, so who is who gets confused: ${bad.slice(0, 3).join('; ')}${bad.length > 3 ? `; and ${bad.length - 3} more` : ''}.`);
  return result('rules', 'map.teamColour', mapItem(entry), 'pass', 'Nothing is painted in a team colour.');
}

/** A look-only block (drawn, never solid) lies flat on its floor: one standing up would hide a gap a BB passes. */
function lookOnly(entry: MapEntry, geo: MapGeometry): CheckResult {
  const proud: string[] = [];
  for (const b of geo.map.decor ?? []) {
    const top = b.center.y + b.size.y / 2;
    let highest = Number.NEGATIVE_INFINITY;
    for (const [dx, dz] of [[0, 0], [-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) {
      const f = floorAt(geo.nav, b.center.x + dx * b.size.x, top, b.center.z + dz * b.size.z);
      if (Number.isFinite(f)) highest = Math.max(highest, f);
    }
    // Over no floor at all (a sign board on a wall's face is a sign, not decor): it stands in the open.
    if (!(top - highest <= MAP_STANDARD.decorProud)) proud.push(`the ${where(b)} stands ${Number.isFinite(highest) ? `${num(top - highest)} m` : 'clear'} over its floor`);
  }
  if (proud.length > 0) return result('rules', 'map.lookOnly', mapItem(entry), 'fail', `Look-only blocks stand up where a BB passes through them: ${proud.slice(0, 3).join('; ')}. Make them real blocks, or lay them flat.`);
  const n = geo.map.decor?.length ?? 0;
  return result('rules', 'map.lookOnly', mapItem(entry), 'pass', n > 0 ? `Its look-only blocks (${n}) lie flat on their floors.` : 'It has no look-only blocks.');
}

/** Night and lights agree: the night flag is its default lighting's, and light pools are only on a map played at night. */
function nightAndLights(entry: MapEntry, map: MapData): CheckResult {
  const item = mapItem(entry);
  const choices = lightingChoices(map);
  const nightByDefault = playsAtNight(map);
  const anyNight = choices.some((c) => playsAtNight(map, c));
  if ((map.night ?? false) !== nightByDefault) return result('rules', 'map.night', item, 'fail', `It says night is ${map.night ? 'on' : 'off'}, but its first lighting (${choices[0]}) is ${nightByDefault ? 'night' : 'day'}.`);
  if ((map.lights?.length ?? 0) > 0 && !anyNight) return result('rules', 'map.night', item, 'fail', `It has ${plural(map.lights!.length, 'light pool')} but is never played at night, where they light anyone.`);
  const lights = map.lights?.length ? ` with ${plural(map.lights.length, 'light pool')} (they light players for the bots too)` : '';
  return result('rules', 'map.night', item, 'pass', `Played by ${choices.join(' or ')}${lights}; night and lights agree.`);
}

/** The modes the map hosts (information): Attack / Defend needs its flag, Extraction its data. */
function modes(entry: MapEntry, map: MapData): CheckResult[] {
  const item = mapItem(entry);
  const offered = MATCH_MODES.filter((m) => modeOffered(map, m.id) && playableMode(map, m.id) === m.id).map((m) => m.label);
  const out = [result('rules', 'map.modes', item, 'info', `Plays ${offered.join(', ')}${map.flag ? '' : ' (no flagpole: Attack / Defend plays as Elimination)'}.`)];
  const x = map.extraction;
  if (x) {
    out.push(
      result('rules', 'map.extraction', item, 'info', `Extraction: ${plural(x.insertions.length, 'insertion')}, ${plural(x.exits.length, 'exit')}, ${plural(x.cases.length, 'case spot')}, ${plural(x.regens.length, 'regen point')}; checked in every test run by map/extractionData.test.ts and extractionRegens.test.ts, which go over every map.`),
    );
  }
  return out;
}

/** Level 1 for one map. */
export function mapRules(entry: MapEntry, map: MapData, ctx: MapContext = gameMapContext()): CheckResult[] {
  const geo = mapGeometry(map);
  return [...registered(entry, ctx), room(entry, map), onFloor(entry, geo), ramps(entry, map), killFloor(entry, map), ...clashes(entry, map, ctx), teamColour(entry, map, ctx), lookOnly(entry, geo), nightAndLights(entry, map), ...modes(entry, map)];
}

// ---- Level 2: the layout ------------------------------------------------------------------------------------------

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
const sightlineOf = (map: MapData): Sightline | null => figure(map, 'sightline', (geo) => longestSightline(geo, standPoints(geo, spacingOf(map))));
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

/** Level 2 for one map: its layout, measured against Depot's. */
/**
 * What you see is what stops a BB: every block is drawn inside its own box (render/mapMeshes.ts blockPieces, plain and
 * with map detail), so nothing drawn hangs out where a BB passes but a player cannot see through. Look-only blocks
 * lie flat (map.lookOnly); bushes hide and let BBs through by design (airsoft concealment); tree crowns hang
 * CANOPY.minBase over the ground, above a standing player. Ramps are wedges inside their box and are not drawn in pieces.
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
  const bushes = map.foliage?.length ? `; its ${plural(map.foliage.length, 'bush', 'bushes')} hide and let BBs through, as in airsoft` : '';
  return result('compatibility', 'map.seeThrough', item, 'pass', `Every block is drawn inside its own box, so a BB stops on what you see${crowns}${bushes}.`);
}

export function mapLayoutChecks(entry: MapEntry, map: MapData, ctx: MapContext = gameMapContext()): CheckResult[] {
  const flag = flagCheck(entry, map);
  return [...laneChecks(entry, map), routeCheck(entry, map), spawnSightCheck(entry, map), sightlineCheck(entry, map, ctx), middleCheck(entry, map), ...(flag ? [flag] : []), seeThroughCheck(entry, map)];
}

// ---- Level 3: the spec test's fast part ---------------------------------------------------------------------------

/** What the map checks read of pipeline/perf-budget.json: the gate's matrix and the matrix's short map names. */
export interface PerfBudget {
  matrix: readonly { map: string; mode: string; preset: string }[];
  budgetPreset: string;
  mapIds?: Readonly<Record<string, string>>;
}

/** The name the perf matrix and run files give the map with game id `id` (its id unless `mapIds` gives a short one). */
export function perfMapName(budget: PerfBudget, id: string): string {
  return Object.entries(budget.mapIds ?? {}).find(([, game]) => game === id)?.[0] ?? id;
}

/**
 * The perf gate measures the map: perf-budget.json's matrix runs it on the budget preset in Elimination, and in
 * Extraction if it has the data, so a change that makes it slower fails a pull request. (The run itself is the content
 * check's spec test, `node pipeline/content-check.mjs map:<id>`.)
 */
export function mapPerfCheck(entry: MapEntry, map: MapData, budget: PerfBudget): CheckResult {
  const name = perfMapName(budget, entry.id);
  const modes = ['elimination', ...(map.extraction ? ['extraction'] : [])];
  const missing = modes.filter((mode) => !budget.matrix.some((r) => r.map === name && r.mode === mode && r.preset === budget.budgetPreset));
  const item = mapItem(entry);
  if (missing.length > 0) return result('spec', 'map.perfGate', item, 'fail', `The perf gate never measures it in ${missing.join(' or ')}: add {"map": "${name}", "mode": "${missing[0]}", "preset": "${budget.budgetPreset}"} to pipeline/perf-budget.json's matrix (and its baseline).`);
  return result('spec', 'map.perfGate', item, 'pass', `The perf gate measures it on ${budget.budgetPreset} in ${modes.join(' and ')} (as "${name}").`);
}

/** Levels 1 and 2 for one map, and the spec test's perf gate check. */
export function checkMap(entry: MapEntry, map: MapData, budget: PerfBudget, ctx: MapContext = gameMapContext()): CheckResult[] {
  return [...mapRules(entry, map, ctx), ...mapLayoutChecks(entry, map, ctx), mapPerfCheck(entry, map, budget)];
}

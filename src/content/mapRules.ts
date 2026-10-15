import * as THREE from 'three';
import { MAP_STANDARD, TEAM_COLOUR_RULE } from '../config/contentRules';
import { MATCH_MODES } from '../config/modes';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { AREA_NAME_MAX_LENGTH, areaAt } from '../map/areas';
import { lightingChoices, playsAtNight } from '../map/lightingChoice';
import type { MapEntry } from '../map/maps';
import type { MapBlock, MapData } from '../map/mapTypes';
import { modeOffered, playableMode } from '../map/playableMode';
import { steepestSlope, terrainRange } from '../map/terrain';
import { floorAt, isWalkableAt, nodeX, nodeZ } from '../nav/navGrid';
import type { Vec3 } from '../sim/vec';
import { type CheckResult, num, result } from './checks';
import { type MapGeometry, mapGeometry } from './mapLayout';
import { at, gameMapContext, type MapContext, mapItem, plural, where } from './mapCheckSupport';

/** Level 1 of a map's checks (CT2): its rules (docs/content/maps.md › Checks). */

/** Registered with a label, a blurb, team sizes it has room for, a unique id; public only through the public gate. */
function registered(entry: MapEntry, ctx: MapContext): CheckResult[] {
  const item = mapItem(entry);
  const out: CheckResult[] = [];
  const missing = [!entry.label.trim() && 'a label', !entry.blurb.trim() && 'a blurb'].filter(Boolean);
  const { min, standard, max } = entry.teamSize;
  if (missing.length > 0) out.push(result('rules', 'map.registered', item, 'fail', `Its entry in map/maps.ts has no ${missing.join(' or ')}.`));
  else if (!([min, standard, max].every(Number.isInteger) && min >= 1 && min <= standard && standard <= max)) out.push(result('rules', 'map.registered', item, 'fail', `Its team sizes are wrong: ${min} a side at least, ${standard} standard, ${max} at most.`));
  else if (ctx.ids.filter((id) => id === entry.id).length > 1) out.push(result('rules', 'map.registered', item, 'fail', `Its id "${entry.id}" is used by another map too. Ids are save keys and never change.`));
  else out.push(result('rules', 'map.registered', item, 'pass', `Registered as "${entry.id}": ${standard} a side standard, ${min} to ${max}.`));
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

/** Every point play stands someone on: spawns, dead-zone spots, lane points, the flag and the overtime flag. */
export function mapPoints(map: MapData): { what: string; p: Vec3 }[] {
  return [
    ...map.spawns.flatMap((end, e) => end.map((s, i) => ({ what: `end ${e} spawn ${i + 1}`, p: s.position }))),
    ...map.deadZones.flatMap((end, e) => end.map((s, i) => ({ what: `end ${e} dead-zone spot ${i + 1}`, p: s.position }))),
    ...map.lanes.flatMap((lane, l) => lane.map((p, i) => ({ what: `lane ${l + 1} point ${i + 1}`, p }))),
    ...(map.flag ? [{ what: 'the flag', p: map.flag }] : []),
    ...(map.overtimeFlag ? [{ what: 'the overtime flag', p: map.overtimeFlag }] : []),
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
  return result('rules', 'map.onFloor', mapItem(entry), 'pass', `All ${mapPoints(geo.map).length} spawns, dead-zone spots, lane points and flags stand on walkable floor.`);
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

/**
 * Named areas (CL1): each name short enough for a callout line and the minimap's caption, each box and floor range the
 * right way round, every walkable spot inside one (or a bot's callout says no place), and every name somewhere walkable.
 */
function areas(entry: MapEntry, geo: MapGeometry): CheckResult {
  const item = mapItem(entry);
  const list = geo.map.areas ?? [];
  if (list.length === 0) return result('rules', 'map.areas', item, 'warn', 'It names no areas: the bots’ callouts say no place, and the minimap shows only the map’s name.');
  const bad: string[] = [];
  for (const a of list) {
    const [x0, x1, z0, z1] = a.box;
    if (a.name.trim() === '' || a.name.length > AREA_NAME_MAX_LENGTH) bad.push(`"${a.name}" is ${a.name.trim() === '' ? 'empty' : `longer than ${AREA_NAME_MAX_LENGTH} letters`}`);
    if (!(x0 < x1 && z0 < z1)) bad.push(`"${a.name}"'s box is the wrong way round`);
    if (a.floor && !(a.floor[0] < a.floor[1])) bad.push(`"${a.name}"'s floors are the wrong way round`);
  }
  if (bad.length > 0) return result('rules', 'map.areas', item, 'fail', `Its named areas are wrong: ${bad.slice(0, 3).join('; ')}${bad.length > 3 ? `; and ${bad.length - 3} more` : ''}.`);
  const nav = geo.nav;
  const unnamed: string[] = [];
  const used = new Set<string>();
  let walkable = 0;
  for (let k = 0; k < nav.walkable.length; k++) {
    if (nav.walkable[k] !== 1) continue;
    walkable++;
    const x = nodeX(nav, k);
    const y = nav.floorY[k]!;
    const z = nodeZ(nav, k);
    const name = areaAt(list, x, y, z);
    if (name === '') unnamed.push(at({ x, y, z }));
    else used.add(name);
  }
  if (unnamed.length > 0) return result('rules', 'map.areas', item, 'fail', `${plural(unnamed.length, 'walkable spot')} in no named area, so a callout there says no place: ${unnamed.slice(0, 4).join('; ')}${unnamed.length > 4 ? '; …' : ''}.`);
  const names = [...new Set(list.map((a) => a.name))];
  const never = names.filter((n) => !used.has(n));
  if (never.length > 0) return result('rules', 'map.areas', item, 'warn', `Named areas nobody can stand in (${never.join(', ')}): fix their boxes, or the areas before them take every spot.`);
  return result('rules', 'map.areas', item, 'pass', `${plural(names.length, 'named area')} cover all ${walkable} walkable spots.`);
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
  return [...registered(entry, ctx), room(entry, map), onFloor(entry, geo), ramps(entry, map), killFloor(entry, map), ...clashes(entry, map, ctx), teamColour(entry, map, ctx), lookOnly(entry, geo), areas(entry, geo), nightAndLights(entry, map), ...modes(entry, map)];
}

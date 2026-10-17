import { describe, expect, it } from 'vitest';
import budget from '../../pipeline/perf-budget.json';
import { MAP_EXCEPTIONS, MAP_STANDARD, PUBLIC_MAPS } from '../config/contentRules';
import { TEAM_COLORS } from '../config/teams';
import { DEPOT } from '../map/depot';
import { type MapEntry, MAPS, mapData } from '../map/maps';
import type { MapBlock, MapData } from '../map/mapTypes';
import { RAMP_YARD, STACK_HOUSE, TEST_YARD } from '../map/testYard';
import { RANGE_MAP } from '../map/range';
import { vec3 } from '../sim/vec';
import { type CheckResult, worstVerdict } from './checks';
import { blockClashes, checkMap, flagCheck, gameMapContext, laneChecks, type MapContext, mapFigures, mapPerfCheck, mapRules, middleCheck, offTheFloor, readsAsTeam, routeCheck, seeThroughCheck, sightlineCheck, spawnSightCheck, tooSteep } from './mapChecks';
import { blockPieces } from '../render/field/mapPieces/pieceTable';
import { mapGeometry } from './mapLayout';

/**
 * The content toolkit's map checks (CT2): every map in the game passes levels 1 and 2 and is in the perf gate, and each
 * check fails on the fault it is there to catch (Depot with that fault in it).
 */

const ctx = gameMapContext(MAPS.map((m) => m.id));
const DEPOT_ENTRY = MAPS.find((m) => m.id === 'depot')!;
/** A dev copy of Depot's entry (its id kept, so the perf matrix finds it): a fault test never touches the real entry. */
const TEST_ENTRY: MapEntry = { ...DEPOT_ENTRY, id: 'depot' as MapEntry['id'], tag: 'dev' };

/** The verdict of check `check` among `results` (undefined when it didn't run). */
const verdictOf = (results: readonly CheckResult[], check: string): string | undefined => {
  const own = results.filter((r) => r.check === check);
  return own.length > 0 ? worstVerdict(own) : undefined;
};

/** Depot with `change` made to a copy of its data. */
const depotWith = (change: Partial<MapData>): MapData => ({ ...DEPOT, ...change });

/** Depot's ground floor alone: an open yard, every spawn in sight of every other. */
const OPEN_YARD = depotWith({ name: 'Open Yard', blocks: DEPOT.blocks.filter((b) => b.kind === 'floor' && b.center.y < 0) });

const box = (kind: MapBlock['kind'], x: number, y: number, z: number, w: number, h = w): MapBlock => ({ kind, center: vec3(x, y, z), size: vec3(w, h, w) });

describe('the map checks on the game as it ships', () => {
  it.each(MAPS)('pass $label with nothing to look at', (entry) => {
    const results = checkMap(entry, mapData(entry.id), budget, ctx);
    const flagged = results.filter((r) => r.verdict === 'fail' || r.verdict === 'warn').map((r) => `${r.check}: ${r.says}`);
    expect(flagged).toEqual([]);
    expect(new Set(results.map((r) => r.check)).size).toBeGreaterThanOrEqual(18);
    // A whole map's checks (Woodland's sightlines and routes take a few seconds on a CI runner): over the 5 s default.
  }, 30_000);

  it('keep the test fixtures on their floors, with walkable ramps and no block inside another', () => {
    for (const map of [RAMP_YARD, STACK_HOUSE]) expect(offTheFloor(mapGeometry(map)), map.name).toEqual([]);
    for (const map of [TEST_YARD, RAMP_YARD, STACK_HOUSE, RANGE_MAP]) {
      expect(tooSteep(map), map.name).toEqual([]);
      expect(blockClashes(map.blocks), map.name).toEqual([]);
    }
  });

  it('measure the longest sightlines in full, not to the coarse grid: Woodland’s corner to corner, Depot’s to its standard', () => {
    // The fine measure the old Woodland test made (140.7 m, under its 141 m), which a 1.3 m grid alone misses by 4 m.
    expect(mapFigures(mapData('woodland')).sightline!.metres).toBeGreaterThan(140);
    expect(mapFigures(mapData('depot')).sightline!.metres).toBeGreaterThan(MAP_STANDARD.longestSightline - 1);
  });

  it('register every public map, and only maps the game has', () => {
    for (const m of MAPS.filter((x) => x.tag === 'public')) expect(PUBLIC_MAPS[m.id], m.id).toBeTruthy();
    for (const id of [...Object.keys(PUBLIC_MAPS), ...Object.keys(MAP_EXCEPTIONS)]) expect(MAPS.some((m) => m.id === id), id).toBe(true);
  });
});

describe('a map’s rules', () => {
  it('fail an entry with no blurb, team sizes the wrong way round, or an id used twice', () => {
    expect(verdictOf(mapRules({ ...TEST_ENTRY, blurb: ' ' }, DEPOT, ctx), 'map.registered')).toBe('fail');
    expect(verdictOf(mapRules({ ...TEST_ENTRY, teamSize: { min: 1, standard: 4, max: 3 } }, DEPOT, ctx), 'map.registered')).toBe('fail');
    expect(verdictOf(mapRules({ ...TEST_ENTRY, teamSize: { min: 4, standard: 3, max: 3 } }, DEPOT, ctx), 'map.registered')).toBe('fail');
    expect(verdictOf(mapRules(TEST_ENTRY, DEPOT, { ...ctx, ids: ['depot', 'depot'] }), 'map.registered')).toBe('fail');
  });

  it('keep a new map dev until the owner makes it public', () => {
    const fresh: MapEntry = { ...TEST_ENTRY, id: 'quarry' as MapEntry['id'] };
    expect(verdictOf(mapRules(fresh, DEPOT, ctx), 'map.access')).toBe('pass');
    expect(verdictOf(mapRules({ ...fresh, tag: 'public' }, DEPOT, ctx), 'map.access')).toBe('fail');
    expect(verdictOf(mapRules({ ...fresh, tag: 'public' }, DEPOT, { ...ctx, publicMaps: { quarry: 'the owner, playtested' } }), 'map.access')).toBe('pass');
  });

  it('fail a map without a spawn and a dead-zone spot per player for its largest team', () => {
    expect(verdictOf(mapRules({ ...TEST_ENTRY, teamSize: { min: 1, standard: 3, max: 4 } }, DEPOT, ctx), 'map.room')).toBe('fail');
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ deadZones: [DEPOT.deadZones[0].slice(1), DEPOT.deadZones[1]] }), ctx), 'map.room')).toBe('fail');
  });

  it('fail a spawn off the floor', () => {
    const [first, ...rest] = DEPOT.spawns[0];
    const lifted = depotWith({ spawns: [[{ ...first!, position: vec3(first!.position.x, 0.5, first!.position.z) }, ...rest], DEPOT.spawns[1]] });
    expect(verdictOf(mapRules(TEST_ENTRY, lifted, ctx), 'map.onFloor')).toBe('fail');
  });

  it('fail a ramp steeper than the physics walks', () => {
    const steep: MapBlock = { kind: 'ramp', center: vec3(0, 0.75, -14), size: vec3(2, 1.5, 2), rise: '+x' };
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ blocks: [...DEPOT.blocks, steep] }), ctx), 'map.ramps')).toBe('fail');
  });

  it('fail a floor of last resort above the ground', () => {
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ killY: 0 }), ctx), 'map.killY')).toBe('fail');
  });

  it('fail a block inside another, and ask for a look at an exception no longer there', () => {
    const crate = DEPOT.blocks.find((b) => b.kind === 'crate')!;
    const inside = { ...crate, center: vec3(crate.center.x + 0.1, crate.center.y, crate.center.z) };
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ blocks: [...DEPOT.blocks, inside] }), ctx), 'map.blocks')).toBe('fail');
    const stale: MapContext = { ...ctx, exceptions: { depot: { clashes: { list: ['crate at 0.00, 0.00, 0.00 and wall at 0.00, 0.00, 0.00 fill the same space'], reason: 'test' } } } };
    expect(verdictOf(mapRules(TEST_ENTRY, DEPOT, stale), 'map.blocks')).toBe('warn');
    // Side by side with a seam's overlap, or one standing on the other: fine.
    expect(blockClashes([box('wall', 0, 1, 0, 1, 2), box('wall', 1 - MAP_STANDARD.seamSlack / 2, 1, 0, 1, 2)])).toEqual([]);
    expect(blockClashes([box('wall', 0, 1, 0, 1, 2), box('crate', 0, 3, 0, 1, 2)])).toEqual([]);
    // Flush in a corner, sharing two faces' planes: still inside.
    expect(blockClashes([box('wall', 0, 1, 0, 1, 2), box('crate', 0.25, 1, 0, 0.5, 2)])).toHaveLength(1);
  });

  it('fail paint in a team colour on a block, a look-only block or a marking', () => {
    const crate = DEPOT.blocks.find((b) => b.kind === 'crate')!;
    const painted = DEPOT.blocks.map((b) => (b === crate ? { ...b, paint: TEAM_COLORS[0]! } : b));
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ blocks: painted }), ctx), 'map.teamColour')).toBe('fail');
    const marking = { centre: vec3(0, 0.01, 0), width: 2, height: 2, facing: '+y' as const, colour: TEAM_COLORS[1]!, kind: 'paint' as const };
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ signs: [marking] }), ctx), 'map.teamColour')).toBe('fail');
    // A neon sign glows any colour: light, not paint.
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ signs: [{ ...marking, kind: 'neon' }] }), ctx), 'map.teamColour')).toBe('pass');
    // Near-team colours are caught (the old prop tints), greys and far hues are not.
    for (const near of [0x3d6ea8, 0xf07c2a, 0x8c5b3e]) expect(readsAsTeam(near, ctx.teamColours), near.toString(16)).toBe(true);
    for (const far of [0x7a7a7a, 0x4f8a3c]) expect(readsAsTeam(far, ctx.teamColours), far.toString(16)).toBe(false);
  });

  it('fail a look-only block that stands up where a BB passes through it', () => {
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ decor: [box('wall', 0, 1, -14, 1, 2)] }), ctx), 'map.lookOnly')).toBe('fail');
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ decor: [box('floor', 0, 0.002, -14, 2, 0.004)] }), ctx), 'map.lookOnly')).toBe('pass');
  });

  it('fail a night flag its lighting does not have, and light pools on a field never played at night', () => {
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ night: true }), ctx), 'map.night')).toBe('fail');
    const lantern = { position: vec3(0, 0, 0), radius: 4, colour: 0xffd27a };
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ lights: [lantern] }), ctx), 'map.night')).toBe('fail');
    expect(verdictOf(mapRules(TEST_ENTRY, depotWith({ lights: [lantern], lighting: { presets: ['day', 'night'] } }), ctx), 'map.night')).toBe('pass');
  });
});

describe('a map’s layout', () => {
  it('fails one lane, asks for a look at two, and fails a lane that runs the wrong way or can’t be walked', () => {
    expect(verdictOf(laneChecks(TEST_ENTRY, depotWith({ lanes: DEPOT.lanes.slice(0, 1) })), 'map.lanes')).toBe('fail');
    expect(verdictOf(laneChecks(TEST_ENTRY, depotWith({ lanes: DEPOT.lanes.slice(0, 2) })), 'map.lanes')).toBe('warn');
    const backwards = depotWith({ lanes: [[...DEPOT.lanes[0]!].reverse(), ...DEPOT.lanes.slice(1)] });
    expect(verdictOf(laneChecks(TEST_ENTRY, backwards), 'map.laneWalk')).toBe('fail');
    // A lane point on top of a 2 m wall nobody can climb.
    const wall = box('wall', 0, 1, 14, 1, 2);
    const walled = depotWith({ blocks: [...DEPOT.blocks, wall], lanes: [[...DEPOT.lanes[0]!.slice(0, 2), vec3(0, 2, 14), ...DEPOT.lanes[0]!.slice(2)], ...DEPOT.lanes.slice(1)] });
    expect(verdictOf(laneChecks(TEST_ENTRY, walled), 'map.laneWalk')).toBe('fail');
  });

  it('fails a spawn nobody can walk out of', () => {
    // End 1's first spawn boxed in by four walls.
    const s = DEPOT.spawns[1][0]!.position;
    const walls = [box('wall', s.x + 1, 1.5, s.z, 0.3, 3), box('wall', s.x - 1, 1.5, s.z, 0.3, 3)].map((b) => ({ ...b, size: vec3(0.3, 3, 2.3) }));
    const caps = [box('wall', s.x, 1.5, s.z + 1, 0.3, 3), box('wall', s.x, 1.5, s.z - 1, 0.3, 3)].map((b) => ({ ...b, size: vec3(1.7, 3, 0.3) }));
    expect(routeCheck(TEST_ENTRY, depotWith({ blocks: [...DEPOT.blocks, ...walls, ...caps] })).verdict).toBe('fail');
  });

  it('fails spawns in sight of each other and a sightline over the standard, unless written down', () => {
    expect(spawnSightCheck(TEST_ENTRY, OPEN_YARD).verdict).toBe('fail');
    expect(sightlineCheck(TEST_ENTRY, OPEN_YARD, ctx).verdict).toBe('fail');
    const allowed: MapContext = { ...ctx, exceptions: { depot: { longestSightline: { metres: 80, reason: 'test' } } } };
    expect(sightlineCheck(TEST_ENTRY, OPEN_YARD, allowed).verdict).toBe('pass');
  });

  it('fails a field where one end reaches the middle far sooner, and a flag the attackers see or reach as soon', () => {
    const near = DEPOT.spawns[1].map((s) => ({ ...s, position: vec3(s.position.x - 24, 0, s.position.z) }));
    expect(middleCheck(TEST_ENTRY, depotWith({ spawns: [DEPOT.spawns[0], near] })).verdict).toBe('fail');
    expect(flagCheck(TEST_ENTRY, depotWith({ flag: vec3(0, 0, 0.5) }))?.verdict).toBe('fail');
    // Far enough from the attackers, but in their sight across an open yard.
    const flag = vec3(DEPOT.spawns[1][0]!.position.x - 4, 0, DEPOT.spawns[1][0]!.position.z);
    expect(flagCheck(TEST_ENTRY, { ...OPEN_YARD, flag })?.verdict).toBe('fail');
  });

  it('fails a block drawn outside its box, where a BB would pass through what a player sees', () => {
    expect(seeThroughCheck(TEST_ENTRY, DEPOT).verdict).toBe('pass');
    const crate = DEPOT.blocks.find((b) => b.kind === 'crate')!;
    // A drawing that hangs a crate's lid 10 cm past its box.
    const overhang: typeof blockPieces = (b, blocks, detail) => blockPieces(b, blocks, detail).map((p) => (b === crate ? { ...p, box: { min: p.box.min, max: [p.box.max[0]! + 0.1, p.box.max[1]!, p.box.max[2]!] } } : p));
    const r = seeThroughCheck(TEST_ENTRY, DEPOT, overhang);
    expect(r.verdict).toBe('fail');
    expect(r.says).toContain('drawn 0.1 m outside its box');
  });
});

describe('a map’s spec test', () => {
  it('fails a map the perf gate never measures', () => {
    expect(mapPerfCheck(TEST_ENTRY, DEPOT, budget).verdict).toBe('pass');
    expect(mapPerfCheck(TEST_ENTRY, DEPOT, { ...budget, matrix: budget.matrix.filter((r) => r.map !== 'depot' || r.mode !== 'extraction') }).verdict).toBe('fail');
    expect(mapPerfCheck({ ...TEST_ENTRY, id: 'neonHeights' }, mapData('neonHeights'), budget).says).toContain('"neon"');
  });
});

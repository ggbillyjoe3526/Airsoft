import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS, WIND } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { buildNavGrid, clearLine, createNavSearch, findPath, floorAt, isWalkableAt } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter, respawnCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { OPEN_FIELD } from '../sim/testSupport';
import { type Vec3, vec3 } from '../sim/vec';
import { createWind } from '../sim/wind';
import type { Bush } from './foliage';
import type { MapData } from './mapTypes';
import { terrainHeightAt } from './terrain';
import { DEPOT } from './depot';
import { RANGE_MAP } from './range';
import { WOODLAND } from './woodland';

/**
 * M33e QA, acceptance 2 (BBs, players and bots pass straight through bushes: no collider, no level-ray surface, the nav
 * grid walkable under them) and the "maps without foliage are unchanged" half of acceptance 3, in the simulation proper:
 * real Rapier world, real stepSimulation, real nav grid.
 */

const DT = 1 / 60;
/** A bush no one could walk or shoot round by accident: 1.4 m round, 2 m tall, standing at (0, 0, -5). */
const BUSH: Bush = { x: 0, y: 0, z: -5, radius: 1.4, height: 2 };
const withBush = (map: MapData = OPEN_FIELD, bushes: readonly Bush[] = [BUSH]): MapData => ({ ...map, foliage: bushes });

function context(map: MapData, physics: PhysicsWorld, seed: number) {
  return createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    wind: createWind(seed, WIND),
    killY: map.killY,
    hits: HITS,
    deadZones: [[{ position: vec3(-40, 0, 0), yaw: 0 }], [{ position: vec3(40, 0, 0), yaw: 0 }]],
    spawnLift: PHYSICS.groundRestGap,
    nav: buildNavGrid(map, NAV),
    navSnap: NAV.snap,
    rounds: ROUNDS,
  });
}

/** Blue (id 0) at the origin facing -Z, Orange (id 1) `targetZ` away, holding the trigger; real physics. */
function duel(map: MapData, targetZ: number) {
  const physics = new PhysicsWorld(map, BODY, DT);
  const state = createGameState(3, BALLISTICS.maxBBs, ROUNDS);
  const shooter = createCharacter(0, vec3(0, PHYSICS.groundRestGap, 0), 0, LOADOUT, 0);
  const target = createCharacter(1, vec3(0, PHYSICS.groundRestGap, targetZ), 0, LOADOUT, 1);
  // A second Orange keeps the round live whatever happens to the first.
  const spare = createCharacter(2, vec3(30, PHYSICS.groundRestGap, 30), 0, LOADOUT, 1);
  state.characters.push(shooter, target, spare);
  for (const c of state.characters) {
    respawnCharacter(c);
    physics.addCharacter(c);
  }
  shooter.position = vec3(0, PHYSICS.groundRestGap, 0);
  target.position = vec3(0, PHYSICS.groundRestGap, targetZ);
  spare.position = vec3(30, PHYSICS.groundRestGap, 30);
  const fire = createCommand();
  fire.fire = true;
  const commands = new Map<number, PlayerCommand>([[0, fire]]);
  return { physics, state, shooter, target, ctx: context(map, physics, 3), commands };
}

/** Ticks of fire until the target is hit (or `max`); -1 if never. Also the furthest a BB got along -Z while flying. */
function firstHit(map: MapData, targetZ: number, max = 180) {
  const { physics, state, target, ctx, commands } = duel(map, targetZ);
  let hitAt = -1;
  for (let i = 0; i < max && hitAt < 0; i++) {
    stepSimulation(state, commands, ctx, DT);
    if (state.events.some((e) => e.type === 'characterHit' && e.victimId === target.id)) hitAt = i;
  }
  physics.dispose();
  return { hitAt };
}

describe('BBs fly through a bush (M33e, acceptance 2)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('hits a player standing behind a bush just as with no bush there', () => {
    const open = firstHit(OPEN_FIELD, -9);
    expect(open.hitAt, 'control: open field').toBeGreaterThanOrEqual(0);
    const bushed = firstHit(withBush(), -9);
    expect(bushed.hitAt, 'a bush between them').toBeGreaterThanOrEqual(0);
    // Not stopped or slowed on the way: the same tick, the same everything (the bush is no surface, no drag).
    expect(bushed.hitAt).toBe(open.hitAt);
  });

  it('is stopped by a wall of the same size in the same place (the control: the test can fail)', () => {
    const wall = { kind: 'wall' as const, center: vec3(0, 1, -5), size: vec3(2.8, 2, 2.8) };
    const walled = firstHit({ ...OPEN_FIELD, blocks: [...OPEN_FIELD.blocks, wall] }, -9, 120);
    expect(walled.hitAt).toBe(-1);
  });

  it('gives the level ray nothing to hit inside a bush, from any side', () => {
    const physics = new PhysicsWorld(withBush(), BODY, DT);
    const ahead = vec3(0, 0, -1);
    const chest = (z: number): Vec3 => vec3(0, 1, z);
    expect(physics.raycastStatic(chest(0), ahead, 12)).toBe(-1);
    expect(physics.raycastStatic(vec3(-6, 1, -5), vec3(1, 0, 0), 12)).toBe(-1);
    expect(physics.raycastStatic(vec3(0, 5, -5), vec3(0, -1, 0), 4.5)).toBe(-1); // straight down onto it: only the floor, below
    physics.dispose();
  });
});

describe('people walk straight through a bush (M33e, acceptance 2)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  /** Walks a player forward (-Z) from z = 0 for `seconds`; returns where it ended and the slowest speed it had. */
  function walk(map: MapData, seconds: number) {
    const physics = new PhysicsWorld(map, BODY, DT);
    const state = createGameState(1, 16, ROUNDS);
    const c = createCharacter(0, vec3(0, PHYSICS.groundRestGap, 0), 0, LOADOUT, 0);
    state.characters.push(createCharacter(1, vec3(30, PHYSICS.groundRestGap, 30), 0, LOADOUT, 1), c);
    for (const ch of state.characters) {
      respawnCharacter(ch);
      physics.addCharacter(ch);
    }
    c.position = vec3(0, PHYSICS.groundRestGap, 0);
    const go = createCommand();
    go.forward = 1;
    const ctx = context(map, physics, 1);
    let slowest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < seconds / DT; i++) {
      stepSimulation(state, new Map([[0, go]]), ctx, DT);
      if (i > 30) slowest = Math.min(slowest, Math.hypot(c.velocity.x, c.velocity.z));
    }
    physics.dispose();
    return { x: c.position.x, z: c.position.z, slowest };
  }

  it('walks through the middle of a bush without slowing, and ends where it would with no bush', () => {
    const free = walk(OPEN_FIELD, 4);
    const through = walk(withBush(), 4);
    expect(free.z).toBeLessThan(-BUSH.z + BUSH.radius); // the walk really does carry it right through (z < -6.4)
    expect(through.z).toBeCloseTo(free.z, 6);
    expect(through.x).toBeCloseTo(free.x, 6);
    expect(through.slowest).toBeCloseTo(free.slowest, 6);
  });
});

describe('the nav grid under bushes (M33e, acceptance 2)', () => {
  it('is the same grid with bushes as without, on a bare field', () => {
    const a = buildNavGrid(OPEN_FIELD, NAV);
    const b = buildNavGrid(withBush(OPEN_FIELD, [BUSH, { ...BUSH, x: 6, z: 3 }]), NAV);
    expect(Array.from(b.floorY)).toEqual(Array.from(a.floorY));
    expect(b.cols).toBe(a.cols);
    expect(isWalkableAt(b, BUSH.x, 0, BUSH.z)).toBe(true);
  });

  it('finds a straight path through a bush for a bot, and the line is clear', () => {
    const nav = buildNavGrid(withBush(), NAV);
    const out: Vec3[] = [];
    const search = createNavSearch(nav);
    expect(findPath(nav, search, vec3(0, 0, 0), vec3(0, 0, -10), NAV.snap, out)).toBe(true);
    expect(clearLine(nav, 0, 0, 0, 0, -10)).toBe(true);
    // Straight through, not round: no waypoint strays beyond a cell or two of the line.
    for (const p of out) expect(Math.abs(p.x)).toBeLessThan(NAV.cell * 2);
  });

  it('keeps Woodland’s grid, and its level query, exactly as they are without its bushes', async () => {
    await initPhysics();
    const bushes = WOODLAND.foliage!;
    expect(bushes.length).toBeGreaterThanOrEqual(50);
    const bare: MapData = { ...WOODLAND };
    delete bare.foliage;
    const navWith = buildNavGrid(WOODLAND, NAV);
    const navBare = buildNavGrid(bare, NAV);
    expect(Array.from(navWith.floorY)).toEqual(Array.from(navBare.floorY));
    // Every bush stands on ground a bot can stand on: its middle and four points inside its rim.
    for (const b of bushes) {
      for (const [dx, dz] of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]] as const) {
        const x = b.x + dx * b.radius;
        const z = b.z + dz * b.radius;
        const y = terrainHeightAt(WOODLAND.terrain!, x, z)!;
        expect(isWalkableAt(navWith, x, y, z), `bush at ${b.x.toFixed(1)}, ${b.z.toFixed(1)} (${dx}, ${dz})`).toBe(true);
        expect(Number.isNaN(floorAt(navWith, x, y, z))).toBe(false);
      }
    }
    // No collider: a ray through every bush hits what it hits on the same map without bushes.
    const physics = new PhysicsWorld(WOODLAND, BODY, DT);
    const plain = new PhysicsWorld(bare, BODY, DT);
    for (const b of bushes) {
      const chestY = b.y + 1;
      for (const [o, d] of [
        [vec3(b.x - 4, chestY, b.z), vec3(1, 0, 0)],
        [vec3(b.x, chestY, b.z - 4), vec3(0, 0, 1)],
        [vec3(b.x, b.y + b.height + 2, b.z), vec3(0, -1, 0)],
      ] as const) {
        expect(physics.raycastStatic(o, d, 8)).toBe(plain.raycastStatic(o, d, 8));
      }
    }
    physics.dispose();
    plain.dispose();
  });
});

describe('maps without foliage are unchanged (M33e, acceptance 3)', () => {
  it('Depot and the range have none, and Woodland is the only map that does', () => {
    expect(DEPOT.foliage).toBeUndefined();
    expect(RANGE_MAP.foliage).toBeUndefined();
    expect(WOODLAND.foliage).toBeDefined();
  });
});

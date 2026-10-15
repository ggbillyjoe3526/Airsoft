import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { NOISE } from '../config/noise';
import { PHYSICS } from '../config/physics';
import { DEPOT } from '../map/depot';
import { groundGridOf } from '../map/groundSurfaces';
import type { MapBlock, MapData } from '../map/mapTypes';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { surfaceHeightAt } from '../map/surfaces';
import { terrainHeightAt } from '../map/terrain';
import { surfaceUnder } from '../map/underfoot';
import { WOODLAND } from '../map/woodland';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { type Character, createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import type { GameEvent } from './events';
import { createSimContext, type SimContext, stepSimulation } from './simulation';
import { createGameState, type GameState } from './state';
import { vec3 } from './vec';

/**
 * Noisy props through the whole simulation, against Rapier's character controller (NP1): a run or sprint into a noisy
 * prop knocks it once; a walk, a crouch, a glance along it, a push held against it or a wall beside it never does; a BB
 * landing hard on steel rings it. Steps carry the ground they land on.
 */

const DT = 1 / 60;
const REST = PHYSICS.groundRestGap;
const FLOOR: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(24, 0.5, 24) };
/** A crate (wood, noisy) whose near face is at z = -2.6, straight ahead of the player (who faces -z). */
const CRATE: MapBlock = { kind: 'crate', center: vec3(0, 0.6, -3.2), size: vec3(1.2, 1.2, 1.2) };

type PropNoiseEvent = Extract<GameEvent, { type: 'propNoise' }>;

interface Run {
  state: GameState;
  ctx: SimContext;
  world: PhysicsWorld;
  player: Character;
  cmd: PlayerCommand;
  events: GameEvent[];
}

function setUp(blocks: MapBlock[], at = vec3(0, REST, 0)): Run {
  const map: MapData = { name: 'noise', blocks, killY: -20, spawns: [[], []], deadZones: [[], []], lanes: [] };
  const world = new PhysicsWorld(map, BODY, DT);
  const nav = buildNavGrid(map, NAV);
  const deadZones = [[{ position: vec3(-10, 0, 8), yaw: 0 }], [{ position: vec3(10, 0, 8), yaw: 0 }]];
  const ctx = createSimContext({ mover: world, query: world, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: map.killY, hits: HITS, deadZones, rounds: ROUNDS, nav, navSnap: NAV.snap });
  const state = createGameState(1, 16, ROUNDS);
  const player = createCharacter(0, at, 0, undefined, 0);
  // Someone on the other team, far off, so the round stays live.
  const other = createCharacter(1, vec3(10, REST, 10), 0, undefined, 1);
  state.characters.push(player, other);
  world.addCharacter(player);
  world.addCharacter(other);
  return { state, ctx, world, player, cmd: createCommand(), events: [] };
}

function tick(run: Run, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    stepSimulation(run.state, new Map([[0, run.cmd]]), run.ctx, DT);
    run.events.push(...run.state.events);
  }
}

const noises = (run: Run): PropNoiseEvent[] => run.events.filter((e): e is PropNoiseEvent => e.type === 'propNoise');

/** Moves the player straight at -z for `seconds` at a pace: 'walk', 'crouch', 'run' or 'sprint'. */
function push(run: Run, pace: 'walk' | 'crouch' | 'run' | 'sprint', seconds: number): void {
  run.cmd.forward = 1;
  run.cmd.walk = pace === 'walk';
  run.cmd.crouch = pace === 'crouch';
  run.cmd.sprint = pace === 'sprint';
  tick(run, Math.round(seconds / DT));
}

describe('running into a noisy prop (NP1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a run straight into a crate knocks it once, from its face, as far as a crate carries; pushing on against it stays quiet', () => {
    const run = setUp([FLOOR, CRATE]);
    push(run, 'run', 3);
    const heard = noises(run);
    expect(heard).toHaveLength(1);
    const [e] = heard;
    expect(e!.characterId).toBe(0);
    expect(e!.kind).toBe('crate');
    expect(e!.shot).toBe(false);
    expect(e!.range).toBe(NOISE.props.crate!.bumped);
    // From the crate's near face, at about hip height, in front of the player.
    expect(e!.position.z).toBeCloseTo(-2.6, 5);
    expect(e!.position.x).toBeCloseTo(0, 1);
    expect(e!.position.y).toBeCloseTo(REST + NOISE.noiseHeight, 1);
    // The body stopped at the crate, never inside it.
    expect(run.player.position.z).toBeGreaterThan(-2.6 + BODY.radius - 0.01);
    run.world.dispose();
  });

  it('a sprint into a skip booms as far as steel carries', () => {
    const skip: MapBlock = { ...CRATE, kind: 'skip', size: vec3(3, 1.4, 1.2), center: vec3(0, 0.7, -3.2) };
    const run = setUp([FLOOR, skip]);
    push(run, 'sprint', 2);
    expect(noises(run).map((e) => [e.kind, e.range])).toEqual([['skip', NOISE.props.skip!.bumped]]);
    run.world.dispose();
  });

  it('walking or crouching into it, the prop stays quiet', () => {
    for (const pace of ['walk', 'crouch'] as const) {
      const run = setUp([FLOOR, CRATE]);
      push(run, pace, 4);
      expect(run.player.position.z, pace).toBeGreaterThan(-2.6 + BODY.radius - 0.01);
      expect(run.player.position.z, `${pace}: it got there`).toBeLessThan(-2.6 + BODY.radius + 0.05);
      expect(noises(run), pace).toEqual([]);
      run.world.dispose();
    }
  });

  it('a run that glances along it slides by quietly; a run straight in at it then knocks it', () => {
    // A long crate stack whose side runs along the player's path, 0.05 m off the body: the run brushes along it.
    const stack: MapBlock = { kind: 'crate', center: vec3(BODY.radius + 0.6 + 0.02, 0.6, -4), size: vec3(1.2, 1.2, 8) };
    const run = setUp([FLOOR, stack]);
    // Running at about 20° into its side.
    run.cmd.right = 0.36;
    push(run, 'run', 1.5);
    expect(noises(run)).toEqual([]);
    run.world.dispose();
    const square = setUp([FLOOR, stack], vec3(-2, REST, -4));
    square.cmd.yaw = -Math.PI / 2;
    push(square, 'run', 1.5);
    expect(noises(square)).toHaveLength(1);
    square.world.dispose();
  });

  it('a wall in front, with a crate beside the runner, is what stopped them: no knock', () => {
    const wall: MapBlock = { kind: 'wall', center: vec3(0, 1.5, -3), size: vec3(6, 3, 0.4) };
    // The crate right beside the path, its side face just clear of the body.
    const beside: MapBlock = { kind: 'crate', center: vec3(BODY.radius + 0.6 + 0.03, 0.6, -2.2), size: vec3(1.2, 1.2, 1.2) };
    const run = setUp([FLOOR, wall, beside]);
    push(run, 'sprint', 2);
    expect(run.player.position.z).toBeLessThan(-2);
    expect(noises(run)).toEqual([]);
    run.world.dispose();
  });

  it('running across the top of a crate never knocks the crate underfoot', () => {
    // A wide pallet load the player starts on, running off its far edge.
    const load: MapBlock = { kind: 'wrapped', center: vec3(0, 0.25, -2), size: vec3(6, 0.5, 8) };
    const run = setUp([FLOOR, load], vec3(0, 0.5 + REST, 1));
    push(run, 'sprint', 1.5);
    expect(noises(run)).toEqual([]);
    run.world.dispose();
  });

  it('knocks a prop again only once it has been quiet for NOISE.quiet, and walls and floors never', () => {
    const run = setUp([FLOOR, CRATE]);
    push(run, 'run', 1.2);
    expect(noises(run)).toHaveLength(1);
    // Back off and run in again at once: still ringing, no second knock.
    run.cmd.forward = -1;
    tick(run, 8);
    push(run, 'run', 0.3);
    expect(run.state.time - 1.2 - 8 * DT).toBeLessThan(NOISE.quiet);
    expect(noises(run)).toHaveLength(1);
    // Later: a second knock.
    run.cmd.forward = -1;
    tick(run, Math.round(NOISE.quiet / DT));
    push(run, 'run', 2.5);
    expect(noises(run)).toHaveLength(2);
    run.world.dispose();
    const walls = setUp([FLOOR, { ...CRATE, kind: 'wall' }]);
    push(walls, 'sprint', 2);
    expect(noises(walls)).toEqual([]);
    walls.world.dispose();
  });
});

describe('a BB ringing off steel (NP1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  /** Fires the player's replica straight ahead (-z) for `seconds`, after a second to have it ready. */
  function fireAhead(blocks: MapBlock[], seconds: number): Run {
    const run = setUp(blocks);
    tick(run, 60);
    run.cmd.fire = true;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      // Pull the trigger afresh every few ticks: a semi-auto replica fires on the press.
      run.cmd.fire = i % 6 < 3;
      tick(run);
    }
    run.cmd.fire = false;
    tick(run, 30);
    return run;
  }

  it('rings a skip hit straight on, as far as steel rings, once per NOISE.quiet however many land', () => {
    const skip: MapBlock = { kind: 'skip', center: vec3(0, 1, -5.6), size: vec3(4, 2, 1.2) };
    const run = fireAhead([FLOOR, skip], 1);
    const rings = noises(run);
    expect(run.events.filter((e) => e.type === 'shot').length).toBeGreaterThan(2);
    expect(rings.length).toBeGreaterThanOrEqual(1);
    expect(rings.length).toBeLessThanOrEqual(Math.ceil(1.5 / NOISE.quiet));
    for (const e of rings) {
      expect(e.shot).toBe(true);
      expect(e.kind).toBe('skip');
      expect(e.range).toBe(NOISE.props.skip!.shot);
      expect(e.characterId).toBe(0);
      // Where the BB stopped, on the skip's near face.
      expect(Math.abs(e.position.z - -5)).toBeLessThan(NOISE.shotMargin + 0.05);
    }
    run.world.dispose();
  });

  it("doesn't ring a crate: timber only knocks when run into", () => {
    const run = fireAhead([FLOOR, { ...CRATE, center: vec3(0, 1, -5.6), size: vec3(4, 2, 1.2) }], 1);
    expect(run.events.filter((e) => e.type === 'shot').length).toBeGreaterThan(2);
    expect(noises(run)).toEqual([]);
    run.world.dispose();
  });
});

describe('steps carry the ground they land on (NP1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it("names the steel of a ramp plate on a running step, and a floor's own surface", () => {
    const plate: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(24, 0.5, 24), surface: 'metal' };
    const run = setUp([plate]);
    push(run, 'run', 1.5);
    const steps = run.events.filter((e): e is Extract<GameEvent, { type: 'footstep' }> => e.type === 'footstep');
    expect(steps.length).toBeGreaterThan(0);
    for (const e of steps) expect(e.surface).toBe('metal');
    run.world.dispose();
    const concrete = setUp([FLOOR]);
    push(concrete, 'sprint', 1.5);
    const plain = concrete.events.filter((e): e is Extract<GameEvent, { type: 'footstep' }> => e.type === 'footstep');
    expect(plain.length).toBeGreaterThan(0);
    for (const e of plain) expect(e.surface).toBe('concrete');
    concrete.world.dispose();
  });

  it('reads the ground of each real map as the audio does: steel on the ramps and stairs, gravel in the creek', () => {
    for (const map of [DEPOT, NEON_HEIGHTS]) {
      const world = new PhysicsWorld(map, BODY, DT);
      const ramp = map.blocks.find((b) => b.kind === 'ramp' && b.surface === 'metal')!;
      expect(ramp, map.name).toBeDefined();
      const top = surfaceHeightAt(ramp, ramp.center.x, ramp.center.z)!;
      expect(world.surfaceUnder(vec3(ramp.center.x, top + 0.02, ramp.center.z)), map.name).toBe('metal');
      expect(world.surfaceUnder(vec3(ramp.center.x, top + 0.02, ramp.center.z))).toBe(surfaceUnder(map.blocks, vec3(ramp.center.x, top + 0.02, ramp.center.z)));
      // Its noisy props, one per noisy block, in block order.
      expect(world.noisyProps.map((p) => p.kind), map.name).toEqual(map.blocks.filter((b) => NOISE.props[b.kind]).map((b) => b.kind));
      world.dispose();
    }
    const woods = new PhysicsWorld(WOODLAND, BODY, DT);
    const creek = WOODLAND.ground!.patches.find((p) => p.surface === 'gravel' && p.path)!;
    const at = creek.path![0]!;
    const feet = vec3(at.x, terrainHeightAt(WOODLAND.terrain!, at.x, at.z)!, at.z);
    expect(woods.surfaceUnder(feet)).toBe('gravel');
    expect(surfaceUnder(WOODLAND.blocks, feet, groundGridOf(WOODLAND))).toBe('gravel');
    // Its only noisy props are the field's board fence.
    expect(woods.noisyProps.length).toBeGreaterThan(10);
    expect(woods.noisyProps.every((p) => p.kind === 'fence')).toBe(true);
    woods.dispose();
  });
});

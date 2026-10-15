import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS, WIND } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter, respawnCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { createWind } from '../sim/wind';
import type { Bush } from './foliage';
import type { MapData } from './mapTypes';
import { WOODLAND } from './woodland';

/**
 * M33e QA, acceptance 2 (players and bots pass straight through bushes: no collider, no level-ray surface, the nav grid
 * walkable under them) and the "maps without foliage are unchanged" half of acceptance 3, in the simulation proper: real
 * Rapier world, real stepSimulation, real nav grid. BBs no longer pass (Dev 6 item 44): a bush's leaves stop them, so the
 * first block checks that instead.
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

/** The events of `ticks` of fire, as a string, so two runs compare exactly. */
function run(map: MapData, ticks: number) {
  const { physics, state, ctx, commands } = duel(map, -9);
  const log: string[] = [];
  for (let i = 0; i < ticks; i++) {
    stepSimulation(state, commands, ctx, DT);
    for (const e of state.events) log.push(JSON.stringify(e));
  }
  physics.dispose();
  return log;
}

describe('bushes in the simulation proper (Dev 6 item 44, acceptance 1, 2)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('hands the map\'s bushes to the level query, so BBs meet them (Woodland has them)', () => {
    const physics = new PhysicsWorld(WOODLAND, BODY, DT);
    expect(physics.foliage).toBe(WOODLAND.foliage);
    expect(physics.foliage!.length).toBeGreaterThanOrEqual(50);
    physics.dispose();
    const none = new PhysicsWorld(OPEN_FIELD, BODY, DT);
    expect(none.foliage ?? []).toHaveLength(0);
    none.dispose();
  });

  it('plays out the same with the same seed, leaves and all, and stops BBs in the leaves', () => {
    const a = run(withBush(), 120);
    const b = run(withBush(), 120);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(a.some((e) => e.includes('"leaves":true'))).toBe(true);
  });
});

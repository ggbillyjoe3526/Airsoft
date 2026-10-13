import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { VAULT } from '../config/vault';
import type { MapBlock, MapData } from '../map/mapTypes';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import type { GameEvent } from './events';
import { createSimContext, stepSimulation } from './simulation';
import { createGameState } from './state';
import { vec3 } from './vec';

/**
 * M102 gaps, through the whole simulation against Rapier: a holstered replica stays put through a vault, a crouched
 * player never vaults, and a low kerb is jumped, not vaulted.
 */

const DT = 1 / 60;
const REST = PHYSICS.groundRestGap;
const R = BODY.radius;
const FLOOR: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(24, 0.5, 24) };

const obstacle = (height: number, depth = 0.4, kind: MapBlock['kind'] = 'wall'): MapBlock => ({ kind, center: vec3(0, height / 2, -2 - depth / 2), size: vec3(24, height, depth) });

function setUp(blocks: MapBlock[]) {
  const map: MapData = { name: 'vault', blocks, killY: -20, spawns: [[], []], deadZones: [[], []], lanes: [] };
  const world = new PhysicsWorld(map, BODY, DT);
  const nav = buildNavGrid(map, NAV);
  const deadZones = [[{ position: vec3(-10, 0, 8), yaw: 0 }], [{ position: vec3(10, 0, 8), yaw: 0 }]];
  const ctx = createSimContext({ mover: world, query: world, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: map.killY, hits: HITS, deadZones, rounds: ROUNDS, nav, navSnap: NAV.snap });
  const state = createGameState(1, 16, ROUNDS);
  const player = createCharacter(0, vec3(0, REST, 0), 0, undefined, 0);
  const other = createCharacter(1, vec3(8, REST, 8), 0, undefined, 1);
  state.characters.push(player, other);
  world.addCharacter(player);
  world.addCharacter(other);
  const events: GameEvent[] = [];
  let vaultTicks = 0;
  let airTicks = 0;
  const tick = (act: (cmd: PlayerCommand) => void): void => {
    const cmd = createCommand();
    act(cmd);
    stepSimulation(state, new Map([[0, cmd]]), ctx, DT);
    events.push(...state.events);
    if (player.vault.active) vaultTicks++;
    if (!player.grounded && !player.vault.active) airTicks++;
  };
  const vaults = (): number => events.filter((e) => e.type === 'footstep' && e.kind === 'vault').length;
  const shots = (): number => events.filter((e) => e.type === 'shot').length;
  return { world, state, player, events, tick, vaults, shots, vaultTicks: () => vaultTicks, airTicks: () => airTicks };
}

describe('vaulting with the replica holstered (M92 with M102)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('vaults over a low wall holstered, and the replica stays holstered with the trigger pulled meanwhile', () => {
    const wall = obstacle(0.85);
    const run = setUp([FLOOR, wall]);
    run.tick((k) => (k.holster = true));
    expect(run.player.armament.holstered).toBe(true);
    while (run.player.position.z + 2 > 0.3 + R) run.tick((k) => (k.forward = 1));
    run.tick((k) => {
      k.forward = 1;
      k.jump = true;
    });
    expect(run.player.vault.active).toBe(true);
    // A fresh trigger pull and aim press mid-vault: commands are ignored but the view, so nothing draws.
    run.tick((k) => (k.forward = 1));
    while (run.player.vault.active) {
      run.tick((k) => {
        k.forward = 1;
        k.fire = true;
        k.aim = true;
      });
      expect(run.player.armament.holstered).toBe(true);
      expect(run.player.armament.draw).toBe(0);
    }
    expect(run.vaults()).toBe(1);
    expect(run.shots()).toBe(0);
    expect(run.player.position.z).toBeLessThan(-2.4 - R);
    expect(run.player.armament.holstered).toBe(true);
    run.world.dispose();
  });

  it('a fire press mid-vault does nothing (drawn or not), and the replica in hand fires only after the fire lockout', () => {
    const wall = obstacle(0.85);
    const run = setUp([FLOOR, wall]);
    while (run.player.position.z + 2 > 0.3 + R) run.tick((k) => (k.forward = 1));
    run.tick((k) => (k.jump = true));
    expect(run.player.vault.active).toBe(true);
    // Pressed (not held) once, mid-vault.
    run.tick((k) => (k.fire = true));
    while (run.player.vault.active) run.tick(() => {});
    expect(run.shots()).toBe(0);
    expect(run.player.fireLockout).toBeGreaterThan(0);
    // A new press straight after landing is held off for the lockout, then fires.
    let ticks = 0;
    while (run.shots() === 0 && ticks < 60) {
      run.tick((k) => (k.fire = true));
      ticks++;
    }
    expect(run.shots()).toBeGreaterThan(0);
    expect(ticks * DT).toBeGreaterThanOrEqual(VAULT.fireLockout - 3 * DT);
    run.world.dispose();
  });
});

describe('what never vaults', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('a crouched player pressing Jump at a vaultable wall does not vault', () => {
    const wall = obstacle(0.85);
    const run = setUp([FLOOR, wall]);
    for (let i = 0; i < 20; i++) run.tick((k) => (k.crouch = true));
    expect(run.player.crouchAmount).toBeGreaterThanOrEqual(MOVEMENT.crouchedThreshold);
    for (let i = 0; i < 400; i++) {
      run.tick((k) => {
        k.crouch = true;
        k.forward = 1;
        k.jump = i % 5 === 0;
      });
    }
    expect(run.vaults()).toBe(0);
    expect(run.vaultTicks()).toBe(0);
    expect(run.player.position.z).toBeGreaterThan(-2);
    run.world.dispose();
  });

  it('a 0.5 m kerb is jumped or stepped, never vaulted', () => {
    const kerb = obstacle(0.5, 0.4, 'crate');
    const run = setUp([FLOOR, kerb]);
    for (let i = 0; i < 200; i++) {
      run.tick((k) => {
        k.forward = 1;
        k.jump = run.player.grounded && run.player.position.z + 2 <= 0.4 + R && i % 3 === 0;
      });
    }
    expect(run.vaults()).toBe(0);
    expect(run.vaultTicks()).toBe(0);
    expect(run.airTicks()).toBeGreaterThan(0); // the press was a jump
    run.world.dispose();
  });
});

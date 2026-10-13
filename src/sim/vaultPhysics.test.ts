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
import { type Character, createCharacter } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { eliminate } from './elimination';
import type { GameEvent } from './events';
import { createSimContext, type SimContext, stepSimulation } from './simulation';
import { createGameState, type GameState } from './state';
import { vec3 } from './vec';

/** Vaulting through the whole simulation, against Rapier's character controller (M102). */

const DT = 1 / 60;
const REST = PHYSICS.groundRestGap;
const R = BODY.radius;
const FLOOR: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(24, 0.5, 24) };

/** An obstacle spanning the floor's width, its near face at z = -2 (the player walks to -z from z = 0). */
function obstacle(height: number, depth = 0.4, kind: MapBlock['kind'] = 'wall'): MapBlock {
  return { kind, center: vec3(0, height / 2, -2 - depth / 2), size: vec3(24, height, depth) };
}

interface Run {
  state: GameState;
  ctx: SimContext;
  world: PhysicsWorld;
  player: Character;
  cmd: PlayerCommand;
  events: GameEvent[];
  /** Ticks the player spent vaulting. */
  vaultTicks: number;
  /** The closest the player's capsule came to the obstacle (m, between surfaces). */
  closest: number;
}

function setUp(blocks: MapBlock[]): Run {
  const map: MapData = { name: 'vault', blocks, killY: -20, spawns: [[], []], deadZones: [[], []], lanes: [] };
  const world = new PhysicsWorld(map, BODY, DT);
  const nav = buildNavGrid(map, NAV);
  const deadZones = [[{ position: vec3(-10, 0, 8), yaw: 0 }], [{ position: vec3(10, 0, 8), yaw: 0 }]];
  const ctx = createSimContext({ mover: world, query: world, movement: MOVEMENT, footsteps: FOOTSTEPS, body: BODY, ballistics: BALLISTICS, killY: map.killY, hits: HITS, deadZones, rounds: ROUNDS, nav, navSnap: NAV.snap });
  const state = createGameState(1, 16, ROUNDS);
  const player = createCharacter(0, vec3(0, REST, 0), 0, undefined, 0);
  // Someone on the other team, far off, so the round stays live.
  const other = createCharacter(1, vec3(8, REST, 8), 0, undefined, 1);
  state.characters.push(player, other);
  world.addCharacter(player);
  world.addCharacter(other);
  return { state, ctx, world, player, cmd: createCommand(), events: [], vaultTicks: 0, closest: Infinity };
}

/** Distance between the player's capsule and an axis-aligned block's surfaces (negative: overlapping). */
function capsuleGap(c: Character, b: MapBlock): number {
  const dx = Math.max(Math.abs(c.position.x - b.center.x) - b.size.x / 2, 0);
  const dz = Math.max(Math.abs(c.position.z - b.center.z) - b.size.z / 2, 0);
  const lo = c.position.y + R;
  const hi = c.position.y + BODY.height - R;
  const dy = Math.max(b.center.y - b.size.y / 2 - hi, lo - (b.center.y + b.size.y / 2), 0);
  return Math.hypot(dx, dz, dy) - R;
}

function tick(run: Run, block?: MapBlock): void {
  stepSimulation(run.state, new Map([[0, run.cmd]]), run.ctx, DT);
  run.events.push(...run.state.events);
  if (run.player.vault.active) run.vaultTicks++;
  if (block) run.closest = Math.min(run.closest, capsuleGap(run.player, block));
}

/** Walks (or sprints) at the obstacle, pressing Jump once when the body is `pressAt` from its face. */
function runAt(run: Run, block: MapBlock, pressAt: number, sprint = false, ticks = 150): void {
  run.cmd.forward = 1;
  run.cmd.sprint = sprint;
  let pressed = false;
  for (let i = 0; i < ticks; i++) {
    run.cmd.jump = !pressed && run.player.grounded && run.player.position.z + 2 <= pressAt + R;
    if (run.cmd.jump) pressed = true;
    tick(run, block);
  }
}

const vaults = (run: Run) => run.events.filter((e) => e.type === 'footstep' && e.kind === 'vault').length;

describe('vaulting in the simulation (M102)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('walking up and pressing Jump at a low wall takes the player over it, short and clean, landing on the far side', () => {
    const wall = obstacle(0.85);
    const run = setUp([FLOOR, wall]);
    runAt(run, wall, 0.4);
    expect(vaults(run)).toBe(1);
    expect(run.player.position.z).toBeLessThan(-2.4 - R);
    expect(run.player.grounded).toBe(true);
    expect(run.player.position.y).toBeCloseTo(REST, 3);
    // Committed but short, and never inside the wall (the controller's skin is kept).
    expect(run.vaultTicks * DT).toBeLessThan(0.45);
    expect(run.closest).toBeGreaterThan(0);
    // It came down with a landing heard as one.
    expect(run.events.some((e) => e.type === 'footstep' && e.kind === 'land')).toBe(true);
    run.world.dispose();
  });

  it('sprinting in, the press reaches further and the vault keeps the pace', () => {
    const wall = obstacle(0.9, 0.3, 'crate');
    const run = setUp([FLOOR, wall]);
    runAt(run, wall, VAULT.reach + 0.3, true);
    expect(vaults(run)).toBe(1);
    expect(run.player.position.z).toBeLessThan(-2.3 - R);
    expect(run.closest).toBeGreaterThan(0);
    run.world.dispose();
  });

  it('crouch cover and 1 m railings are never vaulted: Jump is a jump there, and the body stays on this side', () => {
    for (const block of [obstacle(1.2, 0.6, 'barrier'), obstacle(1.0, 0.1, 'barrier')]) {
      const run = setUp([FLOOR, block]);
      runAt(run, block, 0.2);
      // Then keep pushing and pressing Jump.
      for (let i = 0; i < 240; i++) {
        run.cmd.jump = i % 7 === 0;
        tick(run, block);
      }
      expect(vaults(run)).toBe(0);
      expect(run.player.position.z).toBeGreaterThan(-2);
      run.world.dispose();
    }
  });

  it('carries the replica through the vault: no shots until a moment after it', () => {
    const wall = obstacle(0.85);
    const run = setUp([FLOOR, wall]);
    run.cmd.forward = 1;
    while (run.player.position.z + 2 > 0.3 + R) tick(run, wall);
    run.cmd.jump = true;
    tick(run, wall);
    run.cmd.jump = false;
    expect(run.player.vault.active).toBe(true);
    run.cmd.fire = true;
    let shotsWhileVaulting = 0;
    while (run.player.vault.active) {
      tick(run, wall);
      shotsWhileVaulting += run.state.events.filter((e) => e.type === 'shot').length;
    }
    expect(shotsWhileVaulting).toBe(0);
    // The trigger still held: it fires once the lockout ends.
    let ticksToShot = 0;
    while (!run.state.events.some((e) => e.type === 'shot') && ticksToShot < 60) {
      tick(run, wall);
      ticksToShot++;
    }
    expect(ticksToShot * DT).toBeGreaterThanOrEqual(VAULT.fireLockout - 2 * DT);
    expect(ticksToShot * DT).toBeLessThan(VAULT.fireLockout + 0.1);
    run.world.dispose();
  });

  it('a player hit mid-vault still comes down on the far side, and starts no other vault', () => {
    const wall = obstacle(0.85);
    const run = setUp([FLOOR, wall]);
    run.cmd.forward = 1;
    while (run.player.position.z + 2 > 0.3 + R) tick(run, wall);
    run.cmd.jump = true;
    tick(run, wall);
    for (let i = 0; i < 6; i++) tick(run, wall);
    expect(run.player.vault.active).toBe(true);
    eliminate(run.player, 1, run.state.characters, run.ctx.targets.elimination);
    for (let i = 0; i < 60; i++) tick(run, wall);
    expect(run.player.vault.active).toBe(false);
    expect(run.player.position.z).toBeLessThan(-2.4);
    expect(run.player.position.y).toBeLessThan(REST + 0.05);
    expect(run.closest).toBeGreaterThan(0);
    expect(vaults(run)).toBe(1);
    run.world.dispose();
  });

  it('a wall the plan cannot see stops the vault, and the body drops back clean', () => {
    const wall = obstacle(0.85);
    const run = setUp([FLOOR, wall]);
    run.cmd.forward = 1;
    while (run.player.position.z + 2 > 0.3 + R) tick(run, wall);
    run.cmd.jump = true;
    tick(run, wall);
    run.cmd.jump = false;
    expect(run.player.vault.active).toBe(true);
    // Hold the body back as a hidden obstacle would: nothing moves it for the rest of the vault.
    const mover = run.ctx.mover;
    run.ctx.mover = {
      move(_c, _d, out) {
        out.x = 0;
        out.y = 0;
        out.z = 0;
        return false;
      },
      probeGround: (c, maxDrop) => mover.probeGround(c, maxDrop),
    };
    let ticks = 0;
    while (run.player.vault.active && ticks < 30) {
      tick(run, wall);
      ticks++;
    }
    run.ctx.mover = mover;
    expect(run.player.vault.active).toBe(false);
    expect(ticks).toBeLessThan(10);
    for (let i = 0; i < 60; i++) tick(run, wall);
    expect(run.player.grounded).toBe(true);
    expect(run.player.position.z).toBeGreaterThan(-2);
    run.world.dispose();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { BODY, MOVEMENT } from '../config/movement';
import { PHYSICS } from '../config/physics';
import type { MapData } from '../map/mapTypes';
import { TEST_YARD, TEST_YARD_HALF_SIZE } from '../map/testYard';
import { type Character, createCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { createMovementScratch, stepMovement } from '../sim/movement';
import { vec3 } from '../sim/vec';
import { initPhysics, PhysicsWorld } from './physicsWorld';

const DT = 1 / 60;
const scratch = createMovementScratch();
const JUMP_APEX = (MOVEMENT.jumpSpeed * MOVEMENT.jumpSpeed) / (2 * MOVEMENT.gravity);

const MAP: MapData = {
  name: 'physics-test',
  blocks: [
    { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(20, 0.5, 20) },
    { kind: 'wall', center: vec3(0, 1.5, -5), size: vec3(20, 3, 0.4) },
    // Low ledge at the walkable limit.
    {
      kind: 'crate',
      center: vec3(3, PHYSICS.maxWalkableLedge / 2, 0),
      size: vec3(1.2, PHYSICS.maxWalkableLedge, 1.2),
    },
    { kind: 'crate', center: vec3(-4, 0.6, 0), size: vec3(1.2, 1.2, 1.2) },
  ],
  killY: -10,
  spawns: [[], []],
};

function simulate(world: PhysicsWorld, c: Character, cmd: PlayerCommand, ticks: number, onTick?: () => void): void {
  for (let i = 0; i < ticks; i++) {
    stepMovement(c, cmd, MOVEMENT, DT, world, scratch);
    onTick?.();
  }
}

/** Pushes into an obstacle, then hops repeatedly while still pushing. Returns each hop's peak height. */
function hopsWhilePushing(world: PhysicsWorld, c: Character, yaw: number): number[] {
  const cmd = createCommand();
  cmd.yaw = yaw;
  cmd.forward = 1;
  simulate(world, c, cmd, 90); // reach the obstacle and settle
  const peaks: number[] = [];
  for (let hop = 0; hop < 5; hop++) {
    const floorY = c.position.y;
    let peak = floorY;
    cmd.jump = true;
    simulate(world, c, cmd, 45, () => {
      cmd.jump = false;
      peak = Math.max(peak, c.position.y);
    });
    peaks.push(peak - floorY);
  }
  return peaks;
}

describe('PhysicsWorld (Rapier)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('lands a falling character on the floor and keeps it grounded', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const c = createCharacter(0, vec3(0, 2, 0), 0);
    world.addCharacter(c);
    simulate(world, c, createCommand(), 120);
    expect(c.grounded).toBe(true);
    expect(c.position.y).toBeGreaterThan(-0.01);
    expect(c.position.y).toBeLessThan(0.1);
    world.dispose();
  });

  it('blocks walking through a wall', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const c = createCharacter(0, vec3(0, 0.05, 0), 0);
    world.addCharacter(c);
    const cmd = createCommand();
    cmd.forward = 1;
    simulate(world, c, cmd, 180);
    // Wall's near face is at z = -4.8; the capsule radius keeps the centre in front of it.
    expect(c.position.z).toBeGreaterThan(-4.8 + BODY.radius - 0.05);
    expect(c.position.z).toBeLessThan(-4.3);
    world.dispose();
  });

  it('walks onto a ledge of maxWalkableLedge height without jumping', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const c = createCharacter(0, vec3(0, 0.05, 0), -Math.PI / 2); // facing +X
    world.addCharacter(c);
    const cmd = createCommand();
    cmd.yaw = c.yaw;
    cmd.forward = 1;
    let maxY = 0;
    simulate(world, c, cmd, 90, () => (maxY = Math.max(maxY, c.position.y)));
    expect(c.position.x).toBeGreaterThan(3);
    expect(maxY).toBeGreaterThan(PHYSICS.maxWalkableLedge - 0.02);
    world.dispose();
  });

  it('jumps to full height while pushing into a wall or a crate', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const cases: [Character, number][] = [
      [createCharacter(0, vec3(0, 0.05, 0), 0), 0], // facing -Z into the wall
      [createCharacter(1, vec3(-1, 0.05, 0), Math.PI / 2), Math.PI / 2], // facing -X into the crate
    ];
    for (const [c, yaw] of cases) {
      world.addCharacter(c);
      for (const peak of hopsWhilePushing(world, c, yaw)) expect(peak).toBeGreaterThan(JUMP_APEX * 0.85);
    }
    world.dispose();
  });

  it('cannot climb a crate or stick to its side by spamming jump against it', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const c = createCharacter(0, vec3(-1, 0.05, 0), Math.PI / 2); // facing -X into the 1.2 m crate
    world.addCharacter(c);
    const cmd = createCommand();
    cmd.yaw = Math.PI / 2;
    cmd.forward = 1;
    let maxY = 0;
    let airborneGroundedTicks = 0;
    for (let i = 0; i < 400; i++) {
      cmd.jump = i % 5 === 0;
      stepMovement(c, cmd, MOVEMENT, DT, world, scratch);
      maxY = Math.max(maxY, c.position.y);
      if (c.grounded && c.position.y > 0.1) airborneGroundedTicks++;
    }
    expect(maxY).toBeLessThan(JUMP_APEX + 0.1);
    expect(airborneGroundedTicks).toBe(0);
    world.dispose();
  });

  /**
   * Walks back and forth along both diagonals through `centre` (the block's x = ±z planes, where Rapier
   * cuboids used to swallow the capsule) and returns the lowest height reached relative to `surfaceY`.
   */
  function lowestAlongDiagonals(map: MapData, centre: { x: number; z: number }, surfaceY: number): number {
    const world = new PhysicsWorld(map, BODY, DT);
    const yaws = [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    let lowest = Infinity;
    yaws.forEach((yaw, id) => {
      const c = createCharacter(id, vec3(centre.x, surfaceY, centre.z), yaw);
      world.addCharacter(c);
      const cmd = createCommand();
      cmd.yaw = yaw;
      for (let leg = 0; leg < 10; leg++) {
        cmd.forward = leg % 2 === 0 ? 1 : -1;
        simulate(world, c, cmd, 60, () => (lowest = Math.min(lowest, c.position.y - surfaceY)));
      }
    });
    world.dispose();
    return lowest;
  }

  it('never sinks into blocks along their diagonal planes', () => {
    // Test Yard floor, walked from its centre and from off-centre points on its diagonals.
    for (const p of [
      { x: 0, z: 0 },
      { x: -5, z: 5 },
      { x: 3, z: -3 },
    ]) {
      expect(lowestAlongDiagonals(TEST_YARD, p, 0)).toBeGreaterThan(-0.02);
    }

    // Thick slab floor, off-centre in the world.
    const slab: MapData = {
      name: 'slab',
      blocks: [{ kind: 'floor', center: vec3(3, -1, -2), size: vec3(30, 2, 30) }],
      killY: -50,
      spawns: [[], []],
    };
    expect(lowestAlongDiagonals(slab, { x: 3, z: -2 }, 0)).toBeGreaterThan(-0.02);

    // Standing on top of a wide, low crate.
    const ledge = PHYSICS.maxWalkableLedge;
    const lowCrate: MapData = {
      name: 'low-crate',
      blocks: [
        { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 40) },
        { kind: 'crate', center: vec3(2, ledge / 2, 1), size: vec3(12, ledge, 12) },
      ],
      killY: -50,
      spawns: [[], []],
    };
    expect(lowestAlongDiagonals(lowCrate, { x: 2, z: 1 }, ledge)).toBeGreaterThan(-0.02);
  });

  it('keeps the player inside the Test Yard whichever way they run', () => {
    const world = new PhysicsWorld(TEST_YARD, BODY, DT);
    const half = TEST_YARD_HALF_SIZE;
    for (let i = 0; i < 8; i++) {
      const yaw = (i / 8) * Math.PI * 2;
      const c = createCharacter(i, vec3(0, 0, 4), yaw);
      world.addCharacter(c);
      const cmd = createCommand();
      cmd.yaw = yaw;
      cmd.forward = 1;
      cmd.sprint = true;
      simulate(world, c, cmd, 600, () => (cmd.jump = !cmd.jump));
      expect(Math.abs(c.position.x)).toBeLessThan(half);
      expect(Math.abs(c.position.z)).toBeLessThan(half);
      expect(c.position.y).toBeGreaterThan(-0.05);
    }
    world.dispose();
  });
});

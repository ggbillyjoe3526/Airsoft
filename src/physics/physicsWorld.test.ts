import { beforeAll, describe, expect, it } from 'vitest';
import { BODY, MOVEMENT } from '../config/movement';
import { PHYSICS } from '../config/physics';
import type { MapBlock, MapData } from '../map/mapTypes';
import { DEPOT } from '../map/depot';
import { TEST_YARD, TEST_YARD_HALF_SIZE } from '../map/testYard';
import { type Character, createCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { createMovementScratch, stepMovement } from '../sim/movement';
import { vec3 } from '../sim/vec';
import { initPhysics, PhysicsWorld } from './physicsWorld';

const DT = 1 / 60;
const scratch = createMovementScratch();
const JUMP_APEX = (MOVEMENT.jumpSpeed * MOVEMENT.jumpSpeed) / (2 * MOVEMENT.gravity);
/** Height a standing character rests at above the surface. */
const REST = PHYSICS.groundRestGap;

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
  deadZones: [[], []],
  lanes: [],
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

  // Smoke test: the launch itself is chaotic and hard to reproduce exactly in Rapier; the deterministic
  // guard is the 'depenetration push' unit test in movement.test.ts.
  it('never launches upward out of a crate-against-wall wedge (Depot nook)', () => {
    // Where crate(-12.4, -5.9) nearly meets the office north wall. Rapier's push out of the wedge once
    // became upward velocity and flung players over the 3 m office wall.
    const world = new PhysicsWorld(DEPOT, BODY, DT);
    let id = 0;
    let highest = 0;
    const run = (x: number, z: number, yaw: number, ticks: number, jumpEvery: number): void => {
      const c = createCharacter(id++, vec3(x, REST, z), yaw);
      world.addCharacter(c);
      const cmd = createCommand();
      cmd.yaw = yaw;
      cmd.forward = 1;
      cmd.sprint = true;
      for (let i = 0; i < ticks; i++) {
        cmd.jump = i % jumpEvery === 0;
        stepMovement(c, cmd, MOVEMENT, DT, world, scratch);
        highest = Math.max(highest, c.position.y);
      }
    };
    run(-7.08, -1.8, 0.5, 400, 20); // the reported repro
    // Sprint-hop into the nook from all around it (1 m out, jumping every 20 ticks).
    for (let a = 0; a < 60; a++) {
      const yaw = (a / 60) * Math.PI * 2;
      run(-11.2 + Math.sin(yaw), -5.9 + Math.cos(yaw), yaw, 90, 20);
    }
    // A normal hop peaks at REST + JUMP_APEX (~0.72 m); unclamped, the wedge pushed players ~0.84 m.
    expect(highest).toBeLessThan(REST + JUMP_APEX + 0.05);
    world.dispose();
  });

  it('never stands on, hangs on, or hops over the edge of crouch-height cover', () => {
    const floor: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 40) };
    // Cover spans the whole floor so the only way past is over it.
    const barrier: MapBlock = { kind: 'barrier', center: vec3(0, 0.5, 0), size: vec3(40, 1, 0.6) };
    // A window: 1 m sill, lintel from 2 m, solid wall either side.
    const window: MapBlock[] = [
      { kind: 'wall', center: vec3(0, 0.5, 0), size: vec3(1.5, 1, 0.4) },
      { kind: 'wall', center: vec3(0, 2.5, 0), size: vec3(1.5, 1, 0.4) },
      { kind: 'wall', center: vec3(-10.375, 1.5, 0), size: vec3(19.25, 3, 0.4) },
      { kind: 'wall', center: vec3(10.375, 1.5, 0), size: vec3(19.25, 3, 0.4) },
    ];
    const freeJumpAirTicks = Math.ceil((2 * MOVEMENT.jumpSpeed) / MOVEMENT.gravity / DT) + 2;
    for (const cover of [[barrier], window]) {
      for (const yaw of [0, 0.5]) {
        const world = new PhysicsWorld({ name: 'cover', blocks: [floor, ...cover], killY: -50, spawns: [[], []], deadZones: [[], []], lanes: [] }, BODY, DT);
        const c = createCharacter(0, vec3(0, REST, 3), yaw); // facing the cover
        world.addCharacter(c);
        const cmd = createCommand();
        cmd.yaw = yaw;
        cmd.forward = 1;
        // One jump into the cover: airborne no longer than a free jump (no hanging on the edge).
        let airborne = 0;
        simulate(world, c, cmd, 120, () => {
          cmd.jump = false;
          if (!c.grounded) airborne++;
        });
        cmd.jump = true;
        airborne = 0;
        simulate(world, c, cmd, 90, () => {
          cmd.jump = false;
          if (!c.grounded) airborne++;
        });
        expect(airborne).toBeLessThanOrEqual(freeJumpAirTicks);
        // Then spam jump: never grounded above the floor, never across, every landing at rest height.
        for (let i = 0; i < 300; i++) {
          cmd.jump = i % 5 === 0;
          stepMovement(c, cmd, MOVEMENT, DT, world, scratch);
          if (c.grounded) expect(c.position.y).toBeCloseTo(REST, 3);
        }
        expect(c.position.z).toBeGreaterThan(0);
        world.dispose();
      }
    }
  });

  /** How far from REST a walking character's feet may drift (sinks and bumps both fail). */
  const REST_TOLERANCE = 0.005;

  /**
   * Walks back and forth along both diagonals through `centre` (the block's x = ±z planes, where Rapier
   * cuboids used to swallow the capsule and triangle seams used to bump it) and returns the lowest and
   * highest feet height reached relative to `surfaceY`, after settling.
   */
  function heightRangeAlongDiagonals(
    map: MapData,
    centre: { x: number; z: number },
    surfaceY: number,
  ): { min: number; max: number } {
    const world = new PhysicsWorld(map, BODY, DT);
    const yaws = [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4, Math.PI / 4 + 0.01];
    const range = { min: Infinity, max: -Infinity };
    yaws.forEach((yaw, id) => {
      const c = createCharacter(id, vec3(centre.x, surfaceY + REST, centre.z), yaw);
      world.addCharacter(c);
      const cmd = createCommand();
      cmd.yaw = yaw;
      simulate(world, c, cmd, 10); // settle
      for (let leg = 0; leg < 10; leg++) {
        cmd.forward = leg % 2 === 0 ? 1 : -1;
        simulate(world, c, cmd, 60, () => {
          range.min = Math.min(range.min, c.position.y - surfaceY);
          range.max = Math.max(range.max, c.position.y - surfaceY);
        });
      }
    });
    world.dispose();
    return range;
  }

  function expectAtRest(range: { min: number; max: number }): void {
    expect(range.min).toBeGreaterThan(REST - REST_TOLERANCE);
    expect(range.max).toBeLessThan(REST + REST_TOLERANCE);
  }

  it('neither sinks nor bumps along block diagonals', () => {
    // Test Yard floor, walked from its centre and from off-centre points on its diagonals.
    for (const p of [
      { x: 0, z: 0 },
      { x: -5, z: 5 },
      { x: 3, z: -3 },
    ]) {
      expectAtRest(heightRangeAlongDiagonals(TEST_YARD, p, 0));
    }

    // Thick slab floor, off-centre in the world.
    const slab: MapData = {
      name: 'slab',
      blocks: [{ kind: 'floor', center: vec3(3, -1, -2), size: vec3(30, 2, 30) }],
      killY: -50,
      spawns: [[], []],
      deadZones: [[], []],
      lanes: [],
    };
    expectAtRest(heightRangeAlongDiagonals(slab, { x: 3, z: -2 }, 0));

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
      deadZones: [[], []],
      lanes: [],
    };
    expectAtRest(heightRangeAlongDiagonals(lowCrate, { x: 2, z: 1 }, ledge));
  });

  it('walks and sprints at a steady speed on open floor (no stalls)', () => {
    const open: MapData = {
      name: 'open',
      blocks: [{ kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(200, 0.5, 200) }],
      killY: -50,
      spawns: [[], []],
      deadZones: [[], []],
      lanes: [],
    };
    const world = new PhysicsWorld(open, BODY, DT);
    const runs = 24;
    for (let i = 0; i < runs; i++) {
      // Headings spread evenly around the circle, plus an irrational offset so none is axis-aligned.
      const yaw = (i / runs) * Math.PI * 2 + 0.123;
      const c = createCharacter(i, vec3(0, REST, 0), yaw);
      world.addCharacter(c);
      const cmd = createCommand();
      cmd.yaw = yaw;
      cmd.forward = 1;
      cmd.sprint = i % 2 === 0;
      const topSpeed = cmd.sprint ? MOVEMENT.sprintSpeed : MOVEMENT.runSpeed;
      simulate(world, c, cmd, 20); // accelerate
      let slowest = Infinity;
      simulate(world, c, cmd, 240, () => {
        slowest = Math.min(slowest, Math.hypot(c.velocity.x, c.velocity.z));
      });
      expect(slowest).toBeGreaterThan(topSpeed * 0.99);
      expect(c.grounded).toBe(true);
    }
    world.dispose();
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

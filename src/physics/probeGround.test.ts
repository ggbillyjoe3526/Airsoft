import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BODY, MOVEMENT } from '../config/movement';
import type { MapData } from '../map/mapTypes';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { createMovementScratch, stepMovement } from '../sim/movement';
import { vec3 } from '../sim/vec';
import { initPhysics, PhysicsWorld } from './physicsWorld';

const DT = 1 / 60;
const DROP = MOVEMENT.groundSettleDistance;

const MAP: MapData = {
  name: 'probe-test',
  blocks: [{ kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(20, 0.5, 20) }],
  killY: -10,
  spawns: [[], []],
  deadZones: [[], []],
  lanes: [],
};

/** The private cast probeGround falls back on, spied. */
function spyCast(world: PhysicsWorld) {
  return vi.spyOn(world as unknown as { castGround(...a: unknown[]): number }, 'castGround');
}

describe('PhysicsWorld.probeGround rest memo (M77 acceptance 2, SIM-06)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  /** A character set down 2 cm above the floor and settled by one probe, as the mover does. */
  function settled(world: PhysicsWorld) {
    const c = createCharacter(0, vec3(0, 0.02, 0), 0);
    world.addCharacter(c);
    const dy = world.probeGround(c, DROP);
    expect(Number.isNaN(dy)).toBe(false);
    c.position.y += dy;
    return c;
  }

  it('answers 0 with no cast for a character that has not moved since its last probe', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const c = settled(world);
    const cast = spyCast(world);
    expect(world.probeGround(c, DROP)).toBe(0);
    expect(world.probeGround(c, DROP)).toBe(0);
    expect(cast).not.toHaveBeenCalled();
    world.dispose();
  });

  it('casts again after any move, however small, and after a teleport', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const c = settled(world);
    const cast = spyCast(world);
    for (const axis of ['x', 'y', 'z'] as const) {
      c.position[axis] += 1e-9; // far below a float32's resolution at a metre, but a different double
      cast.mockClear();
      world.probeGround(c, DROP);
      expect(cast, `moved ${axis}`).toHaveBeenCalledTimes(1);
    }
    cast.mockClear();
    c.position.x = 7;
    c.position.z = -6;
    world.probeGround(c, DROP);
    expect(cast, 'teleport').toHaveBeenCalledTimes(1);
    world.dispose();
  });

  it('keeps no memo from a probe that found no ground (NaN): the next probe casts again', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const c = createCharacter(0, vec3(0, 5, 0), 0); // far above the floor, past the drop
    world.addCharacter(c);
    const cast = spyCast(world);
    expect(world.probeGround(c, DROP)).toBeNaN();
    expect(world.probeGround(c, DROP)).toBeNaN();
    expect(cast).toHaveBeenCalledTimes(2);
    world.dispose();
  });

  it('keeps a memo per character', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const a = settled(world);
    const b = createCharacter(1, vec3(3, 0.02, 0), 0);
    world.addCharacter(b);
    const cast = spyCast(world);
    world.probeGround(b, DROP);
    expect(cast).toHaveBeenCalledTimes(1);
    expect(world.probeGround(a, DROP)).toBe(0);
    expect(cast).toHaveBeenCalledTimes(1);
    world.dispose();
  });

  it('ends a walk-then-stand run within 1 mm of the same run that casts on every probe', () => {
    const run = (memo: boolean): Array<[number, number, number]> => {
      const world = new PhysicsWorld(MAP, BODY, DT);
      const c = createCharacter(0, vec3(0, 0.3, 0), 0);
      world.addCharacter(c);
      const scratch = createMovementScratch();
      const cmd = createCommand();
      const trace: Array<[number, number, number]> = [];
      for (let t = 0; t < 360; t++) {
        cmd.forward = t >= 30 && t < 150 ? 1 : 0; // fall, stand, walk, stand
        cmd.right = t >= 60 && t < 100 ? 1 : 0;
        stepMovement(c, cmd, MOVEMENT, DT, world, scratch);
        if (!memo) (world as unknown as { restingAt: Map<number, unknown> }).restingAt.clear();
        if (t % 30 === 29) trace.push([c.position.x, c.position.y, c.position.z]);
      }
      world.dispose();
      return trace;
    };
    const withMemo = run(true);
    const always = run(false);
    expect(withMemo.length).toBe(always.length);
    withMemo.forEach((p, i) => {
      for (let k = 0; k < 3; k++) expect(Math.abs(p[k]! - always[i]![k]!), `sample ${i} axis ${k}`).toBeLessThan(1e-3);
    });
    expect(Math.abs(withMemo.at(-1)![0] - withMemo[0]![0])).toBeGreaterThan(1); // it did walk
  });

  it('skips the cast on most standing ticks of a real movement run (the memo is used)', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    const c = createCharacter(0, vec3(0, 0.3, 0), 0);
    world.addCharacter(c);
    const scratch = createMovementScratch();
    const cmd = createCommand();
    for (let t = 0; t < 120; t++) stepMovement(c, cmd, MOVEMENT, DT, world, scratch);
    const cast = spyCast(world);
    for (let t = 0; t < 60; t++) stepMovement(c, cmd, MOVEMENT, DT, world, scratch);
    expect(cast.mock.calls.length).toBeLessThan(5);
    world.dispose();
  });

  it('dispose clears the memo', () => {
    const world = new PhysicsWorld(MAP, BODY, DT);
    settled(world);
    const memo = (world as unknown as { restingAt: Map<number, unknown> }).restingAt;
    expect(memo.size).toBe(1);
    world.dispose();
    expect(memo.size).toBe(0);
  });
});

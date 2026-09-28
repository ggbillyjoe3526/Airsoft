import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import type { WorldQuery } from './armament';
import { createBBPool, spawnBB } from './ballistics';
import { stepBBs } from './bbs';
import type { GameEvent } from './events';
import { vec3 } from './vec';

const DT = 1 / 60;
const KILL_Y = -10;

/** A wall filling the plane z = wallZ (BBs travel towards -Z). */
function wallAt(wallZ: number): WorldQuery {
  return {
    raycastStatic(o, d, max) {
      if (d.z >= 0) return -1;
      const t = (wallZ - o.z) / d.z;
      return t >= 0 && t <= max ? t : -1;
    },
  };
}

describe('stepBBs', () => {
  it('stops a BB exactly where its path meets a wall and reports the impact', () => {
    const pool = createBBPool(4);
    const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0.12);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && bb.active; i++) stepBBs(pool, BALLISTICS, wallAt(-12), KILL_Y, events, DT);
    expect(bb.active).toBe(false);
    expect(bb.position.z).toBeCloseTo(-12, 6);
    const impacts = events.filter((e) => e.type === 'bbImpact');
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.type === 'bbImpact' && impacts[0]!.position.z).toBeCloseTo(-12, 6);
  });

  it('does not tunnel through thin geometry at full speed', () => {
    // A wall 5 cm in front of where the BB will be after one tick: the segment test must still catch it.
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 88, 0);
    const events: GameEvent[] = [];
    stepBBs(pool, BALLISTICS, wallAt(-1.4), KILL_Y, events, DT);
    expect(bb.active).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('removes BBs that fly too long or fall out of the world, silently', () => {
    const pool = createBBPool(2);
    const up = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 1, 0), 40, 0);
    const events: GameEvent[] = [];
    const ticks = Math.ceil(BALLISTICS.maxLifetime / DT) + 2;
    for (let i = 0; i < ticks; i++) stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, events, DT);
    expect(up.active).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('records the previous position for the collision segment and interpolation', () => {
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0.12);
    stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, [], DT);
    const before = { ...bb.position };
    stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, [], DT);
    expect(bb.prevPosition).toEqual(before);
  });
});

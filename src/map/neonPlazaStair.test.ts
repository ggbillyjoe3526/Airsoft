import { beforeAll, describe, expect, it } from 'vitest';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { buildNavGrid, type NavGrid, nodeAt, stepNode } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { createCommand } from '../sim/commands';
import { createMovementScratch, stepMovement } from '../sim/movement';
import { vec3 } from '../sim/vec';
import { NEON_HEIGHTS } from './neonHeights';

/**
 * Neon Heights' Plaza stair (BP5, audit SIM-04): its landing overhung the stair's top by 0.6 m, so walking up met the
 * slab's edge 0.3 m overhead and stopped (you had to jump), running down dropped for 0.4 s, and the bots' nav linked
 * the stair neither way. The landing now starts where the stair ends. World coordinates: the stair climbs from z 12
 * (the plaza) to z 6 (the landing, 3 m up), between x -14.6 and -13.2.
 */
const DT = 1 / 60;
const FOOT = vec3(-13.9, PHYSICS.groundRestGap, 13);
const LANDING = vec3(-13.9, 3, 5);

/** The nodes reached from `from` without leaving the stair and its landing (no way round by the stairwell). */
function reachOnStair(g: NavGrid, from: typeof FOOT): Uint8Array {
  const seen = new Uint8Array(g.walkable.length);
  const start = nodeAt(g, from.x, from.y, from.z);
  seen[start] = 1;
  const open = [start];
  const x = (k: number) => g.minX + ((g.nodeCell[k]! % g.cols) + 0.5) * g.cell;
  const z = (k: number) => g.minZ + (Math.floor(g.nodeCell[k]! / g.cols) + 0.5) * g.cell;
  while (open.length > 0) {
    const k = open.pop()!;
    const c = g.nodeCell[k]!;
    const i = c % g.cols;
    const j = (c - i) / g.cols;
    for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]] as const) {
      if (ni < 0 || nj < 0 || ni >= g.cols || nj >= g.rows) continue;
      const n = stepNode(g, k, nj * g.cols + ni);
      if (n < 0 || g.walkable[n] !== 1 || seen[n] === 1) continue;
      if (x(n) < -14.6 || x(n) > -12 || z(n) < 3.6 || z(n) > 13.5) continue;
      seen[n] = 1;
      open.push(n);
    }
  }
  return seen;
}

describe("Neon Heights' Plaza stair (BP5)", () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('walks, runs and sprints up to the landing, and runs down it without leaving the ground', () => {
    const world = new PhysicsWorld(NEON_HEIGHTS, BODY, DT);
    const scratch = createMovementScratch();
    let id = 0;
    for (const pace of ['walk', 'run', 'sprint'] as const) {
      for (const dir of ['up', 'down'] as const) {
        const c = createCharacter(id++, dir === 'up' ? vec3(FOOT.x, FOOT.y, FOOT.z) : vec3(LANDING.x, LANDING.y + PHYSICS.groundRestGap, LANDING.z), 0);
        // Yaw 0 faces -z (up the stair), π faces +z (down it).
        c.yaw = dir === 'up' ? 0 : Math.PI;
        world.addCharacter(c);
        const cmd = createCommand();
        cmd.yaw = c.yaw;
        cmd.forward = 1;
        cmd.walk = pace === 'walk';
        cmd.sprint = pace === 'sprint';
        let airborne = 0;
        for (let t = 0; t < 600 && (dir === 'up' ? c.position.z > LANDING.z : c.position.z < FOOT.z); t++) {
          stepMovement(c, cmd, MOVEMENT, DT, world, scratch);
          if (!c.grounded) airborne++;
        }
        const label = `${pace} ${dir}`;
        if (dir === 'up') {
          expect(c.position.z, label).toBeLessThanOrEqual(LANDING.z);
          expect(c.position.y, label).toBeGreaterThan(LANDING.y - 0.1);
        } else {
          expect(c.position.z, label).toBeGreaterThanOrEqual(FOOT.z);
          expect(c.position.y, label).toBeLessThan(0.1);
        }
        expect(airborne, label).toBe(0);
      }
    }
    world.dispose();
  });

  it("gives the bots' nav a way up and down it, on the stair itself", () => {
    const g = buildNavGrid(NEON_HEIGHTS, NAV);
    const foot = nodeAt(g, FOOT.x, 0, FOOT.z);
    const landing = nodeAt(g, LANDING.x, LANDING.y, LANDING.z);
    expect(g.floorY[landing]).toBeCloseTo(LANDING.y, 1);
    expect(reachOnStair(g, FOOT)[landing]).toBe(1);
    expect(reachOnStair(g, LANDING)[foot]).toBe(1);
  });
});

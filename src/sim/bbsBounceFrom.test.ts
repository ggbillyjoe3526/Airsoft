import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import type { WorldQuery } from './armament';
import { createBBPool, spawnBB } from './ballistics';
import { stepBBs } from './bbs';
import type { GameEvent } from './events';
import { vec3 } from './vec';

/**
 * KI2: an impact after a bounce says where that tick's path began (`from`), so its grit flies back off the surface it
 * came from, not towards a shooter who may be anywhere by then. Two concrete walls across the -Z line, at z = -10
 * (facing +Z) and z = 0 (facing -Z); the game's BBs with no gravity in thin air.
 */
const FLAT = { ...BALLISTICS, gravity: 0, air: { temperature: 20, pressure: 1 } };
const corridor: WorldQuery = {
  raycastStatic: () => -1,
  raycastSurface: (origin, dir, maxDist, out) => {
    const wallZ = dir.z < 0 ? -10 : 0;
    const t = (wallZ - origin.z) / dir.z;
    if (!(t >= 0) || t > maxDist) return -1;
    out.normal.x = 0;
    out.normal.y = 0;
    out.normal.z = dir.z < 0 ? 1 : -1;
    out.material = 'concrete';
    return t;
  },
};

describe('where a bounced BB came from (KI2)', () => {
  it('leaves `from` off before a bounce, and gives the path start of the tick it lands after one', () => {
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 1, vec3(0, 1.3, -1), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    for (let i = 0; i < 120 && bb.active; i++) stepBBs(pool, FLAT, corridor, -10, events, 1 / 60);
    const impacts = events.filter((e) => e.type === 'bbImpact');
    expect(impacts.length).toBeGreaterThanOrEqual(2);
    const [first, second] = impacts;
    expect(first!.from).toBeUndefined();
    expect(first!.position.z).toBeCloseTo(-10, 6);
    // Back off the far wall towards z = 0: it came from the -10 side, behind the shooter's line of fire.
    expect(second!.position.z).toBeCloseTo(0, 6);
    expect(second!.from).toBeDefined();
    expect(second!.from!.z).toBeGreaterThan(-10);
    expect(second!.from!.z).toBeLessThan(second!.position.z);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import type { Bush } from './foliage';
import type { MapData } from './mapTypes';
import { terrainHeightAt } from './terrain';
import { WOODLAND, WOODLAND_LAYOUT } from './woodland';

const BUSHES = WOODLAND.foliage ?? [];

/** Distance in plan from (x, z) to the segment a–b. */
function segmentDistance(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
}

describe("Woodland's bushes (M33e)", () => {
  it('has bushes across the field, each inside the fence', () => {
    expect(BUSHES.length).toBeGreaterThanOrEqual(50);
    for (const b of BUSHES) {
      expect(Math.abs(b.x) + b.radius).toBeLessThan(WOODLAND_LAYOUT.halfX);
      expect(Math.abs(b.z) + b.radius).toBeLessThan(WOODLAND_LAYOUT.halfZ);
    }
  });

  it('stands each bush on the ground: its foot no higher than the ground under it, and not buried', () => {
    const t = WOODLAND.terrain!;
    for (const b of BUSHES) {
      const g = terrainHeightAt(t, b.x, b.z)!;
      expect(b.y).toBeLessThanOrEqual(g);
      expect(b.y).toBeGreaterThan(g - 1);
    }
  });

  it('keeps bushes off the lanes, out of every block and apart from each other', () => {
    for (const b of BUSHES) {
      for (const lane of WOODLAND.lanes) {
        for (let i = 1; i < lane.length; i++) expect(segmentDistance(b.x, b.z, lane[i - 1]!, lane[i]!)).toBeGreaterThan(b.radius);
      }
      for (const k of WOODLAND.blocks) {
        const dx = Math.max(0, Math.abs(b.x - k.center.x) - k.size.x / 2);
        const dz = Math.max(0, Math.abs(b.z - k.center.z) - k.size.z / 2);
        expect(Math.hypot(dx, dz)).toBeGreaterThan(b.radius);
      }
      for (const o of BUSHES) if (o !== b) expect(Math.hypot(o.x - b.x, o.z - b.z)).toBeGreaterThan(o.radius + b.radius);
    }
  });
});

describe('bushes stop nothing but sight (M33e)', () => {
  const bush: Bush = { x: 0, y: 0, z: 0, radius: 1.2, height: 1.6 };
  const field: MapData = { ...OPEN_FIELD, foliage: [bush] };

  beforeAll(async () => {
    await initPhysics();
  });

  it('lets a BB or a shot ray through: the level has no surface in a bush', () => {
    const physics = new PhysicsWorld(field, BODY, 1 / 60);
    expect(physics.raycastStatic(vec3(-5, 0.8, 0), vec3(1, 0, 0), 10)).toBe(-1);
  });

  it('leaves the ground under a bush walkable for bots', () => {
    const nav = buildNavGrid(field, NAV);
    expect(isWalkableAt(nav, 0, 0)).toBe(true);
  });
});

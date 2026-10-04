import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import type { SurfaceHit } from './armament';
import { createBBPool, spawnBB } from './ballistics';
import { ricochet } from './ricochet';
import { createRng } from './rng';
import { vec3 } from './vec';

const CFG = BALLISTICS.ricochet;
const wall = (material: SurfaceHit['material']): SurfaceHit => ({ normal: vec3(0, 0, 1), material });

/** A BB flying at `speed` m/s in direction (x, 0, z) (normalised here) with full hop. */
function bbFlying(x: number, z: number, speed = 80) {
  const len = Math.hypot(x, z);
  return spawnBB(createBBPool(1), 0, vec3(0, 1.5, -5), vec3(x / len, 0, z / len), speed, 0.12, 0.25e-3);
}

describe('BB ricochets (M20)', () => {
  it('bounce a BB back off concrete, slower, with the part into the wall scaled by its restitution', () => {
    const bb = bbFlying(0, -1);
    expect(ricochet(bb, wall('concrete'), CFG)).toBe(true);
    expect(bb.velocity.z).toBeCloseTo(80 * CFG.restitution.concrete, 6);
    expect(bb.velocity.x).toBeCloseTo(0, 6);
    expect(bb.bounces).toBe(1);
    expect(bb.spin).toBe(0); // the backspin is scrubbed off
    expect(bb.position.z).toBeGreaterThan(-5); // lifted off the surface
  });

  it('skip a grazing BB along the surface, keeping most of its speed', () => {
    const bb = bbFlying(1, -0.1);
    expect(ricochet(bb, wall('concrete'), CFG)).toBe(true);
    const speed = Math.hypot(bb.velocity.x, bb.velocity.y, bb.velocity.z);
    expect(speed).toBeGreaterThan(80 * CFG.slide * 0.95);
    expect(bb.velocity.z).toBeGreaterThan(0);
    expect(bb.velocity.x).toBeGreaterThan(Math.abs(bb.velocity.z) * 5);
  });

  it('bounce harder off steel than concrete, and not at all off wood', () => {
    const steel = bbFlying(0, -1);
    const concrete = bbFlying(0, -1);
    ricochet(steel, wall('metal'), CFG);
    ricochet(concrete, wall('concrete'), CFG);
    expect(steel.velocity.z).toBeGreaterThan(concrete.velocity.z);
    const wood = bbFlying(0, -1);
    expect(ricochet(wood, wall('wood'), CFG)).toBe(false);
    expect(wood.bounces).toBe(0);
  });

  it('drop a BB that would leave too slowly, and stop after the last allowed bounce', () => {
    // Head-on at 25 m/s: 10 m/s back off concrete, under the minimum.
    expect(ricochet(bbFlying(0, -1, 25), wall('concrete'), CFG)).toBe(false);
    const bb = bbFlying(0, -1);
    bb.bounces = CFG.maxBounces;
    expect(ricochet(bb, wall('metal'), CFG)).toBe(false);
  });

  it('scatter a little with the seeded stream, never back into the surface, at the same speed', () => {
    const rng = createRng(5);
    for (let i = 0; i < 50; i++) {
      const plain = bbFlying(0.3, -1);
      const scattered = bbFlying(0.3, -1);
      ricochet(plain, wall('concrete'), CFG);
      ricochet(scattered, wall('concrete'), CFG, rng);
      expect(scattered.velocity.z).toBeGreaterThan(0);
      expect(Math.hypot(scattered.velocity.x, scattered.velocity.y, scattered.velocity.z)).toBeCloseTo(Math.hypot(plain.velocity.x, plain.velocity.y, plain.velocity.z), 6);
    }
  });
});

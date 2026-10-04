import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { blockMaterial } from '../config/materials';
import { BODY } from '../config/movement';
import { AEG, hopUpLift } from '../config/replicas';
import type { ImpactMaterial } from '../config/sounds';
import { DEPOT } from '../map/depot';
import type { MapBlock, MapData } from '../map/mapTypes';
import { RANGE_MAP } from '../map/range';
import { SLOPE_YARD } from '../map/testSupport';
import { terrainHeightAt, terrainMesh } from '../map/terrain';
import type { SurfaceHit, WorldQuery } from '../sim/armament';
import { createBBPool, spawnBB } from '../sim/ballistics';
import { stepBBs } from '../sim/bbs';
import type { GameEvent } from '../sim/events';
import { createRng, type RngState, rngNext } from '../sim/rng';
import { type Vec3, vec3 } from '../sim/vec';
import { blockCollider, initPhysics, PhysicsWorld } from './physicsWorld';

const DT = 1 / 60;
/** Where tunnelMap's wall starts (its near face, m along -z). */
const WALL_NEAR = -10;

/**
 * The level's ray casts as Rapier answers them: a ray against each block's collider, the way PhysicsWorld cast them
 * before sim/levelRay.ts (audit SIM-01). The reference the level ray is held to.
 */
function rapierQuery(map: MapData): Required<WorldQuery> & { free(): void } {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const materials = new Map<number, ImpactMaterial>();
  for (const b of map.blocks) {
    const desc = blockCollider(b).setTranslation(b.center.x, b.center.y, b.center.z);
    materials.set(world.createCollider(desc).handle, blockMaterial(b));
  }
  if (map.terrain) {
    // The ground (M33c) as the trimesh collider PhysicsWorld builds from the same triangles.
    const { positions, indices } = terrainMesh(map.terrain);
    materials.set(world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices)).handle, 'earth');
  }
  world.step();
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  const aim = (o: Vec3, d: Vec3): RAPIER.Ray => {
    ray.origin = { x: o.x, y: o.y, z: o.z };
    ray.dir = { x: d.x, y: d.y, z: d.z };
    return ray;
  };
  return {
    raycastStatic(o, d, max) {
      const hit = world.castRay(aim(o, d), max, true);
      return hit ? hit.timeOfImpact : -1;
    },
    raycastSurface(o, d, max, out) {
      const hit = world.castRayAndGetNormal(aim(o, d), max, true);
      if (!hit) return -1;
      const facing = hit.normal.x * d.x + hit.normal.y * d.y + hit.normal.z * d.z > 0 ? -1 : 1;
      out.normal.x = hit.normal.x * facing;
      out.normal.y = hit.normal.y * facing;
      out.normal.z = hit.normal.z * facing;
      out.material = materials.get(hit.collider.handle)!;
      return hit.timeOfImpact;
    },
    free: () => world.free(),
  };
}

function randomDir(rng: RngState, out: Vec3): Vec3 {
  // Uniform on the sphere.
  const y = rngNext(rng) * 2 - 1;
  const a = rngNext(rng) * Math.PI * 2;
  const r = Math.sqrt(1 - y * y);
  out.x = r * Math.cos(a);
  out.y = y;
  out.z = r * Math.sin(a);
  return out;
}

function insideBox(b: MapBlock, p: Vec3, margin: number): boolean {
  return (
    Math.abs(p.x - b.center.x) < b.size.x / 2 + margin && Math.abs(p.y - b.center.y) < b.size.y / 2 + margin && Math.abs(p.z - b.center.z) < b.size.z / 2 + margin
  );
}

describe('level ray casts (sim/levelRay.ts) against Rapier (audit SIM-01, SIM-18)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('gives the same distance, normal and material as a Rapier ray, on every block of Depot and the range', () => {
    // Rapier's maths is single precision: on Depot it agrees within 0.03 mm, on the range's 72 m walls within 0.13 mm.
    for (const [map, tolerance] of [
      [DEPOT, 1e-4],
      [RANGE_MAP, 2.5e-4],
    ] as const) {
      const world = new PhysicsWorld(map, BODY, DT);
      const rapier = rapierQuery(map);
      const rng = createRng(17);
      const a: SurfaceHit = { normal: vec3(), material: 'concrete' };
      const b: SurfaceHit = { normal: vec3(), material: 'concrete' };
      const dir = vec3();
      const origin = vec3();
      let rays = 0;
      let hits = 0;
      const check = (label: string, maxDist: number): void => {
        rays++;
        const t = world.raycastSurface(origin, dir, maxDist, a);
        const want = rapier.raycastSurface(origin, dir, maxDist, b);
        const where = `${map.name} ${label}: from (${origin.x}, ${origin.y}, ${origin.z}) along (${dir.x}, ${dir.y}, ${dir.z})`;
        if (want < 0) {
          expect(t, where).toBe(-1);
          return;
        }
        hits++;
        expect(Math.abs(t - want), where).toBeLessThan(tolerance);
        expect(a.material, where).toBe(b.material);
        expect(a.normal.x * b.normal.x + a.normal.y * b.normal.y + a.normal.z * b.normal.z, where).toBeGreaterThan(0.99);
        expect(world.raycastStatic(origin, dir, maxDist), where).toBe(t);
      };
      const outsideAll = (): boolean => !map.blocks.some((k) => insideBox(k, origin, 1e-3));
      // Rays at every block: from all round it, aimed at a point on or near it (some just miss its edges).
      map.blocks.forEach((block, i) => {
        for (let n = 0; n < 60; n++) {
          const tx = block.center.x + (rngNext(rng) - 0.5) * (block.size.x + 0.2);
          const ty = block.center.y + (rngNext(rng) - 0.5) * (block.size.y + 0.2);
          const tz = block.center.z + (rngNext(rng) - 0.5) * (block.size.z + 0.2);
          randomDir(rng, dir);
          const back = 0.3 + rngNext(rng) * 25;
          origin.x = tx - dir.x * back;
          origin.y = ty - dir.y * back;
          origin.z = tz - dir.z * back;
          if (!outsideAll()) continue;
          check(`block ${i} (${block.kind})`, back + 1 + rngNext(rng) * 30);
        }
      });
      // BB-sized tick segments and longer sightlines anywhere over the level.
      for (let n = 0; n < 10_000; n++) {
        origin.x = -30 + rngNext(rng) * 60;
        origin.y = -0.4 + rngNext(rng) * 6.4;
        origin.z = -70 + rngNext(rng) * 80;
        if (!outsideAll()) continue;
        randomDir(rng, dir);
        check('segment', n % 4 === 0 ? rngNext(rng) * 60 : 1.6);
      }
      expect(rays).toBeGreaterThan(5_000);
      expect(hits).toBeGreaterThan(rays / 20);
      rapier.free();
      world.dispose();
    }
  });

  it('agrees with a Rapier ray on a map with sloping ground: seeded rays over a yard with a slope, a hill and a few blocks (M33c)', () => {
    const map = SLOPE_YARD;
    const terrain = map.terrain!;
    const world = new PhysicsWorld(map, BODY, DT);
    const rapier = rapierQuery(map);
    const rng = createRng(33);
    const a: SurfaceHit = { normal: vec3(), material: 'concrete' };
    const b: SurfaceHit = { normal: vec3(), material: 'concrete' };
    const dir = vec3();
    const origin = vec3();
    let rays = 0;
    let earth = 0;
    let blocks = 0;
    for (let n = 0; n < 8_000; n++) {
      // Anywhere over the yard and a little beyond its edge, from a little under the ground to well above it.
      origin.x = -17 + rngNext(rng) * 34;
      origin.z = -17 + rngNext(rng) * 34;
      const g = terrainHeightAt(terrain, origin.x, origin.z) ?? 0;
      origin.y = g - 0.5 + rngNext(rng) * 6;
      if (map.blocks.some((k) => insideBox(k, origin, 1e-3))) continue;
      randomDir(rng, dir);
      // Every fourth is a long sight line; the rest are BB-sized tick segments.
      const maxDist = n % 4 === 0 ? rngNext(rng) * 45 : 1.6;
      rays++;
      const t = world.raycastSurface(origin, dir, maxDist, a);
      const want = rapier.raycastSurface(origin, dir, maxDist, b);
      const where = `ray ${n}: from (${origin.x}, ${origin.y}, ${origin.z}) along (${dir.x}, ${dir.y}, ${dir.z}) max ${maxDist}`;
      if (want < 0) {
        expect(t, where).toBe(-1);
        continue;
      }
      expect(Math.abs(t - want), where).toBeLessThan(5e-4);
      expect(a.material, where).toBe(b.material);
      expect(a.normal.x * b.normal.x + a.normal.y * b.normal.y + a.normal.z * b.normal.z, where).toBeGreaterThan(0.99);
      expect(world.raycastStatic(origin, dir, maxDist), where).toBe(t);
      if (a.material === 'earth') earth++;
      else blocks++;
    }
    expect(rays).toBeGreaterThan(6_000);
    expect(earth).toBeGreaterThan(500);
    expect(blocks).toBeGreaterThan(20);
    rapier.free();
    world.dispose();
  });

  /** A floor, a concrete wall `thickness` m thick whose near face is 10 m out along -z, and a crate in front of it. */
  function tunnelMap(thickness: number): MapData {
    return {
      name: 'tunnel',
      blocks: [
        { kind: 'floor', center: vec3(0, -0.25, -20), size: vec3(100, 0.5, 100) },
        { kind: 'wall', center: vec3(0, 4, WALL_NEAR - thickness / 2), size: vec3(80, 8, thickness) },
        { kind: 'crate', center: vec3(2, 0.6, -6), size: vec3(1.2, 1.2, 1.2) },
      ],
      killY: -10,
      spawns: [[], []],
      deadZones: [[], []],
      lanes: [],
    };
  }

  /**
   * The audit's tunnelling probe: BBs at 97 m/s (0.20 g, full hop) fanned ±69° across and ±17° up and down from the
   * origin at tunnelMap's wall, ricochets on. Counts BBs that crossed the wall's slab inside the wall (rather than over
   * its top or round its end) and BBs that ended a tick inside a block.
   */
  function tunnelProbe(query: WorldQuery, map: MapData, count: number, seed: number): { bounced: number; crossings: number; inside: number } {
    const blocks = map.blocks;
    const wall = blocks[1]!;
    const thickness = wall.size.z;
    const wallNear = WALL_NEAR;
    const wallFar = wallNear - thickness;
    const rng = createRng(seed);
    const pool = createBBPool(BALLISTICS.maxBBs);
    const events: GameEvent[] = [];
    const dir = vec3();
    let bounced = 0;
    let crossings = 0;
    let inside = 0;
    for (let fired = 0; fired < count; ) {
      for (; fired < count && pool.bbs.some((bb) => !bb.active); fired++) {
        const yaw = ((rngNext(rng) * 2 - 1) * 69 * Math.PI) / 180;
        const pitch = ((rngNext(rng) * 2 - 1) * 17 * Math.PI) / 180;
        dir.x = Math.sin(yaw) * Math.cos(pitch);
        dir.y = Math.sin(pitch);
        dir.z = -Math.cos(yaw) * Math.cos(pitch);
        spawnBB(pool, 1, vec3(0, 1.5, 0), dir, 97, hopUpLift(AEG, 1), 0.2e-3);
      }
      for (let tick = 0; tick < BALLISTICS.maxLifetime / DT + 2 && pool.bbs.some((bb) => bb.active); tick++) {
        const wasActive = pool.bbs.map((bb) => bb.active);
        stepBBs(pool, BALLISTICS, query, -10, events, DT, undefined, rng);
        events.length = 0;
        pool.bbs.forEach((bb, i) => {
          if (!wasActive[i]) return;
          const p = bb.prevPosition;
          const q = bb.position;
          // Passed from one side of the wall's slab to the other this tick: only over its top or round its end.
          const side = (z: number): number => (z > wallNear ? 1 : z < wallFar ? -1 : 0);
          if (side(p.z) * side(q.z) < 0) {
            const k = (wallNear - thickness / 2 - p.z) / (q.z - p.z);
            const x = p.x + (q.x - p.x) * k;
            const y = p.y + (q.y - p.y) * k;
            if (Math.abs(x) < wall.size.x / 2 && y < wall.size.y) crossings++;
          }
          if (blocks.some((b) => insideBox(b, q, -1e-4))) inside++;
        });
      }
      for (const bb of pool.bbs) {
        if (bb.bounces > 0) bounced++;
        bb.active = false;
        bb.bounces = 0;
      }
    }
    return { bounced, crossings, inside };
  }

  it('never lets a BB through a thin wall or into a crate, ricochets included: 9,000 BBs through the level ray (SIM-18)', () => {
    let bounced = 0;
    for (const [i, thickness] of [0.05, 0.3, 0.4].entries()) {
      const map = tunnelMap(thickness);
      const world = new PhysicsWorld(map, BODY, DT);
      const r = tunnelProbe(world, map, 3000, 100 + i);
      world.dispose();
      expect(r.crossings, `${thickness} m wall`).toBe(0);
      expect(r.inside, `${thickness} m wall`).toBe(0);
      bounced += r.bounced;
    }
    expect(bounced).toBeGreaterThan(1000);
  });

  it('and the same through a Rapier ray (500 BBs at the thinnest wall), the reference the level ray matches', () => {
    const map = tunnelMap(0.05);
    const rapier = rapierQuery(map);
    const r = tunnelProbe(rapier, map, 500, 7);
    rapier.free();
    expect(r.crossings).toBe(0);
    expect(r.inside).toBe(0);
    expect(r.bounced).toBeGreaterThan(50);
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import { lowCoverBlocks, tallCoverBlocks } from '../ai/cover';
import { canSee } from '../ai/perception';
import { BOTS } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LOADOUT } from '../config/replicas';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { DEPOT } from './depot';
import type { MapData } from './mapTypes';

/** Depot as it was before G8: the same map without its set dressing. */
const BARE: MapData = { ...DEPOT };
delete BARE.dressing;

describe('Depot dressing changes nothing in play (G8)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('has a dressing, and leaves the blocks, lanes and spots as they are', () => {
    expect(DEPOT.dressing).toBeDefined();
    expect(DEPOT.blocks).toBe(BARE.blocks);
    expect(DEPOT.lanes).toBe(BARE.lanes);
  });

  it('builds the same nav grid and the same cover blocks with and without the dressing', () => {
    const navA = buildNavGrid(DEPOT, NAV);
    const navB = buildNavGrid(BARE, NAV);
    expect(navA).toEqual(navB);
    expect(lowCoverBlocks(DEPOT.blocks, navA, BODY, BOTS.lowCoverFloorGap)).toEqual(lowCoverBlocks(BARE.blocks, navB, BODY, BOTS.lowCoverFloorGap));
    expect(tallCoverBlocks(DEPOT.blocks, navA, BODY, BOTS.lowCoverFloorGap)).toEqual(tallCoverBlocks(BARE.blocks, navB, BODY, BOTS.lowCoverFloorGap));
  });

  it('gives the same colliders (every ray stops at the same place) and the same bot sight', () => {
    const a = new PhysicsWorld(DEPOT, BODY, 1 / 60);
    const b = new PhysicsWorld(BARE, BODY, 1 / 60);
    // Rays across the yard at foot, crouch and eye height: a dressing collider anywhere would change one.
    for (let x = -24; x <= 24; x += 2) {
      for (let z = -15; z <= 15; z += 3) {
        for (const y of [0.1, 0.25, 1.0, 1.6]) {
          for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [0.7071, 0.7071]] as const) {
            const from = vec3(x, y, z);
            const dir = vec3(dx, 0, dz);
            expect(a.raycastStatic(from, dir, 60)).toBe(b.raycastStatic(from, dir, 60));
          }
        }
      }
    }
    // Bot sight between people standing on a grid over the yard (canSee: the bots' own test).
    const spots = [];
    for (let x = -22; x <= 22; x += 5.5) for (let z = -13; z <= 13; z += 4.3) spots.push(vec3(x, 0, z));
    const viewer = createCharacter(0, vec3(), 0, LOADOUT, 0);
    const target = createCharacter(1, vec3(), 0, LOADOUT, 1);
    let seen = 0;
    for (const p of spots) {
      for (const q of spots) {
        if (p === q) continue;
        viewer.position = p;
        target.position = q;
        viewer.yaw = Math.atan2(-(q.x - p.x), -(q.z - p.z));
        const sees = canSee(viewer, target, a, BOTS, BODY, HITS);
        expect(canSee(viewer, target, b, BOTS, BODY, HITS)).toBe(sees);
        if (sees) seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
    a.dispose();
    b.dispose();
  });
});

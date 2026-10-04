import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, NIGHT_SIGHT } from '../config/bots';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import type { MapBlock, MapData } from '../map/mapTypes';
import { buildNightField } from '../map/nightSight';
import { RANGE_MAP } from '../map/range';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import { OPEN_FIELD } from '../sim/testSupport';
import { vec3 } from '../sim/vec';
import { DT } from './depotMatchSupport';
import { sightConditionsOf, visiblePart } from './perception';

/**
 * M33g QA, acceptances 1 and 3 with Rapier's real level query (not a stub that sees nothing): a bot in a real headless
 * world fails to spot someone 30 m off in the open at night, spots them by a lantern, and viewDistance still caps the
 * lit range. Depot and the range see exactly as before.
 */

const standing = (id: number, team: number, x: number, z: number) => createCharacter(id, vec3(x, 0, z), 0, LOADOUT, team);
const trunk = (x: number, z: number): MapBlock => ({ kind: 'tree', center: vec3(x, 4.5, z), size: vec3(0.5, 9, 0.5) });
const nightField = (extra: Partial<MapData> = {}): MapData => ({ ...OPEN_FIELD, night: true, ...extra });
/** A lantern 2 m up with a pool of `radius` m on the ground at (x, z). */
const lantern = (x: number, z: number, radius = 4) => ({ position: vec3(x, 2, z), radius, colour: 0xffd27a });

describe('a bot in a real night world (acceptance 1)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('does not make out someone 30 m away in the open at night, who it sees by day', () => {
    const map = nightField();
    const physics = new PhysicsWorld(map, BODY, DT);
    const viewer = standing(0, 0, 0, 0); // faces -Z
    const target = standing(1, 1, 0, -30);
    expect(30).toBeGreaterThan(NIGHT_SIGHT.open);
    expect(30).toBeLessThan(BOTS.viewDistance);
    expect(visiblePart(viewer, target, physics, BOTS, BODY, HITS, sightConditionsOf(OPEN_FIELD))).toBeGreaterThan(0); // by day
    expect(visiblePart(viewer, target, physics, BOTS, BODY, HITS, sightConditionsOf(map))).toBe(0);
    physics.dispose();
  });

  it('spots the same person at 30 m by a lantern, and loses them again a step out of its pool', () => {
    const map = nightField({ lights: [lantern(0, -30, 4)] });
    const physics = new PhysicsWorld(map, BODY, DT);
    const sight = sightConditionsOf(map);
    const viewer = standing(0, 0, 0, 0);
    expect(visiblePart(viewer, standing(1, 1, 0, -30), physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0);
    expect(visiblePart(viewer, standing(1, 1, 3.5, -30), physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0); // still in the pool
    expect(visiblePart(viewer, standing(1, 1, 4.5, -30), physics, BOTS, BODY, HITS, sight)).toBe(0); // 4.5 m from the lantern: dark
    expect(visiblePart(viewer, standing(1, 1, 0, -(30 - 4.5)), physics, BOTS, BODY, HITS, sight)).toBe(0); // 25.5 m off and 4.5 m from the lantern: beyond moonlight, outside the pool
    physics.dispose();
  });

  it("goes by where the target stands, not the viewer: a bot standing in a lantern's light still can't see far into the dark", () => {
    const map = nightField({ lights: [lantern(0, 0, 4)] });
    const physics = new PhysicsWorld(map, BODY, DT);
    const sight = sightConditionsOf(map);
    expect(visiblePart(standing(0, 0, 0, 0), standing(1, 1, 0, -30), physics, BOTS, BODY, HITS, sight)).toBe(0);
    // and a target in the pool is seen from the dark far side
    expect(visiblePart(createCharacter(0, vec3(0, 0, -36), Math.PI, LOADOUT, 0), standing(1, 1, 0, -1), physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0);
    physics.dispose();
  });

  it('sees someone under the trees only from nightSight.canopy, and sees them from further the moment they step out of the clump', () => {
    const map = nightField({ blocks: [...OPEN_FIELD.blocks, trunk(-2, -20), trunk(2, -20), trunk(-2, -18), trunk(2, -18), trunk(-2, -22), trunk(2, -22)] });
    const physics = new PhysicsWorld(map, BODY, DT);
    const sight = sightConditionsOf(map);
    const target = standing(1, 1, 0, -20); // 20 m off, between the trunks: in the clump, so nobody sees them from 20 m
    expect(visiblePart(standing(0, 0, 0, 0), target, physics, BOTS, BODY, HITS, sight)).toBe(0);
    expect(visiblePart(standing(0, 0, 0, -20 + NIGHT_SIGHT.canopy - 2), target, physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0);
    // The trunks are off the line of sight (x = ±2 vs the line at x = 0), so only the dark hides them. 6 m clear of the clump, 20 m is seen.
    expect(visiblePart(standing(0, 0, 8, 0), standing(1, 1, 8, -20), physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0);
    physics.dispose();
  });

  it('keeps viewDistance as the cap: a lit spot beyond it is not seen, and a short viewDistance caps the moonlit range too', () => {
    const map = nightField({ lights: [lantern(0, -(BOTS.viewDistance + 5), 4)] });
    const physics = new PhysicsWorld(map, BODY, DT);
    const target = standing(1, 1, 0, -(BOTS.viewDistance + 5));
    // The pool is "lit" far beyond viewDistance; the cap still wins (by day and with a lit range longer than viewDistance).
    const longLit = { ...NIGHT_SIGHT, lit: BOTS.viewDistance * 3 };
    const sight = { foliage: [], night: buildNightField(map, longLit) };
    expect(visiblePart(standing(0, 0, 0, 0), target, physics, BOTS, BODY, HITS, sight)).toBe(0);
    expect(visiblePart(standing(0, 0, 0, -10), target, physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0); // 35 m: inside the cap
    // A bot whose viewDistance is shorter than the moonlit range sees only that far in the open.
    const short = { ...BOTS, viewDistance: NIGHT_SIGHT.open - 8 };
    const nightMap = nightField();
    const nightSight = sightConditionsOf(nightMap);
    expect(visiblePart(standing(0, 0, 0, 0), standing(1, 1, 0, -(short.viewDistance - 1)), physics, short, BODY, HITS, nightSight)).toBeGreaterThan(0);
    expect(visiblePart(standing(0, 0, 0, 0), standing(1, 1, 0, -(short.viewDistance + 1)), physics, short, BODY, HITS, nightSight)).toBe(0);
    physics.dispose();
  });

  it('draws the lines at the exact ranges: open 25 m in, just past it out; in a pool 40 m in, just past it out', () => {
    const map = nightField({ lights: [lantern(0, -40, 3)] });
    const physics = new PhysicsWorld(map, BODY, DT);
    const sight = sightConditionsOf(map);
    const viewer = standing(0, 0, 0, 0);
    expect(visiblePart(viewer, standing(1, 1, 0, -(NIGHT_SIGHT.open - 0.1)), physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0);
    expect(visiblePart(viewer, standing(1, 1, 0, -(NIGHT_SIGHT.open + 0.1)), physics, BOTS, BODY, HITS, sight)).toBe(0);
    expect(visiblePart(viewer, standing(1, 1, 0, -(NIGHT_SIGHT.lit - 0.1)), physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0);
    expect(visiblePart(viewer, standing(1, 1, 0, -(NIGHT_SIGHT.lit + 0.1)), physics, BOTS, BODY, HITS, sight)).toBe(0);
    physics.dispose();
  });

  it('still needs the field of view and a clear line at night: someone lit behind the bot, or behind a wall, is not seen', () => {
    const wall: MapBlock = { kind: 'wall', center: vec3(0, 1.5, -12), size: vec3(6, 3, 0.4) };
    const map = nightField({ blocks: [...OPEN_FIELD.blocks, wall], lights: [lantern(0, -20, 4), lantern(0, 20, 4)] });
    const physics = new PhysicsWorld(map, BODY, DT);
    const sight = sightConditionsOf(map);
    const viewer = standing(0, 0, 0, 0); // faces -Z
    expect(visiblePart(viewer, standing(1, 1, 0, -20), physics, BOTS, BODY, HITS, sight)).toBe(0); // behind the wall
    expect(visiblePart(viewer, standing(1, 1, 0, 20), physics, BOTS, BODY, HITS, sight)).toBe(0); // behind the viewer
    expect(visiblePart(viewer, standing(1, 1, 18, -20), physics, BOTS, BODY, HITS, sight)).toBe(0); // in the view cone, in the open, but 27 m off: beyond moonlight
    physics.dispose();
  });

  it('hides nobody within closeAwareness at night, even under the trees and out of the view cone', () => {
    const map = nightField({ blocks: [...OPEN_FIELD.blocks, trunk(-1.5, 1), trunk(1.5, 1), trunk(-1.5, 2), trunk(1.5, 2)] });
    const physics = new PhysicsWorld(map, BODY, DT);
    const sight = sightConditionsOf(map);
    expect(visiblePart(standing(0, 0, 0, 0), standing(1, 1, 0, 1.5), physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0); // behind the bot
    physics.dispose();
  });
});

describe('Depot and the range see exactly as before (acceptance 3)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it.each([
    ['Depot', DEPOT],
    ['the range', RANGE_MAP],
  ])('on %s, sight with sightConditionsOf(map) is identical to sight with no conditions, over a grid of viewer, target and yaw', (_name, map) => {
    const physics = new PhysicsWorld(map, BODY, DT);
    const sight = sightConditionsOf(map);
    expect(sight.night).toBeNull();
    const spots = map.spawns.flat().map((s) => s.position);
    expect(spots.length).toBeGreaterThan(0);
    let seen = 0;
    let unseen = 0;
    for (const a of spots) {
      for (const b of [...spots, vec3(a.x + 12, a.y, a.z - 12), vec3(a.x - 27, a.y, a.z + 33), vec3(a.x + 1, a.y, a.z + 1), vec3(a.x, a.y, a.z - (BOTS.viewDistance - 0.5)), vec3(a.x, a.y, a.z - (BOTS.viewDistance + 3))]) {
        if (a === b) continue;
        for (const yaw of [0, 1.1, 2.3, 4]) {
          const viewer = createCharacter(0, a, yaw, LOADOUT, 0);
          const target = createCharacter(1, b, 0, LOADOUT, 1);
          const plain = visiblePart(viewer, target, physics, BOTS, BODY, HITS);
          expect(visiblePart(viewer, target, physics, BOTS, BODY, HITS, sight)).toBe(plain);
          if (plain > 0) seen++;
          else unseen++;
        }
      }
    }
    expect(seen + unseen).toBeGreaterThan(30);
    expect(seen).toBeGreaterThan(0);
    physics.dispose();
  });

  it('sees someone 35 m off in a daylight open field up to viewDistance and not beyond it: no night cap at 25 m', () => {
    const map: MapData = { ...OPEN_FIELD }; // a daylight open field: Depot's rule without Depot's walls
    const physics = new PhysicsWorld(map, BODY, DT);
    const sight = sightConditionsOf(map);
    const viewer = standing(0, 0, 0, 0);
    expect(visiblePart(viewer, standing(1, 1, 0, -35), physics, BOTS, BODY, HITS, sight)).toBeGreaterThan(0);
    expect(visiblePart(viewer, standing(1, 1, 0, -(BOTS.viewDistance + 1)), physics, BOTS, BODY, HITS, sight)).toBe(0);
    physics.dispose();
  });
});

import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { type HitConfig, HITS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { impactMaterialAt } from '../audio/soundMaterials';
import type { MapBlock } from '../map/mapTypes';
import { type Terrain, terrainHeightAt } from '../map/terrain';
import { SLOPE_YARD, SLOPE_YARD_TERRAIN } from '../map/testSupport';
import { buildLevelRay, castLevelRay } from './levelRay';
import type { SurfaceHit, WorldQuery } from './armament';
import { createBBPool, spawnBB } from './ballistics';
import { type BBTargets, stepBBs } from './bbs';
import { createCharacter } from './character';
import { openFieldElimination } from './testSupport';
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

/** wallAt, also telling what the wall is made of (so BBs can ricochet off it). */
function hardWallAt(wallZ: number, material: SurfaceHit['material'] = 'concrete'): WorldQuery {
  const plane = wallAt(wallZ);
  return {
    raycastStatic: plane.raycastStatic,
    raycastSurface(o, d, max, out) {
      out.normal.x = 0;
      out.normal.y = 0;
      out.normal.z = 1;
      out.material = material;
      return plane.raycastStatic(o, d, max);
    },
  };
}

describe('stepBBs', () => {
  it('stops a BB exactly where its path meets a wall and reports the impact', () => {
    const pool = createBBPool(4);
    const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0.12, 0.25e-3);
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
    const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    stepBBs(pool, BALLISTICS, wallAt(-1.4), KILL_Y, events, DT);
    expect(bb.active).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('bounces a BB off a hard surface and lets it fly on from there (a ricochet, M20), but stops it in wood', () => {
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0.12, 0.25e-3);
    const events: GameEvent[] = [];
    for (let i = 0; i < 20 && bb.bounces === 0; i++) stepBBs(pool, BALLISTICS, hardWallAt(-12), KILL_Y, events, DT);
    expect(bb.active).toBe(true);
    expect(bb.bounces).toBe(1);
    expect(events.filter((e) => e.type === 'bbImpact')).toHaveLength(1);
    stepBBs(pool, BALLISTICS, hardWallAt(-12), KILL_Y, events, DT);
    expect(bb.position.z).toBeGreaterThan(-12); // coming back
    const soft = createBBPool(1);
    const stuck = spawnBB(soft, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0.12, 0.25e-3);
    for (let i = 0; i < 20 && stuck.active; i++) stepBBs(soft, BALLISTICS, hardWallAt(-12, 'wood'), KILL_Y, [], DT);
    expect(stuck.active).toBe(false);
  });

  it('removes BBs that fly too long or fall out of the world, with no impact (only a bbLost for the range readout)', () => {
    const pool = createBBPool(2);
    const up = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 1, 0), 40, 0, 0.25e-3);
    const events: GameEvent[] = [];
    const ticks = Math.ceil(BALLISTICS.maxLifetime / DT) + 2;
    for (let i = 0; i < ticks; i++) stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, events, DT);
    expect(up.active).toBe(false);
    expect(events).toEqual([{ type: 'bbLost', position: expect.anything(), ownerId: 0 }]);
  });

  it('records the previous position for the collision segment and interpolation', () => {
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0.12, 0.25e-3);
    stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, [], DT);
    const before = { ...bb.position };
    stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, [], DT);
    expect(bb.prevPosition).toEqual(before);
  });
});

describe('stepBBs out-of-world removal', () => {
  it('removes a BB that falls below killY before its lifetime ends', () => {
    const pool = createBBPool(1);
    // Fired straight down from just above the kill height, with no level to hit.
    const bb = spawnBB(pool, 0, vec3(0, KILL_Y + 1, 0), vec3(0, -1, 0), 60, 0, 0.25e-3);
    const events: GameEvent[] = [];
    for (let i = 0; i < 5; i++) stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, events, DT);
    expect(bb.active).toBe(false);
    expect(bb.age).toBeLessThan(BALLISTICS.maxLifetime);
    expect(events.map((e) => e.type)).toEqual(['bbLost']);
  });
});

describe('stepBBs hitting characters', () => {
  const noWall: WorldQuery = { raycastStatic: () => -1 };
  const deadZones = [[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]];

  /** Shooter (team 0, id 1) at the origin; BB fired at chest height (1.2 m) towards -Z. */
  function setup(targets: { id: number; team: number; z: number; x?: number; crouch?: number }[], hits: HitConfig = HITS) {
    const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
    const characters = [shooter];
    for (const t of targets) {
      const c = createCharacter(t.id, vec3(t.x ?? 0, 0, t.z), 0, LOADOUT, t.team);
      c.crouchAmount = t.crouch ?? 0;
      characters.push(c);
    }
    const pool = createBBPool(4);
    const bb = spawnBB(pool, shooter.id, vec3(0, 1.2, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    const bbTargets: BBTargets = { characters, hits, elimination: openFieldElimination(deadZones) };
    const run = (wall = noWall) => {
      for (let i = 0; i < 60 && bb.active; i++) stepBBs(pool, BALLISTICS, wall, KILL_Y, events, DT, bbTargets);
    };
    return { characters, bb, events, run };
  }

  it('eliminates the first character in the path and reports who hit whom, from which direction', () => {
    const { characters, bb, events, run } = setup([
      { id: 2, team: 1, z: -10 },
      { id: 3, team: 1, z: -20 },
    ]);
    run();
    expect(bb.active).toBe(false);
    expect(bb.position.z).toBeCloseTo(-10 + HITS.bodyRadius, 3);
    expect(characters[1]!.status).toBe('calling');
    expect(characters[1]!.hitBy).toBe(1);
    expect(characters[2]!.status).toBe('alive');
    const hit = events.find((e) => e.type === 'characterHit');
    expect(hit).toMatchObject({ victimId: 2, shooterId: 1 });
    expect(hit?.type === 'characterHit' && hit.direction.z).toBeCloseTo(-1, 2);
    expect(events.some((e) => e.type === 'bbImpact')).toBe(false);
  });

  it('never hits the shooter, and passes through characters already hit', () => {
    const { characters, run, events } = setup([
      { id: 2, team: 1, z: -10 },
      { id: 3, team: 1, z: -20 },
    ]);
    characters[1]!.status = 'walkingOff';
    run();
    expect(characters[0]!.status).toBe('alive');
    expect(characters[2]!.status).toBe('calling');
    expect(events.filter((e) => e.type === 'characterHit')).toHaveLength(1);
  });

  it('passes through a Ghost (the Dev settings, M24) and hits whoever is behind', () => {
    const { characters, run, events } = setup([
      { id: 2, team: 1, z: -10 },
      { id: 3, team: 1, z: -20 },
    ]);
    characters[1]!.ghost = true;
    run();
    expect(characters[1]!.status).toBe('alive');
    expect(characters[2]!.status).toBe('calling');
    expect(events.filter((e) => e.type === 'characterHit')).toHaveLength(1);
  });

  it('stops at a wall in front of a character', () => {
    const { characters, events, run } = setup([{ id: 2, team: 1, z: -10 }]);
    run(wallAt(-6));
    expect(characters[1]!.status).toBe('alive');
    expect(events.some((e) => e.type === 'bbImpact')).toBe(true);
  });

  it('hits a character standing right in front of a wall', () => {
    const { characters, run } = setup([{ id: 2, team: 1, z: -10 }]);
    run(wallAt(-10.1));
    expect(characters[1]!.status).toBe('calling');
  });

  it('counts friendly hits by default and can be told not to', () => {
    const friendly = setup([{ id: 2, team: 0, z: -10 }]);
    friendly.run();
    expect(friendly.characters[1]!.status).toBe('calling');
    const noFf = setup([{ id: 2, team: 0, z: -10 }], { ...HITS, friendlyFire: false });
    noFf.run();
    expect(noFf.characters[1]!.status).toBe('alive');
  });

  it('ticks a character with a ricochet without knocking them out, unless the match counts ricochets (M20)', () => {
    // A BB fired at an angle at a concrete wall 10 m away comes back off it towards a target standing beside the line out:
    // it meets the wall at x = 3 and leaves at dx/dz = 0.3 · slide / restitution (no scatter without an rng).
    const { slide, restitution } = BALLISTICS.ricochet;
    const targetX = 3 + 4 * ((0.3 * slide) / restitution.concrete);
    for (const counts of [false, true]) {
      const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
      const target = createCharacter(2, vec3(targetX, 0, -6), 0, LOADOUT, 1);
      const characters = [shooter, target];
      const pool = createBBPool(1);
      const dir = vec3(0.3 / Math.hypot(0.3, 1), 0, -1 / Math.hypot(0.3, 1));
      const bb = spawnBB(pool, 1, vec3(0, 1.2, 0), dir, 80, 0.12, 0.25e-3);
      const events: GameEvent[] = [];
      const targets: BBTargets = { characters, hits: { ...HITS, ricochetsCount: counts }, elimination: openFieldElimination(deadZones) };
      for (let i = 0; i < 60 && bb.active; i++) stepBBs(pool, BALLISTICS, hardWallAt(-10), KILL_Y, events, DT, targets);
      expect(target.status, `ricochets count: ${counts}`).toBe(counts ? 'calling' : 'alive');
      const ev = events.find((e) => e.type === 'ricochetTick' || e.type === 'characterHit');
      expect(ev).toMatchObject({ type: counts ? 'characterHit' : 'ricochetTick', victimId: 2, shooterId: 1 });
      if (ev?.type === 'characterHit') expect(ev.ricochet).toBe(true);
      expect(bb.active).toBe(false);
    }
  });

  it('lets a ricochet come back and hit the shooter, under the same rules as anyone else (audit SIM-07)', () => {
    // Fired into a steel wall 2 m away: it comes straight back (no scatter without an rng) through the shooter.
    const fire = (hits: HitConfig) => {
      const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
      const characters = [shooter];
      const pool = createBBPool(1);
      const bb = spawnBB(pool, 1, vec3(0, 1.2, 0), vec3(0, 0, -1), 80, 0, 0.25e-3);
      const events: GameEvent[] = [];
      const targets: BBTargets = { characters, hits, elimination: openFieldElimination(deadZones) };
      for (let i = 0; i < 30 && bb.active; i++) stepBBs(pool, BALLISTICS, hardWallAt(-2, 'metal'), KILL_Y, events, DT, targets);
      return { shooter, bb, events };
    };
    const ticked = fire(HITS);
    expect(ticked.shooter.status).toBe('alive');
    expect(ticked.events.find((e) => e.type === 'ricochetTick')).toMatchObject({ victimId: 1, shooterId: 1 });
    const counted = fire({ ...HITS, ricochetsCount: true });
    expect(counted.shooter.status).toBe('calling');
    expect(counted.events.find((e) => e.type === 'characterHit')).toMatchObject({ victimId: 1, shooterId: 1, ricochet: true });
    expect(counted.bb.bounces).toBe(1);
    // With friendly fire off nobody's BBs hit their own team, the shooter included.
    const noFf = fire({ ...HITS, ricochetsCount: true, friendlyFire: false });
    expect(noFf.shooter.status).toBe('alive');
    expect(noFf.events.some((e) => e.type === 'characterHit' || e.type === 'ricochetTick')).toBe(false);
  });

  it('flies over a crouched character that a standing one would have caught in the chest', () => {
    // BB at 1.2 m: hits a standing target, passes over a fully crouched one (top 1.13 m).
    const standing = setup([{ id: 2, team: 1, z: -5 }]);
    standing.run();
    expect(standing.characters[1]!.status).toBe('calling');
    const crouched = setup([{ id: 2, team: 1, z: -5, crouch: 1 }]);
    crouched.run();
    expect(crouched.characters[1]!.status).toBe('alive');
  });

  it('sends teammates hit one after another to different dead-zone spots', () => {
    const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
    const a = createCharacter(2, vec3(0, 0, -10), 0, LOADOUT, 1);
    const b = createCharacter(3, vec3(0.6, 0, -10), 0, LOADOUT, 1);
    const zones = [[], [{ position: vec3(30, 0, 0), yaw: 0 }, { position: vec3(30, 0, 1), yaw: 0 }]];
    const characters = [shooter, a, b];
    const pool = createBBPool(4);
    spawnBB(pool, 1, vec3(0, 1.2, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    spawnBB(pool, 1, vec3(0.6, 1.2, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    for (let i = 0; i < 30; i++) stepBBs(pool, BALLISTICS, noWall, KILL_Y, [], DT, { characters, hits: HITS, elimination: openFieldElimination(zones) });
    expect(a.status).toBe('calling');
    expect(b.status).toBe('calling');
    expect(a.deadZoneTarget).not.toEqual(b.deadZoneTarget);
  });

  it('lets the second of two BBs reaching someone in the same tick fly on: they were already hit by the first', () => {
    const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
    const target = createCharacter(2, vec3(0, 0, -10), 0, LOADOUT, 1);
    const pool = createBBPool(4);
    const first = spawnBB(pool, 1, vec3(0, 1.2, -9), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const second = spawnBB(pool, 1, vec3(0.05, 1.2, -9), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    stepBBs(pool, BALLISTICS, noWall, KILL_Y, events, DT, { characters: [shooter, target], hits: HITS, elimination: openFieldElimination(deadZones) });
    expect(events.filter((e) => e.type === 'characterHit')).toHaveLength(1);
    expect(first.active).toBe(false);
    expect(second.active).toBe(true);
    expect(second.position.z).toBeLessThan(-10);
  });

  it('hits a leaning character on the flank of the tilted torso (M-06)', () => {
    const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
    const target = createCharacter(2, vec3(0, 0, -10), 0, LOADOUT, 1);
    target.lean = 1;
    // Just above the hips, 0.15 m out from the leaned torso's axis: outside the old body capsule and shoulder sphere.
    const h = HITS.lean.pivotHeight + 0.1;
    const out = (h - HITS.lean.pivotHeight) * Math.sin(HITS.lean.maxAngle) + 0.15;
    const pool = createBBPool(4);
    const bb = spawnBB(pool, 1, vec3(out, h, -9), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    stepBBs(pool, BALLISTICS, noWall, KILL_Y, events, DT, { characters: [shooter, target], hits: HITS, elimination: openFieldElimination(deadZones) });
    expect(bb.active).toBe(false);
    expect(target.status).toBe('calling');
  });
});

describe('stepBBs in the wind (M30)', () => {
  const noWall: WorldQuery = { raycastStatic: () => -1 };
  const CROSSWIND = vec3(30, 0, 0); // towards +x; far stronger than any match breeze, so a drift is tens of centimetres in 10 m

  it('drifts a BB downwind, where still air leaves it on its line, mirrored by the opposite wind', () => {
    const fly = (wind: Readonly<ReturnType<typeof vec3>> | undefined) => {
      const pool = createBBPool(1);
      const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0, 0.25e-3);
      for (let i = 0; i < 30; i++) stepBBs(pool, BALLISTICS, noWall, KILL_Y, [], DT, undefined, undefined, wind);
      return bb;
    };
    const still = fly(undefined);
    const windy = fly(CROSSWIND);
    expect(still.position.x).toBe(0);
    expect(windy.position.x).toBeGreaterThan(0.2);
    expect(fly(vec3(-30, 0, 0)).position.x).toBeCloseTo(-windy.position.x, 6); // mirrored wind, mirrored drift
    expect(windy.velocity.x).toBeGreaterThan(0); // dragged along by the air
  });

  it('treats an absent wind as still air (the same flight as a zero wind)', () => {
    const fly = (wind?: Readonly<ReturnType<typeof vec3>>) => {
      const pool = createBBPool(1);
      const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0.3, 0.1, -1), 80, 0.12, 0.25e-3);
      for (let i = 0; i < 40; i++) stepBBs(pool, BALLISTICS, noWall, KILL_Y, [], DT, undefined, undefined, wind);
      return bb.position;
    };
    expect(fly(vec3())).toEqual(fly());
  });

  it('still stops at the wall in its way, where the wind has carried it to', () => {
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0, 0.25e-3);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && bb.active; i++) stepBBs(pool, BALLISTICS, wallAt(-12), KILL_Y, events, DT, undefined, undefined, CROSSWIND);
    expect(bb.active).toBe(false);
    expect(bb.position.z).toBeCloseTo(-12, 6);
    expect(bb.position.x).toBeGreaterThan(0.05);
    const impacts = events.filter((e) => e.type === 'bbImpact');
    expect(impacts).toHaveLength(1);
    expect(impacts[0]!.type === 'bbImpact' && impacts[0]!.position.x).toBeCloseTo(bb.position.x, 6);
  });

  it('hits whoever the wind carries the BB into, and misses whoever stood on the still-air line', () => {
    const fireAt = (targetX: number, wind: Readonly<ReturnType<typeof vec3>> | undefined) => {
      const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
      const target = createCharacter(2, vec3(targetX, 0, -10), 0, LOADOUT, 1);
      const pool = createBBPool(1);
      const bb = spawnBB(pool, 1, vec3(0, 1.2, 0), vec3(0, 0, -1), 80, 0, 0.25e-3);
      const targets: BBTargets = { characters: [shooter, target], hits: HITS, elimination: openFieldElimination([[{ position: vec3(-30, 0, 0), yaw: 0 }], [{ position: vec3(30, 0, 0), yaw: 0 }]]) };
      for (let i = 0; i < 60 && bb.active; i++) stepBBs(pool, BALLISTICS, noWall, KILL_Y, [], DT, targets, undefined, wind);
      return target.status;
    };
    // Where the windy BB crosses z = -10: found by flying it with nobody there.
    const probePool = createBBPool(1);
    const probe = spawnBB(probePool, 1, vec3(0, 1.2, 0), vec3(0, 0, -1), 80, 0, 0.25e-3);
    while (probe.position.z > -10) stepBBs(probePool, BALLISTICS, noWall, KILL_Y, [], DT, undefined, undefined, CROSSWIND);
    const drift = probe.position.x;
    expect(drift).toBeGreaterThan(HITS.bodyRadius + 0.2); // wide enough to tell the two lines apart

    expect(fireAt(drift, undefined)).toBe('alive'); // still air: the BB passes the target by
    expect(fireAt(drift, CROSSWIND)).toBe('calling'); // windy: carried into them
    expect(fireAt(0, CROSSWIND)).toBe('alive'); // and the one on the straight line is missed
    expect(fireAt(0, undefined)).toBe('calling');
  });

  it('gives a bounced BB no Magnus lift: its spin is scrubbed, so it flies on as an unspun BB would', () => {
    const open: WorldQuery = { raycastStatic: () => -1 };
    const bounce = () => {
      const pool = createBBPool(1);
      const bb = spawnBB(pool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0.12, 0.25e-3);
      for (let i = 0; i < 20 && bb.bounces === 0; i++) stepBBs(pool, BALLISTICS, hardWallAt(-12), KILL_Y, [], DT);
      expect(bb.bounces).toBe(1);
      return bb;
    };
    const bounced = bounce();
    expect(bounced.spin).toBe(0);
    // The same BB (position, velocity, age) with no hop-up at all, flown on in the same open air.
    const plain = createBBPool(1);
    const twin = spawnBB(plain, 0, bounced.position, vec3(0, 0, 1), 1, 0, bounced.mass);
    twin.velocity.x = bounced.velocity.x;
    twin.velocity.y = bounced.velocity.y;
    twin.velocity.z = bounced.velocity.z;
    const pool = { bbs: [bounced], nextSerial: 2 };
    for (let i = 0; i < 40; i++) {
      stepBBs(pool, BALLISTICS, open, KILL_Y, [], DT);
      stepBBs(plain, BALLISTICS, open, KILL_Y, [], DT);
    }
    expect(bounced.position.y).toBeCloseTo(twin.position.y, 9);
    expect(bounced.position.x).toBeCloseTo(twin.position.x, 9);
    // Control: a spun BB sent out the same way does climb away from the unspun one.
    const spunPool = createBBPool(1);
    const spun = spawnBB(spunPool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0.12, 0.25e-3);
    const unspunPool = createBBPool(1);
    const unspun = spawnBB(unspunPool, 0, vec3(0, 1.5, 0), vec3(0, 0, -1), 80, 0, 0.25e-3);
    for (let i = 0; i < 20; i++) {
      stepBBs(spunPool, BALLISTICS, open, KILL_Y, [], DT);
      stepBBs(unspunPool, BALLISTICS, open, KILL_Y, [], DT);
    }
    expect(spun.position.y - unspun.position.y).toBeGreaterThan(0.1);
  });
});

describe('BBs into sloping ground (M33c)', () => {
  /** The level ray as a world query, the way PhysicsWorld hands it to stepBBs. */
  function queryOf(blocks: readonly MapBlock[], terrain: Terrain | null = SLOPE_YARD_TERRAIN): WorldQuery {
    const level = buildLevelRay(blocks, 1, terrain);
    return {
      raycastStatic: (o, d, max) => castLevelRay(level, o, d, max),
      raycastSurface: (o, d, max, out) => castLevelRay(level, o, d, max, out),
    };
  }

  /** Fires one BB at 80 m/s from (x, y, z) at `pitch` degrees below the horizon along `yaw`, and flies it out. */
  function fire(query: WorldQuery, from: [number, number, number], yawDeg: number, pitchDeg: number) {
    const pool = createBBPool(1);
    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const bb = spawnBB(pool, 0, vec3(...from), vec3(Math.cos(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)), 80, 0.12, 0.25e-3);
    const events: GameEvent[] = [];
    for (let i = 0; i < 300 && bb.active; i++) stepBBs(pool, BALLISTICS, query, KILL_Y, events, DT);
    return { bb, impacts: events.filter((e) => e.type === 'bbImpact'), lost: events.filter((e) => e.type === 'bbLost') };
  }

  it('stops a BB where it meets the ground, even grazing, with no ricochet, and the impact is earth', () => {
    const query = queryOf(SLOPE_YARD.blocks);
    // Steeply down, grazing shots up the slope (1 to 3 degrees) that would skip off concrete, and one across it.
    for (const [from, yaw, pitch] of [
      [[-10, 1.5, 9], 0, 40],
      [[-10, 1.5, 9], 0, 3],
      [[-10, 1.5, 9], -20, 1],
      [[-12, -1, 12], -45, 2],
    ] as const) {
      const r = fire(query, [...from], yaw, pitch);
      const label = `from ${from} yaw ${yaw} pitch ${pitch}`;
      expect(r.bb.active, label).toBe(false);
      expect(r.bb.bounces, label).toBe(0);
      expect(r.lost, label).toHaveLength(0);
      expect(r.impacts, label).toHaveLength(1);
      const p = r.impacts[0]!.type === 'bbImpact' ? r.impacts[0]!.position : vec3();
      // It stopped on the ground itself, and what it hit sounds like earth.
      expect(p.y, label).toBeCloseTo(terrainHeightAt(SLOPE_YARD_TERRAIN, p.x, p.z)!, 3);
      expect(impactMaterialAt(SLOPE_YARD.blocks, p, SLOPE_YARD_TERRAIN), label).toBe('earth');
    }
  });

  it('is the ground that stops it: the same grazing shot skips off a concrete floor', () => {
    const floor: MapBlock = { kind: 'floor', center: vec3(0, -0.25, 0), size: vec3(40, 0.5, 40) };
    const r = fire(queryOf([floor], null), [-10, 0.2, 9], 0, 3);
    expect(r.bb.bounces).toBeGreaterThan(0);
  });
});

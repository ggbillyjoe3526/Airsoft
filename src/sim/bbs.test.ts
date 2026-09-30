import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { type HitConfig, HITS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import type { WorldQuery } from './armament';
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

describe('stepBBs out-of-world removal', () => {
  it('removes a BB that falls below killY before its lifetime ends', () => {
    const pool = createBBPool(1);
    // Fired straight down from just above the kill height, with no level to hit.
    const bb = spawnBB(pool, 0, vec3(0, KILL_Y + 1, 0), vec3(0, -1, 0), 60, 0);
    const events: GameEvent[] = [];
    for (let i = 0; i < 5; i++) stepBBs(pool, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, events, DT);
    expect(bb.active).toBe(false);
    expect(bb.age).toBeLessThan(BALLISTICS.maxLifetime);
    expect(events).toHaveLength(0);
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
    const bb = spawnBB(pool, shooter.id, vec3(0, 1.2, 0), vec3(0, 0, -1), 88, 0);
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
    spawnBB(pool, 1, vec3(0, 1.2, 0), vec3(0, 0, -1), 88, 0);
    spawnBB(pool, 1, vec3(0.6, 1.2, 0), vec3(0, 0, -1), 88, 0);
    for (let i = 0; i < 30; i++) stepBBs(pool, BALLISTICS, noWall, KILL_Y, [], DT, { characters, hits: HITS, elimination: openFieldElimination(zones) });
    expect(a.status).toBe('calling');
    expect(b.status).toBe('calling');
    expect(a.deadZoneTarget).not.toEqual(b.deadZoneTarget);
  });
});

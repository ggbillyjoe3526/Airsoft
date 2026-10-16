import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { HITS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import type { Bush } from '../map/foliage';
import type { WorldQuery } from './armament';
import { createBBPool, spawnBB } from './ballistics';
import { type BBTargets, stepBBs } from './bbs';
import { createCharacter } from './character';
import type { GameEvent } from './events';
import { createRng } from './rng';
import { openFieldElimination } from './testSupport';
import { length3, vec3 } from './vec';

/**
 * Dev 6 item 44: bushes stop BBs that push deep into them and throw off those that clip an edge. The BB step proper
 * (stepBBs) with a world of open air and bushes only, so nothing else stops a BB.
 */
const DT = 1 / 60;
const KILL_Y = -10;
const STOP = BALLISTICS.leaves.stopDepth;
/**
 * The game's BBs in near-vacuum with no gravity: they fly dead straight at a steady speed, so where they meet the leaves
 * is plain geometry and only the leaves slow them.
 */
const FLAT = { ...BALLISTICS, gravity: 0, air: { temperature: 20, pressure: 1 } };
const DEAD_ZONES = [[{ position: vec3(-30, 0, 30), yaw: 0 }], [{ position: vec3(30, 0, 30), yaw: 0 }]];

/** A bush 2.4 m across and 1.6 m tall straddling the line z = -10, its middle 1.3 m up (the BBs' height). */
const BUSH: Bush = { x: 0, y: 0.5, z: -10, radius: 1.2, height: 1.6 };

const airWith = (foliage: readonly Bush[]): WorldQuery => ({ raycastStatic: () => -1, foliage });

/**
 * One BB flown along -Z at 1.3 m from (x, 1.3, z0) until it stops or `ticks` pass. `scatter` false flies it with no random
 * stream, so leaves slow it but never turn it (deflectInLeaves).
 */
function fly(foliage: readonly Bush[], x = 0, ticks = 90, targets?: BBTargets, z0 = 0, scatter = true) {
  const pool = createBBPool(1);
  const bb = spawnBB(pool, 1, vec3(x, 1.3, z0), vec3(0, 0, -1), 88, 0, 0.25e-3);
  const events: GameEvent[] = [];
  const rng = scatter ? createRng(5) : undefined;
  for (let i = 0; i < ticks && bb.active; i++) stepBBs(pool, FLAT, airWith(foliage), KILL_Y, events, DT, targets, rng);
  return { bb, events };
}

describe('a bush stops a BB that pushes deep into it (Dev 6 item 44)', () => {
  it('stops it stopDepth into the leaves through the middle, and says it was the leaves', () => {
    const { bb, events } = fly([BUSH], 0, 90, undefined, 0, false);
    expect(bb.active).toBe(false);
    // In at z = -8.8, stopped STOP further on.
    expect(bb.position.z).toBeCloseTo(BUSH.z + BUSH.radius - STOP, 6);
    expect(bb.leaf).toBeCloseTo(STOP, 6);
    const impacts = events.filter((e) => e.type === 'bbImpact');
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({ type: 'bbImpact', ownerId: 1, leaves: true });
    expect(events.some((e) => e.type === 'bbLeaves')).toBe(false);
  });

  it('never reaches someone standing behind the bush', () => {
    const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
    const behind = createCharacter(2, vec3(0, 0, -13), 0, LOADOUT, 1);
    const targets: BBTargets = { characters: [shooter, behind], hits: HITS, elimination: openFieldElimination(DEAD_ZONES) };
    const { events } = fly([BUSH], 0, 90, targets);
    expect(behind.status).toBe('alive');
    expect(events.some((e) => e.type === 'characterHit')).toBe(false);
    // The control: with no bush the same BB knocks them out.
    const open = createCharacter(2, vec3(0, 0, -13), 0, LOADOUT, 1);
    fly([], 0, 90, { characters: [shooter, open], hits: HITS, elimination: openFieldElimination(DEAD_ZONES) });
    expect(open.status).not.toBe('alive');
  });

  it('still hits someone standing at the edge of the bush, before the leaves have stopped the BB', () => {
    const shooter = createCharacter(1, vec3(), 0, LOADOUT, 0);
    // Their body's front 0.25 m inside the leaves: less than the stop depth.
    const atEdge = createCharacter(2, vec3(0, 0, BUSH.z + BUSH.radius - 0.25 - HITS.bodyRadius), 0, LOADOUT, 1);
    const targets: BBTargets = { characters: [shooter, atEdge], hits: HITS, elimination: openFieldElimination(DEAD_ZONES) };
    const { events } = fly([BUSH], 0, 90, targets);
    expect(events.some((e) => e.type === 'characterHit' && e.victimId === 2)).toBe(true);
  });

  it('stops a BB fired from deep inside a bush before it gets out (you can’t shoot out of one you can’t see out of)', () => {
    const { bb, events } = fly([BUSH], 0, 90, undefined, BUSH.z, false);
    expect(bb.active).toBe(false);
    expect(bb.position.z).toBeCloseTo(BUSH.z - STOP, 6);
    expect(events.filter((e) => e.type === 'bbImpact' && e.leaves)).toHaveLength(1);
  });

  it('counts the leaves over the whole flight: two edges that add up to stopDepth stop it in the second', () => {
    // Two bushes off to the side so the line cuts a 0.4 m chord of each, one behind the other; unturned, so it meets both.
    const off = Math.sqrt(BUSH.radius ** 2 - 0.2 ** 2);
    const pair: Bush[] = [
      { ...BUSH, x: off },
      { ...BUSH, x: off, z: -16 },
    ];
    const { bb, events } = fly(pair, 0, 90, undefined, 0, false);
    expect(events.filter((e) => e.type === 'bbLeaves')).toHaveLength(1);
    expect(bb.active).toBe(false);
    expect(bb.position.z).toBeLessThan(-14);
    expect(bb.leaf).toBeCloseTo(STOP, 6);
  });
});

describe('a BB that clips the edge of a bush flies on, slowed and off its line (Dev 6 item 44)', () => {
  /** On a line 1.15 m to the side of the middle of a 1.2 m bush: a chord of 2√(1.2² − 1.15²) ≈ 0.69 m at its widest. */
  const EDGE_X = 1.17;

  /** One BB flown at the edge until it comes out of the bush (bbLeaves); `rng` turns it there. */
  function clip(rng?: ReturnType<typeof createRng>) {
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 1, vec3(EDGE_X, 1.3, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    for (let i = 0; i < 30 && bb.active && !events.some((e) => e.type === 'bbLeaves'); i++) stepBBs(pool, FLAT, airWith([BUSH]), KILL_Y, events, DT, undefined, rng);
    return { bb, events };
  }

  it('comes out where its path leaves the leaves, with what it crossed counted and slowed by it', () => {
    const chord = 2 * Math.sqrt(BUSH.radius ** 2 - EDGE_X ** 2);
    expect(chord).toBeLessThan(STOP);
    const { bb, events } = clip();
    expect(bb.active).toBe(true);
    // The far side of the chord, whether the crossing took one tick or two.
    expect(bb.position.z).toBeCloseTo(BUSH.z - chord / 2, 6);
    expect(bb.leaf).toBeCloseTo(chord, 6);
    // (Thin air still holds it back a hair: its viscous drag doesn't thin out with the air.)
    expect(length3(bb.velocity.x, bb.velocity.y, bb.velocity.z)).toBeCloseTo(88 * BALLISTICS.leaves.keptPerMetre ** chord, 1);
    expect(events.find((e) => e.type === 'bbLeaves')).toMatchObject({ type: 'bbLeaves', ownerId: 1 });
    // No impact in the bush: it flies on.
    expect(events.some((e) => e.type === 'bbImpact')).toBe(false);
  });

  it('is thrown off its line, by no more than scatterPerMetre × the leaves it crossed', () => {
    const chord = 2 * Math.sqrt(BUSH.radius ** 2 - EDGE_X ** 2);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { bb } = clip(createRng(seed));
      const v = bb.velocity;
      const turned = Math.acos(-v.z / length3(v.x, v.y, v.z));
      expect(turned).toBeGreaterThan(0);
      expect(turned).toBeLessThanOrEqual(BALLISTICS.leaves.scatterPerMetre * chord + 1e-9);
    }
  });

  it('flies on past a bush it misses, untouched, with no leaves counted', () => {
    const { bb, events } = fly([BUSH], BUSH.radius + 0.05, 20);
    expect(events).toHaveLength(0);
    expect(bb.leaf).toBe(0);
    expect(bb.velocity.x).toBe(0);
  });

  it('plays exactly as before on a map with no bushes', () => {
    const plain = createBBPool(1);
    const leafless = createBBPool(1);
    const a = spawnBB(plain, 1, vec3(0, 1.3, 0), vec3(0, 0, -1), 88, 0.1, 0.25e-3);
    const b = spawnBB(leafless, 1, vec3(0, 1.3, 0), vec3(0, 0, -1), 88, 0.1, 0.25e-3);
    const ea: GameEvent[] = [];
    const eb: GameEvent[] = [];
    for (let i = 0; i < 60; i++) {
      stepBBs(plain, BALLISTICS, { raycastStatic: () => -1 }, KILL_Y, ea, DT, undefined, createRng(1));
      stepBBs(leafless, BALLISTICS, airWith([]), KILL_Y, eb, DT, undefined, createRng(1));
    }
    expect(b.position).toEqual(a.position);
    expect(b.velocity).toEqual(a.velocity);
    expect(eb).toEqual(ea);
  });
});

describe('a BB that meets a wall while still among the leaves (KI1)', () => {
  /** A concrete wall across the line at z = -9.2, facing the shooter: 0.35 m into the bush, short of the stop depth. */
  const WALL_Z = -9.2;
  const wallIn = (foliage: readonly Bush[]): WorldQuery => ({
    raycastStatic: () => -1,
    raycastSurface: (origin, dir, maxDist, out) => {
      if (dir.z >= 0 || origin.z <= WALL_Z) return -1;
      const t = (origin.z - WALL_Z) / -dir.z;
      if (t > maxDist) return -1;
      out.normal.x = 0;
      out.normal.y = 0;
      out.normal.z = 1;
      out.material = 'concrete';
      return t;
    },
    foliage,
  });

  /** One BB from just inside the bush's near side, flown one tick: it crosses 0.35 m of leaves and bounces off the wall. */
  function bounce(foliage: readonly Bush[]) {
    const pool = createBBPool(1);
    const bb = spawnBB(pool, 1, vec3(0, 1.3, BUSH.z + BUSH.radius - 0.05), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const events: GameEvent[] = [];
    stepBBs(pool, FLAT, wallIn(foliage), KILL_Y, events, DT);
    return { bb, events };
  }

  it('counts the leaves it crossed before the wall, and they slow it before it bounces', () => {
    const crossed = BUSH.z + BUSH.radius - 0.05 - WALL_Z;
    expect(crossed).toBeLessThan(STOP);
    const inBush = bounce([BUSH]);
    const open = bounce([]);
    expect(inBush.bb.active).toBe(true);
    expect(inBush.bb.bounces).toBe(1);
    expect(inBush.bb.leaf).toBeCloseTo(crossed, 6);
    expect(open.bb.leaf).toBe(0);
    const speed = (v: { x: number; y: number; z: number }) => length3(v.x, v.y, v.z);
    expect(speed(inBush.bb.velocity) / speed(open.bb.velocity)).toBeCloseTo(BALLISTICS.leaves.keptPerMetre ** crossed, 3);
    expect(inBush.events.filter((e) => e.type === 'bbImpact')).toHaveLength(1);
  });
});

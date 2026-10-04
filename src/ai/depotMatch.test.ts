import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, botConfig } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { NAV } from '../config/nav';
import { SQUAD_ORDERS } from '../config/squad';
import { DEPOT } from '../map/depot';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { initPhysics } from '../physics/physicsWorld';
import { vec3 } from '../sim/vec';
import { expectGrounded, playFollowMatch, playMatch } from './depotMatchSupport';

// The short headless match checks. The long multi-seed guards each have their own depotMatch.*.test.ts file, so
// vitest runs them in parallel; the harness is in depotMatchSupport.ts.

describe('a 3v3 bot match on Depot', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds: bots leave spawn, find each other, and eliminate a team', { timeout: 30_000 }, () => {
    // 260 s: on the M11 Depot this seed's first round is a long last-man hunt (93 s; KNOWN_ISSUES), and since bots
    // hear less through walls (M22) rounds run about a quarter longer (normal: 27 s → 34 s on average over seeds 1-6).
    const stats = playMatch(260, 11);
    expect(stats.rounds).toBeGreaterThanOrEqual(3);
    expect(stats.hits).toBeGreaterThanOrEqual(stats.rounds * 3);
    // Every bot got well out of its spawn yard in round 1 (nobody stuck at spawn).
    for (const d of stats.farthestFromSpawn) expect(d).toBeGreaterThan(8);
    // Shots per hit: bots aren't laser-accurate, but they aren't spraying blindly either.
    expect(stats.shots / stats.hits).toBeGreaterThan(1.5);
    expectGrounded(stats, DEPOT);
  });

  it('plays out rounds at every difficulty', { timeout: 60_000 }, () => {
    for (const level of ['easy', 'hard'] as const) {
      const stats = playMatch(120, 4, undefined, botConfig(level));
      expect(stats.rounds, level).toBeGreaterThanOrEqual(2);
      expect(stats.friendlyHits, level).toBe(0);
    }
  });

  it('has bot teammates follow a leader round Depot without being left behind (squad orders, M22)', { timeout: 60_000 }, () => {
    for (const seed of [1, 2, 3]) {
      const { counted, near, worst, standing } = playFollowMatch(90, seed);
      // Measured (seeds 1-3): 90-98% of the time within a few metres of their spot, at worst about 10 m behind (a
      // sprinting leader round corners: a sprint can't catch a sprint), and standing still under 2% of the time the
      // leader moves (one that got ahead of its spot waiting for it).
      expect(counted, `seed ${seed}`).toBeGreaterThan(1000);
      expect(near / counted, `seed ${seed}`).toBeGreaterThan(0.85);
      expect(worst, `seed ${seed}`).toBeLessThan(SQUAD_ORDERS.catchUp + 3);
      expect(standing / counted, `seed ${seed}`).toBeLessThan(0.03);
    }
  });

  it('never has bots hit their own teammates', { timeout: 30_000 }, () => {
    for (const seed of [2, 3]) expect(playMatch(90, seed).friendlyHits).toBe(0);
  });

  it('hunt down a player hiding off their routes, so a round never stalls', { timeout: 30_000 }, () => {
    const nav = buildNavGrid(DEPOT, NAV);
    // Deep in the west spawn yard, and behind the car park's container, with Orange starting in the east.
    const orangeEast = { ...ROUNDS, eliminationFirstEnd: 0 };
    for (const spot of [vec3(-24.1, 0, -4.3), vec3(-13, 0, 15.4)]) {
      expect(isWalkableAt(nav, spot.x, spot.z), `${spot.x},${spot.z} walkable`).toBe(true);
      const stats = playMatch(120, 5, spot, BOTS, 'elimination', orangeEast);
      expect(stats.firstRoundEnd, `hider at ${spot.x},${spot.z}`).toBeGreaterThan(0);
      expect(stats.firstRoundEnd).toBeLessThan(90);
    }
  });
});

describe('a 3v3 Attack / Defend match on Depot', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('attackers raise their flag when nobody stops them', { timeout: 30_000 }, () => {
    // Orange attacks first (from the west end); Blue is one player hiding in the back lot's far corner.
    const rules = { ...ROUNDS, flag: { ...ROUNDS.flag, firstAttackers: 1 } };
    const stats = playMatch(60, 1, vec3(24.4, 0, 15.4), BOTS, 'attackDefend', rules);
    expect(stats.results[0]).toMatchObject({ attackers: 1, winner: 1, reason: 'captured' });
    expect(stats.results[0]!.length).toBeLessThan(35);
  });

  it('defenders win on time when the attackers never come for the pole', { timeout: 30_000 }, () => {
    // Blue attacks with one player who stays hidden in the spawn yard's corner, far from the pole: the
    // defending bots hold their posts (it's further than defendSearchRadius) and the clock runs out.
    const rules = { ...ROUNDS, roundTime: 30 };
    const stats = playMatch(32, 2, vec3(-24.1, 0, -4.3), BOTS, 'attackDefend', rules);
    expect(stats.results[0]).toMatchObject({ attackers: 0, winner: 1, reason: 'time' });
  });
});

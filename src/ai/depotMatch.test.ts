import { beforeAll, describe, expect, it } from 'vitest';
import { BOTS, botConfig } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { NAV } from '../config/nav';
import { SQUAD_ORDERS } from '../config/squad';
import { DEPOT } from '../map/depot';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { initPhysics } from '../physics/physicsWorld';
import { vec3 } from '../sim/vec';
import { botKitSeed, kittedCharacter, randomKit } from '../pool/botKit';
import { GAME_POOL } from '../pool/gamePool';
import { LOADOUT } from '../config/replicas';
import { shotHeardScale } from '../sim/armament';
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
    // Since the 2026-10-04 bug pass (sprinting as soon as a lean key is let go; racks soak BBs up) this seed has two
    // long hunts and plays 2 rounds; over seeds 1-16 matches play more rounds than before it (74 vs 67 in 260 s).
    const stats = playMatch(260, 11);
    expect(stats.rounds).toBeGreaterThanOrEqual(2);
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
    for (const seed of [1, 2, 3, 4]) {
      const { counted, near, worst, standing } = playFollowMatch(90, seed);
      // Measured 2026-10-04 (seeds 1-4, after M-05/M-08: no follow spot behind a wall): within a few metres of the
      // leader all the time, at worst 5.3-6.9 m away (a sprinting leader round corners: a sprint can't catch a
      // sprint), and standing still 0.7-1.8% of the time the leader moves (one that got ahead of its spot waiting for
      // it; 1.0-2.6% before the bug pass let spots lie along the dock ramps). Before M-05, a follower sent round a wall
      // to a spot on its far side ended up to 10.9 m away. Re-measured with the M25b props (2026-10-04): at worst
      // 5.3-6.7 m, standing 1.1-3.2% (seed 1 the most), 1,162-7,799 ticks judged.
      expect(counted, `seed ${seed}`).toBeGreaterThan(1000);
      expect(near / counted, `seed ${seed}`).toBeGreaterThan(0.95);
      expect(worst, `seed ${seed}`).toBeLessThan(SQUAD_ORDERS.catchUp);
      expect(standing / counted, `seed ${seed}`).toBeLessThan(0.04);
    }
  });

  it('plays out rounds with the other team on rolled kits of their own, every part fitted (Hard, M29b)', { timeout: 60_000 }, () => {
    const seed = 4;
    const kits = new Map<number, ReturnType<typeof kittedCharacter>>();
    const stats = playMatch(120, seed, undefined, botConfig('hard'), 'elimination', ROUNDS, DEPOT, ROUNDS.teamSize, undefined, () => {}, (id, team) => {
      if (team !== 1) return undefined;
      const c = kittedCharacter(id, team, randomKit(GAME_POOL, LOADOUT, botKitSeed(seed, id), 1));
      kits.set(id, c);
      return c;
    });
    expect(kits.size).toBe(ROUNDS.teamSize);
    // With a chance of 1 every slot a part fits is filled: the AEG carries a barrel and a silencer, the pistol a silencer.
    for (const c of kits.values()) {
      expect(c.armament.parts[0]!.muzzle, `bot ${c.id}`).toBe('silencer');
      expect(c.armament.parts[0]!.barrel).not.toBeNull();
      expect(shotHeardScale(c)).toBe(0.5);
      for (const r of c.armament.replicas) expect(r.muzzleEnergy).toBeLessThanOrEqual(r.energyLimit + 1e-9);
    }
    expect(stats.rounds).toBeGreaterThanOrEqual(2);
    expect(stats.shots).toBeGreaterThan(0);
    expect(stats.friendlyHits).toBe(0);
    expectGrounded(stats, DEPOT);
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

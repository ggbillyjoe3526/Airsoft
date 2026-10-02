import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS, type BotConfig, botConfig } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import type { MatchMode } from '../config/modes';
import { FOOTSTEPS } from '../config/footsteps';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import type { RoundRules } from '../sim/round';
import { createGameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { BotController } from './botController';
import { lowCoverBlocks, tallCoverBlocks } from './cover';

const DT = 1 / 60;

/**
 * A 3v3 on Depot with real physics, headless. By default all six are bots; with `hider`, Blue is a
 * single non-bot player standing still at that spot (hiding) against three Orange bots.
 */
function playMatch(seconds: number, seed: number, hider?: Vec3, cfg: BotConfig = BOTS, mode: MatchMode = 'elimination', rules: RoundRules = ROUNDS) {
  const physics = new PhysicsWorld(DEPOT, BODY, DT);
  const nav = buildNavGrid(DEPOT, NAV);
  const state = createGameState(seed, BALLISTICS.maxBBs, rules, mode, DEPOT.flags);
  let id = 0;
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < ROUNDS.teamSize; i++) {
      if (hider && team === 0 && i > 0) continue;
      const s = DEPOT.spawns[team]![i]!;
      const at = hider && team === 0 ? hider : s.position;
      const c = createCharacter(id++, vec3(at.x, at.y + PHYSICS.groundRestGap, at.z), s.yaw, LOADOUT, team);
      state.characters.push(c);
      physics.addCharacter(c);
    }
  }
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    loadout: LOADOUT,
    killY: DEPOT.killY,
    hits: HITS,
    deadZones: DEPOT.deadZones,
    nav,
    navSnap: NAV.snap,
    rounds: rules,
    flagSpots: DEPOT.flags,
  });
  const commands = new Map<number, PlayerCommand>();
  const bots = new BotController(state, hider ? state.characters.filter((c) => c.team === 1) : state.characters, commands, {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: DEPOT.lanes,
    lowCover: lowCoverBlocks(DEPOT.blocks, BODY, BOTS.lowCoverFloorGap),
    tallCover: tallCoverBlocks(DEPOT.blocks, BODY, BOTS.lowCoverFloorGap),
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg,
    seed,
  });

  const stats = {
    rounds: 0,
    shots: 0,
    hits: 0,
    friendlyHits: 0,
    firstRoundEnd: -1,
    roundEnds: [] as number[],
    farthestFromSpawn: state.characters.map(() => 0),
    /** Per finished round: who attacked, who won and why (flag mode). */
    results: [] as { attackers: number; winner: number; reason: string; length: number }[],
    /** Most of the flag raised in any round. */
    maxFlag: 0,
    /**
     * Ticks someone in play spent off the ground during a live round, after the first half second (spawning
     * drops you onto the floor). Nobody here jumps, so any is a lost ground contact, which would spike
     * that character's spread to the in-air value.
     */
    airTicks: 0,
  };
  let roundStart = 0;
  for (let tick = 0; tick < seconds / DT; tick++) {
    bots.think(state, DT);
    stepSimulation(state, commands, ctx, DT);
    bots.observe(state);
    for (const e of state.events) {
      if (e.type === 'roundStart') roundStart = state.time;
      if (e.type === 'roundOver') {
        stats.results.push({ attackers: state.round.attackers, winner: e.winner, reason: e.reason, length: state.time - roundStart });
        stats.rounds++;
        stats.roundEnds.push(state.time);
        if (stats.firstRoundEnd < 0) stats.firstRoundEnd = state.time;
      }
      if (e.type === 'shot') stats.shots++;
      if (e.type === 'characterHit') {
        stats.hits++;
        const v = state.characters.find((c) => c.id === e.victimId)!;
        const s = state.characters.find((c) => c.id === e.shooterId)!;
        if (v.team === s.team) stats.friendlyHits++;
      }
    }
    stats.maxFlag = Math.max(stats.maxFlag, state.round.flag.progress);
    if (state.round.phase === 'live' && state.time - roundStart > 0.5) {
      for (const c of state.characters) if (c.status === 'alive' && !c.grounded) stats.airTicks++;
    }
    if (state.round.number === 1) {
      for (const [i, c] of state.characters.entries()) {
        const d = Math.hypot(c.position.x - c.spawnPosition.x, c.position.z - c.spawnPosition.z);
        stats.farthestFromSpawn[i] = Math.max(stats.farthestFromSpawn[i]!, d);
      }
    }
  }
  physics.dispose();
  return stats;
}

describe('a 3v3 bot match on Depot', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds: bots leave spawn, find each other, and eliminate a team', { timeout: 30_000 }, () => {
    const stats = playMatch(150, 11);
    expect(stats.rounds).toBeGreaterThanOrEqual(3);
    expect(stats.hits).toBeGreaterThanOrEqual(stats.rounds * 3);
    // Every bot got well out of its spawn yard in round 1 (nobody stuck at spawn).
    for (const d of stats.farthestFromSpawn) expect(d).toBeGreaterThan(8);
    // Shots per hit: bots aren't laser-accurate, but they aren't spraying blindly either.
    expect(stats.shots / stats.hits).toBeGreaterThan(1.5);
    // Walking round Depot never loses the ground for a tick (accuracy would flash to its in-air value).
    expect(stats.airTicks).toBe(0);
  });

  it('plays out rounds at every difficulty', { timeout: 60_000 }, () => {
    for (const level of ['easy', 'hard'] as const) {
      const stats = playMatch(120, 4, undefined, botConfig(level));
      expect(stats.rounds, level).toBeGreaterThanOrEqual(2);
      expect(stats.friendlyHits, level).toBe(0);
    }
  });

  it('never has bots hit their own teammates', { timeout: 30_000 }, () => {
    for (const seed of [2, 3]) expect(playMatch(90, seed).friendlyHits).toBe(0);
  });

  it('hunt down a player hiding off their routes, so a round never stalls', { timeout: 30_000 }, () => {
    const nav = buildNavGrid(DEPOT, NAV);
    // Deep in the Blue spawn yard, and in the far corner of the Blue office side room.
    for (const spot of [vec3(-24.1, 0, 4.3), vec3(-13, 0, -15.4)]) {
      expect(isWalkableAt(nav, spot.x, spot.z), `${spot.x},${spot.z} walkable`).toBe(true);
      const stats = playMatch(120, 5, spot);
      expect(stats.firstRoundEnd, `hider at ${spot.x},${spot.z}`).toBeGreaterThan(0);
      expect(stats.firstRoundEnd).toBeLessThan(90);
    }
  });
});


describe('a 3v3 Attack / Defend match on Depot', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds where the pole matters: flags go up, some rounds are won by raising one, roles swap at half-time', { timeout: 300_000 }, () => {
    let rounds = 0;
    let captures = 0;
    let attackWins = 0;
    let flagsRaised = 0;
    let friendlyHits = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(400, seed, undefined, BOTS, 'attackDefend');
      friendlyHits += stats.friendlyHits;
      // Rounds 1-4 Blue attacks, then Orange.
      expect(stats.results.map((r) => r.attackers)).toEqual(stats.results.map((_, i) => (i < ROUNDS.flag.halfTimeAfter ? 0 : 1)));
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'captured') captures++;
        if (r.winner === r.attackers) attackWins++;
        expect(r.length).toBeLessThanOrEqual(ROUNDS.roundTime + ROUNDS.flag.maxOvertime + 0.1); // overtime may run past the clock
      }
      if (stats.maxFlag >= 1) flagsRaised++;
    }
    // Measured (M10: accuracy by stance and movement, bots leaning round corners; 16 seeds): 21 captures in
    // 119 rounds, a flag raised in 12 of 16 matches, attackers winning 59%, no friendly hits. Bots check
    // their line of fire, but a teammate dodging into a BB already in the air can't always be helped
    // (KNOWN_ISSUES). Re-measure and update DECISIONS with this test after any bot tuning change.
    expect(friendlyHits).toBeLessThanOrEqual(1);
    expect(captures).toBeGreaterThanOrEqual(9);
    expect(captures / rounds).toBeGreaterThan(0.07);
    expect(flagsRaised).toBeGreaterThanOrEqual(5);
    expect(attackWins / rounds).toBeGreaterThan(0.38);
    expect(attackWins / rounds).toBeLessThan(0.62);
  });

  it('attackers raise their flag when nobody stops them', { timeout: 30_000 }, () => {
    // Orange attacks first; Blue is one player hiding in the spawn yard's corner.
    const rules = { ...ROUNDS, flag: { ...ROUNDS.flag, firstAttackers: 1 } };
    const stats = playMatch(60, 1, vec3(-24.1, 0, 4.3), BOTS, 'attackDefend', rules);
    expect(stats.results[0]).toMatchObject({ attackers: 1, winner: 1, reason: 'captured' });
    expect(stats.results[0]!.length).toBeLessThan(35);
  });

  it('defenders win on time when the attackers never come for the pole', { timeout: 30_000 }, () => {
    // Blue attacks with one player who stays hidden in the spawn yard's corner, far from the pole: the
    // defending bots hold their posts (it's further than defendSearchRadius) and the clock runs out.
    const rules = { ...ROUNDS, roundTime: 30 };
    const stats = playMatch(32, 2, vec3(-24.1, 0, 4.3), BOTS, 'attackDefend', rules);
    expect(stats.results[0]).toMatchObject({ attackers: 0, winner: 1, reason: 'time' });
  });
});

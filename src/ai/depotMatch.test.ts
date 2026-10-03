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
import type { MapData } from '../map/mapTypes';
import { RAMP_YARD } from '../map/testYard';
import { buildNavGrid, isWalkableAt } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter, respawnCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { placeTeams, type RoundRules } from '../sim/round';
import { createGameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { BotController } from './botController';
import { lowCoverBlocks, tallCoverBlocks } from './cover';

const DT = 1 / 60;

/**
 * A 3v3 on Depot (or `map`) with real physics, headless. By default all six are bots; with `hider`, Blue
 * is a single non-bot player standing still at that spot (hiding) against three Orange bots.
 */
function playMatch(seconds: number, seed: number, hider?: Vec3, cfg: BotConfig = BOTS, mode: MatchMode = 'elimination', rules: RoundRules = ROUNDS, map: MapData = DEPOT) {
  const physics = new PhysicsWorld(map, BODY, DT);
  const nav = buildNavGrid(map, NAV);
  const state = createGameState(seed, BALLISTICS.maxBBs, rules, mode, map.flag);
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    loadout: LOADOUT,
    killY: map.killY,
    hits: HITS,
    deadZones: map.deadZones,
    spawns: map.spawns,
    spawnLift: PHYSICS.groundRestGap,
    nav,
    navSnap: NAV.snap,
    rounds: rules,
    pole: map.flag,
  });
  let id = 0;
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < (hider && team === 0 ? 1 : ROUNDS.teamSize); i++) state.characters.push(createCharacter(id++, vec3(), 0, LOADOUT, team));
  }
  // Round 1 as the game starts it: each team at its end; a hider stands at its spot instead.
  placeTeams(state.round, state.characters, ctx.round);
  for (const c of state.characters) {
    respawnCharacter(c, LOADOUT);
    if (hider && c.team === 0) c.position = vec3(hider.x, hider.y + PHYSICS.groundRestGap, hider.z);
    physics.addCharacter(c);
  }
  const commands = new Map<number, PlayerCommand>();
  const bots = new BotController(state, hider ? state.characters.filter((c) => c.team === 1) : state.characters, commands, {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: map.lanes,
    lowCover: lowCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    tallCover: tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
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
    /** Per finished round: who attacked (and from which end), who won (and from which end) and why. */
    results: [] as { attackers: number; attackerEnd: number; blueEnd: number; winner: number; winnerEnd: number; reason: string; length: number }[],
    /** Most of the flag raised in any round. */
    maxFlag: 0,
    /**
     * Longest run of ticks anyone in play spent off the ground during a live round, after the first half
     * second (spawning drops you onto the floor). Nobody here jumps, so any is a lost ground contact; one
     * longer than accuracy.airSpreadDelay would spike that character's spread to the in-air value.
     */
    longestAir: 0,
    /** Lowest and highest anyone stood during live rounds (after the first half second). */
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    /** Highest anyone still in play stood. */
    maxAliveY: Number.NEGATIVE_INFINITY,
    /** Walk-offs that reached the dead zone on foot: where the hit happened and where the walk ended. */
    walkOffs: [] as { fromY: number; to: Vec3 }[],
  };
  const airStreak = state.characters.map(() => 0);
  const hitY = state.characters.map(() => 0);
  const lastStatus = state.characters.map((c) => c.status);
  let roundStart = 0;
  for (let tick = 0; tick < seconds / DT; tick++) {
    bots.think(state, DT);
    stepSimulation(state, commands, ctx, DT);
    bots.observe(state);
    for (const e of state.events) {
      if (e.type === 'roundStart') roundStart = state.time;
      if (e.type === 'roundOver') {
        const endOf = (team: number) => state.characters.find((c) => c.team === team)?.end ?? -1;
        stats.results.push({ attackers: state.round.attackers, attackerEnd: endOf(state.round.attackers), blueEnd: endOf(0), winner: e.winner, winnerEnd: endOf(e.winner), reason: e.reason, length: state.time - roundStart });
        stats.rounds++;
        stats.roundEnds.push(state.time);
        if (stats.firstRoundEnd < 0) stats.firstRoundEnd = state.time;
      }
      if (e.type === 'shot') stats.shots++;
      if (e.type === 'characterHit') {
        stats.hits++;
        const v = state.characters.find((c) => c.id === e.victimId)!;
        hitY[state.characters.indexOf(v)] = v.position.y;
        const s = state.characters.find((c) => c.id === e.shooterId)!;
        if (v.team === s.team) stats.friendlyHits++;
      }
    }
    stats.maxFlag = Math.max(stats.maxFlag, state.round.flag.progress);
    if (state.round.phase === 'live' && state.time - roundStart > 0.5) {
      for (const [i, c] of state.characters.entries()) {
        airStreak[i] = c.status === 'alive' && !c.grounded ? airStreak[i]! + 1 : 0;
        stats.longestAir = Math.max(stats.longestAir, airStreak[i]!);
        stats.minY = Math.min(stats.minY, c.position.y);
        stats.maxY = Math.max(stats.maxY, c.position.y);
        if (c.status === 'alive') stats.maxAliveY = Math.max(stats.maxAliveY, c.position.y);
      }
    }
    for (const [i, c] of state.characters.entries()) {
      if (c.status === 'out' && lastStatus[i] === 'walkingOff') stats.walkOffs.push({ fromY: hitY[i]!, to: vec3(c.position.x, c.position.y, c.position.z) });
      lastStatus[i] = c.status;
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

/**
 * Nobody in play is off the ground for longer than the in-air spread's delay (a lost ground contact would
 * spike their spread), and nobody goes below the map's lowest floor or more than 2 m over its highest.
 */
function expectGrounded(stats: ReturnType<typeof playMatch>, map: MapData): void {
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  for (const f of buildNavGrid(map, NAV).floorY) {
    if (Number.isNaN(f)) continue;
    lowest = Math.min(lowest, f);
    highest = Math.max(highest, f);
  }
  expect(stats.longestAir * DT, map.name).toBeLessThanOrEqual(MOVEMENT.accuracy.airSpreadDelay + 1e-9);
  expect(stats.minY, map.name).toBeGreaterThanOrEqual(lowest);
  expect(stats.maxY, map.name).toBeLessThanOrEqual(highest + 2);
}

describe('a 3v3 bot match on Depot', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds: bots leave spawn, find each other, and eliminate a team', { timeout: 30_000 }, () => {
    // 200 s: on the M11 Depot this seed's first round is a long last-man hunt (93 s; KNOWN_ISSUES).
    const stats = playMatch(200, 11);
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

  it('keeps the ends close enough: Blue starts in the east, ends swap at half-time, and the west end still wins its share', { timeout: 300_000 }, () => {
    let decided = 0;
    let westWins = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(300, seed);
      // Blue (team 0) starts at the east end (end 1) for rounds 1-4, then the west.
      expect(stats.results.map((r) => r.blueEnd)).toEqual(stats.results.map((_, i) => (i < ROUNDS.halfTimeAfter ? 1 : 0)));
      for (const r of stats.results) {
        if (r.winner < 0) continue;
        decided++;
        if (r.winnerEnd === 0) westWins++;
      }
    }
    // Measured on the M11 Depot (2026-10-03): the west end wins 40% of the decided rounds here (46 of 114) and
    // 46% over seeds 1-96. The east end is stronger (KNOWN_ISSUES); the end swap evens out a match. Re-measure with this test after any layout or bot change.
    expect(westWins / decided).toBeGreaterThan(0.35);
    expect(westWins / decided).toBeLessThan(0.6);
  });
});


describe('a 3v3 Attack / Defend match on Depot', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds where the pole matters: flags go up, some rounds are won by raising one, roles and ends swap at half-time', { timeout: 300_000 }, () => {
    let rounds = 0;
    let captures = 0;
    let attackWins = 0;
    let flagsRaised = 0;
    let friendlyHits = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const stats = playMatch(400, seed, undefined, BOTS, 'attackDefend');
      friendlyHits += stats.friendlyHits;
      // Rounds 1-4 Blue attacks, then Orange; the attackers always start at the west end.
      expect(stats.results.map((r) => r.attackers)).toEqual(stats.results.map((_, i) => (i < ROUNDS.halfTimeAfter ? 0 : 1)));
      expect(stats.results.every((r) => r.attackerEnd === 0)).toBe(true);
      for (const r of stats.results) {
        rounds++;
        if (r.reason === 'captured') captures++;
        if (r.winner === r.attackers) attackWins++;
        expect(r.length).toBeLessThanOrEqual(ROUNDS.roundTime + ROUNDS.flag.maxOvertime + 0.1); // overtime may run past the clock
      }
      if (stats.maxFlag >= 1) flagsRaised++;
    }
    // Measured on the M11 Depot with M12c's hop-up (2026-10-03; 16 seeds): 15 captures in 126 rounds, a flag
    // raised in 10 of 16 matches, attackers winning 51%, no friendly hits. Over seeds 1-96 attackers win 50%
    // (107 captures in 736 rounds); the old mirrored Depot measured 53%. Bots check their line of fire, but a teammate dodging into
    // a BB already in the air can't always be helped (KNOWN_ISSUES).
    // Re-measure and update DECISIONS with this test after any bot tuning change.
    expect(friendlyHits).toBeLessThanOrEqual(1);
    expect(captures).toBeGreaterThanOrEqual(9);
    expect(captures / rounds).toBeGreaterThan(0.07);
    expect(flagsRaised).toBeGreaterThanOrEqual(5);
    expect(attackWins / rounds).toBeGreaterThan(0.38);
    expect(attackWins / rounds).toBeLessThan(0.67);
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

describe('a 3v3 bot match on the Ramp Yard', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('plays out rounds over a ramp: bots reach the upper level, walk-offs come down to the dead zone, nobody steps off an open edge', { timeout: 60_000 }, () => {
    // Fighting bots sidestep along the platform's open edges: before they checked for drops, 4 of these
    // 6 seeds had one fall off (13-18 ticks in the air).
    const spots = RAMP_YARD.deadZones.flat().map((s) => s.position);
    let walkedDown = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const stats = playMatch(60, seed, undefined, BOTS, 'elimination', ROUNDS, RAMP_YARD);
      expect(stats.rounds, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      // Someone still in play stood on the platform (1 m up).
      expect(stats.maxAliveY, `seed ${seed}`).toBeGreaterThan(1);
      // Everyone hit on the platform walked all the way to a dead-zone spot on the floor below.
      const down = stats.walkOffs.filter((w) => w.fromY > 1 && w.to.y < 0.1);
      walkedDown += down.length;
      for (const w of down) expect(Math.min(...spots.map((p) => Math.hypot(p.x - w.to.x, p.z - w.to.z))), `seed ${seed}`).toBeLessThanOrEqual(HITS.deadZoneArrive);
      expectGrounded(stats, RAMP_YARD);
    }
    expect(walkedDown).toBeGreaterThan(0);
  });
});

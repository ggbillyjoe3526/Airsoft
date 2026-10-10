import { expect } from 'vitest';
import { BALLISTICS, WIND } from '../config/ballistics';
import { BOTS, type BotConfig } from '../config/bots';
import { type HitConfig, HITS, ROUNDS } from '../config/hits';
import type { MatchMode } from '../config/modes';
import { FOOTSTEPS } from '../config/footsteps';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { SQUAD_ORDERS } from '../config/squad';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { buildNavGrid } from '../nav/navGrid';
import { PhysicsWorld } from '../physics/physicsWorld';
import { botLight, fitBotLight } from '../pool/botKit';
import { contentPool } from '../pool/contentPool';
import { GAME_POOL } from '../pool/gamePool';
import { type Character, createCharacter, respawnCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createWind } from '../sim/wind';
import { placeTeams, type RoundRules } from '../sim/round';
import { createGameState, type GameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { BotController } from './botController';
import { lowCoverBlocks, tallCoverBlocks } from './cover';
import { sightConditionsOf } from './perception';

/**
 * Test-only (like sim/testSupport.ts): the headless bot-match harness shared by the depotMatch*.test.ts files. The
 * long multi-seed guards each live in their own file so vitest runs them in parallel (it never parallelises inside
 * a file). Call `initPhysics()` before `playMatch`.
 */

export const DT = 1 / 60;

/** What the headless bots carry from: the game's pool with Dev content on, as both night maps (dev content) need it. */
const BOT_POOL = contentPool(GAME_POOL, true);

/**
 * On a night field every bot carries the offered torch, by rule, as the match build fits it (M33h, matchSession.ts
 * spawnRoster): fitted to each of `bots` as a match is set up. The headless guards played night maps without until M57
 * (audit AI-02), so their bands measured a game nobody plays.
 */
export function fitNightTorches(bots: readonly Character[]): void {
  const light = botLight(BOT_POOL);
  for (const c of bots) fitBotLight(c, BOT_POOL, light);
}

/**
 * A 3v3 on Depot (or `map`) with real physics, headless. By default all six are bots; with `hider`, Blue
 * is a single non-bot player standing still at that spot (hiding) against three Orange bots. `onTick` runs after
 * each tick, while its events are in the state.
 */
export function playMatch(
  seconds: number,
  seed: number,
  hider?: Vec3,
  cfg: BotConfig = BOTS,
  mode: MatchMode = 'elimination',
  rules: RoundRules = ROUNDS,
  map: MapData = DEPOT,
  teamSize: number = ROUNDS.teamSize,
  hits: HitConfig = HITS,
  onTick: (state: GameState, bots: BotController) => void = () => {},
  /** Who carries something other than the default loadout (a bot's rolled kit, M29b): its character, or undefined for the default. */
  carry: (id: number, team: number) => Character | undefined = () => undefined,
  /** Every bot carries the weapon torch (fitNightTorches): by default on a night field, as the game fits it (M57, audit AI-02). */
  torches: boolean = map.night === true,
) {
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
    wind: createWind(seed, WIND),
    killY: map.killY,
    hits,
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
    for (let i = 0; i < (hider && team === 0 ? 1 : teamSize); i++) {
      state.characters.push(carry(id, team) ?? createCharacter(id, vec3(), 0, LOADOUT, team));
      id++;
    }
  }
  const botCharacters = hider ? state.characters.filter((c) => c.team === 1) : state.characters;
  if (torches) fitNightTorches(botCharacters);
  // Round 1 as the game starts it: each team at its end; a hider stands at its spot instead.
  placeTeams(state.round, state.characters, ctx.round);
  for (const c of state.characters) {
    respawnCharacter(c);
    if (hider && c.team === 0) c.position = vec3(hider.x, hider.y + PHYSICS.groundRestGap, hider.z);
    physics.addCharacter(c);
  }
  const commands = new Map<number, PlayerCommand>();
  const bots = new BotController(state, botCharacters, commands, {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: map.lanes,
    lowCover: lowCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    tallCover: tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    sight: sightConditionsOf(map),
    body: BODY,
    hits,
    loadout: LOADOUT,
    cfg,
    seed,
  });

  const stats = {
    rounds: 0,
    shots: 0,
    hits: 0,
    friendlyHits: 0,
    /** Hits by a BB that had bounced (they only knock out when the match counts ricochets), and ticks that didn't. */
    ricochetHits: 0,
    friendlyRicochets: 0,
    /** Hits by the shooter's own ricochet (audit SIM-07); not counted in friendlyHits or friendlyRicochets. */
    selfHits: 0,
    ricochetTicks: 0,
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
    onTick(state, bots);
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
        if (e.ricochet) stats.ricochetHits++;
        if (v === s) stats.selfHits++;
        else if (v.team === s.team) {
          stats.friendlyHits++;
          if (e.ricochet) stats.friendlyRicochets++;
        }
      }
      if (e.type === 'ricochetTick') stats.ricochetTicks++;
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

export type MatchStats = ReturnType<typeof playMatch>;

/**
 * Per finished round, whether it was played after half-time. A drawn round is played again under the same number
 * (audit SIM-19), so only decided rounds count towards half-time.
 */
export function playedAfterHalfTime(results: readonly { winner: number }[], rules: RoundRules = ROUNDS): boolean[] {
  let decided = 0;
  return results.map((r) => {
    const after = decided >= rules.halfTimeAfter;
    if (r.winner >= 0) decided++;
    return after;
  });
}

/**
 * Nobody in play is off the ground for longer than the in-air spread's delay (a lost ground contact would
 * spike their spread), and nobody goes below the map's lowest floor or more than 2 m over its highest.
 */
export function expectGrounded(stats: MatchStats, map: MapData): void {
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

/**
 * A 3v3 bot match on `map` where Blue's first bot leads (playing its team plan) and the other two are told to follow
 * it every round (squad orders, M22). Counted per tick, once a follower has carried out the order for REJOIN seconds
 * in a row (a fight or cover resets that): how often it is within a few metres of the leader, the farthest it was,
 * and how often it stood still while the leader moved.
 */
export function playFollowMatch(seconds: number, seed: number, map: MapData = DEPOT) {
  let near = 0;
  let counted = 0;
  let worst = 0;
  let standing = 0;
  /** Seconds a follower back from a fight or cover gets to rejoin before it is judged. */
  const REJOIN = 3;
  /** Per character, seconds in a row spent carrying out the order (a fight or cover resets it). */
  const following = new Map<number, number>();
  const stats = playMatch(seconds, seed, undefined, BOTS, 'elimination', ROUNDS, map, ROUNDS.teamSize, HITS, (state, bots) => {
    const leader = state.characters[0]!;
    if (state.events.some((e) => e.type === 'roundStart') || state.tick === 1) bots.giveOrder(leader, 'follow');
    if (state.round.phase !== 'live' || leader.status !== 'alive') return;
    const leaderMoving = Math.hypot(leader.velocity.x, leader.velocity.z) > SQUAD_ORDERS.headingSpeed;
    for (const b of bots.bots) {
      const c = b.character;
      if (c.team !== 0 || c === leader) continue;
      const t = b.order === 'follow' && b.mode === 'order' ? (following.get(c.id) ?? 0) + DT : 0;
      following.set(c.id, t);
      if (t < REJOIN) continue;
      const d = Math.hypot(c.position.x - leader.position.x, c.position.z - leader.position.z);
      counted++;
      if (d < SQUAD_ORDERS.followDistance + SQUAD_ORDERS.catchUpGap + 2) near++;
      if (leaderMoving && Math.hypot(c.velocity.x, c.velocity.z) < 0.5) standing++;
      worst = Math.max(worst, d);
    }
  });
  return { stats, counted, near, worst, standing };
}

/** What 16 seeds of 3v3 in `mode` with ricochets counting tallied (tallyRicochetMatches). */
export interface RicochetTally {
  rounds: number;
  /** Elimination: rounds the west end won; Attack / Defend: rounds the attackers won. */
  favoured: number;
  captures: number;
  hits: number;
  ricochetHits: number;
  directFriendly: number;
  friendlyRicochets: number;
  selfHits: number;
}

/** 16 seeds of 3v3 in `mode` with ricochets counting (friendly fire on, FA12): the tallies over them all. */
export function tallyRicochetMatches(mode: MatchMode): RicochetTally {
  const hits = { ...HITS, ricochetsCount: true };
  const t: RicochetTally = { rounds: 0, favoured: 0, captures: 0, hits: 0, ricochetHits: 0, directFriendly: 0, friendlyRicochets: 0, selfHits: 0 };
  for (let seed = 1; seed <= 16; seed++) {
    const stats = playMatch(mode === 'elimination' ? 300 : 400, seed, undefined, BOTS, mode, ROUNDS, DEPOT, ROUNDS.teamSize, hits);
    t.hits += stats.hits;
    t.ricochetHits += stats.ricochetHits;
    t.friendlyRicochets += stats.friendlyRicochets;
    t.selfHits += stats.selfHits;
    t.directFriendly += stats.friendlyHits - stats.friendlyRicochets;
    for (const r of stats.results) {
      t.rounds++;
      if (r.reason === 'captured') t.captures++;
      if (mode === 'elimination' ? r.winner >= 0 && r.winnerEnd === 0 : r.winner === r.attackers) t.favoured++;
    }
  }
  return t;
}

/**
 * Ricochets counting stay playable (FA12): bots never shoot a teammate directly, and bounced BBs decide only some hits,
 * few of them on the shooter. Which side the rounds favour is a balance figure (src/ai/balance/, token plan item 22).
 * One file per mode, so the two run in parallel.
 */
export function expectRicochetsPlayable(mode: MatchMode): void {
  const t = tallyRicochetMatches(mode);
  expect(t.directFriendly, mode).toBe(0);
  expect(t.friendlyRicochets, mode).toBeLessThanOrEqual(8);
  // A bot's own ricochet now catches it too (audit SIM-07): rare, a few hits in 16 matches.
  expect(t.selfHits / t.hits, mode).toBeLessThan(0.04);
  expect(t.ricochetHits / t.hits, mode).toBeGreaterThan(0.05);
  // Back to 0.25 in G12 (owner's ruling, 2026-10-10: "Weaken bounces: Bounced BBs lose more speed, so fewer of them
  // knock players out"). G11's wide first aim lifted the share to Attack / Defend 0.268, Elimination 0.232 (16 seeds;
  // the cap was 0.30 meanwhile); with three quarters of the old restitution (config/ballistics.ts) 0.179 and 0.198.
  expect(t.ricochetHits / t.hits, mode).toBeLessThan(0.25);
  if (mode === 'attackDefend') expect(t.captures, mode).toBeGreaterThanOrEqual(7);
}

/**
 * Seconds of play per custom match. 240 since FA4 + FA10 (2026-10-04): FA4's bots hold and search longer and FA10 spreads
 * shots evenly round the line of sight, so 2v2 rounds run longer and a few 200 s matches stopped after two rounds
 * (47 rounds over 16 seeds, under the 48 floor). The per-round checks are unchanged. Measured at 240 s: 1v1 Elimination
 * west 56 of 115 decided, 1v1 Attack / Defend attackers 80 of 136, 2v2 Elimination west 34 of 55, 2v2 Attack / Defend
 * attackers 30 of 63.
 */
const CUSTOM_MATCH_SECONDS = 240;

/** What custom matches of `size` a side tallied (tallyCustomMatches). */
export interface CustomTally {
  seeds: number;
  rounds: number;
  decided: number;
  /** Decided rounds won by the west end (Elimination) or the attackers (Attack / Defend). */
  favoured: number;
  friendlyHits: number;
}

/**
 * Custom matches on Depot (M20), first to 3, `size` a side in `mode`: 32 seeds of 1v1 or 16 of 2v2. `onSeed` sees each
 * seed's stats as it is played.
 */
export function tallyCustomMatches(mode: MatchMode, size: number, onSeed?: (stats: MatchStats, seed: number) => void): CustomTally {
  const rules = { ...ROUNDS, winsNeeded: 3, halfTimeAfter: 2 };
  const t: CustomTally = { seeds: size === 1 ? 32 : 16, rounds: 0, decided: 0, favoured: 0, friendlyHits: 0 };
  for (let seed = 1; seed <= t.seeds; seed++) {
    const stats = playMatch(CUSTOM_MATCH_SECONDS, seed, undefined, BOTS, mode, rules, DEPOT, size);
    onSeed?.(stats, seed);
    t.friendlyHits += stats.friendlyHits;
    for (const r of stats.results) {
      t.rounds++;
      if (r.winner < 0) continue;
      t.decided++;
      if (mode === 'elimination' ? r.winnerEnd === 0 : r.winner === r.attackers) t.favoured++;
    }
  }
  return t;
}

/**
 * Playable 1v1 and 2v2 custom matches in `mode` (M20): rounds get decided, nobody stays at spawn, nobody falls, no
 * friendly hits. Whether an end or side is favoured is a balance figure (src/ai/balance/, token plan item 22). One file
 * per mode, so the two run in parallel (audit CORE-15).
 */
export function expectCustomMatchesPlayable(mode: MatchMode): void {
  for (const size of [1, 2]) {
    const label = `${size}v${size} ${mode}`;
    const t = tallyCustomMatches(mode, size, (stats, seed) => {
      expect(stats.farthestFromSpawn, label).toHaveLength(2 * size);
      // Everyone leaves spawn in round 1; in Attack / Defend only the attackers (Blue) must, defenders may hold.
      stats.farthestFromSpawn.forEach((d, i) => {
        if (mode === 'elimination' || i < size) expect(d, `${label} seed ${seed}`).toBeGreaterThan(8);
      });
      expectGrounded(stats, DEPOT);
    });
    expect(t.rounds, label).toBeGreaterThanOrEqual(t.seeds * 3);
    expect(t.decided / t.rounds, label).toBeGreaterThan(0.9);
    expect(t.friendlyHits, label).toBe(0);
  }
}

/** The tallies a match guard and a balance figure read (M40): rounds played, decided, won by the attackers, won by end 0, ended on time. */
export interface BalanceTally {
  rounds: number;
  decided: number;
  attackerWins: number;
  end0Wins: number;
  onTime: number;
}

/** Seeds 1..`seeds` of `mode` on `map` at `cfg`, both teams the same, `seconds` each: the balance tallies over them all. */
export function tallyBalance(seeds: number, seconds: number, cfg: BotConfig, mode: MatchMode, map: MapData, teamSize: number): BalanceTally {
  const t: BalanceTally = { rounds: 0, decided: 0, attackerWins: 0, end0Wins: 0, onTime: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    const stats = playMatch(seconds, seed, undefined, cfg, mode, ROUNDS, map, teamSize);
    for (const r of stats.results) {
      t.rounds++;
      if (r.reason === 'time') t.onTime++;
      if (r.winner === r.attackers) t.attackerWins++;
      if (r.winner < 0) continue;
      t.decided++;
      if (r.winnerEnd === 0) t.end0Wins++;
    }
  }
  return t;
}

/**
 * Rounds that may run out the clock in a match guard: under 1 in 4. Bots that stop finding each other (stuck, or
 * searching the wrong end) run nearly every round out, as Woodland's did before M40 (38 of 82); the target, under 1 in
 * 10, is a balance figure (src/ai/balance/, token plan item 22). Every map reads 0-3 % today, so a few seeds suffice.
 */
export const STALLED_ROUNDS_MAX = 0.25;

/**
 * A match guard's tally (tallyBalance) shows rounds being played and settled: some rounds, under STALLED_ROUNDS_MAX of
 * them on time. Who wins them is a balance figure (src/ai/balance/, token plan item 22).
 */
export function expectRoundsPlayed(t: BalanceTally, label: string): void {
  const said = `${label}: ${JSON.stringify(t)}`;
  expect(t.rounds, said).toBeGreaterThan(0);
  expect(t.onTime / t.rounds, said).toBeLessThan(STALLED_ROUNDS_MAX);
}

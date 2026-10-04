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
import { createCharacter, respawnCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createWind } from '../sim/wind';
import { placeTeams, type RoundRules } from '../sim/round';
import { createGameState, type GameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { BotController } from './botController';
import { lowCoverBlocks, tallCoverBlocks } from './cover';

/**
 * Test-only (like sim/testSupport.ts): the headless bot-match harness shared by the depotMatch*.test.ts files. The
 * long multi-seed guards each live in their own file so vitest runs them in parallel (it never parallelises inside
 * a file). Call `initPhysics()` before `playMatch`.
 */

export const DT = 1 / 60;

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
    for (let i = 0; i < (hider && team === 0 ? 1 : teamSize); i++) state.characters.push(createCharacter(id++, vec3(), 0, LOADOUT, team));
  }
  // Round 1 as the game starts it: each team at its end; a hider stands at its spot instead.
  placeTeams(state.round, state.characters, ctx.round);
  for (const c of state.characters) {
    respawnCharacter(c);
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

/**
 * 16 seeds of 3v3 in `mode` with ricochets counting (friendly fire on): bots never shoot a teammate directly, and
 * bounced BBs decide only some hits, few of them on the shooter (FA12). One file per mode, so the two run in parallel.
 */
export function expectRicochetsPlayable(mode: MatchMode): void {
  const hits = { ...HITS, ricochetsCount: true };
  let rounds = 0;
  let favoured = 0;
  let captures = 0;
  let allHits = 0;
  let ricochetHits = 0;
  let directFriendly = 0;
  let friendlyRicochets = 0;
  let selfHits = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const stats = playMatch(mode === 'elimination' ? 300 : 400, seed, undefined, BOTS, mode, ROUNDS, DEPOT, ROUNDS.teamSize, hits);
    allHits += stats.hits;
    ricochetHits += stats.ricochetHits;
    friendlyRicochets += stats.friendlyRicochets;
    selfHits += stats.selfHits;
    directFriendly += stats.friendlyHits - stats.friendlyRicochets;
    for (const r of stats.results) {
      rounds++;
      if (r.reason === 'captured') captures++;
      if (mode === 'elimination' ? r.winner >= 0 && r.winnerEnd === 0 : r.winner === r.attackers) favoured++;
    }
  }
  expect(directFriendly, mode).toBe(0);
  expect(friendlyRicochets, mode).toBeLessThanOrEqual(8);
  // A bot's own ricochet now catches it too (audit SIM-07): rare, a few hits in 16 matches.
  expect(selfHits / allHits, mode).toBeLessThan(0.04);
  expect(ricochetHits / allHits, mode).toBeGreaterThan(0.05);
  expect(ricochetHits / allHits, mode).toBeLessThan(0.25);
  expect(favoured / rounds, mode).toBeGreaterThan(0.35);
  expect(favoured / rounds, mode).toBeLessThan(0.65);
  if (mode === 'attackDefend') expect(captures, mode).toBeGreaterThanOrEqual(7);
}

import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS, type BotConfig, botConfig } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
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
import { createGameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { BotController } from './botController';

const DT = 1 / 60;

/**
 * A 3v3 on Depot with real physics, headless. By default all six are bots; with `hider`, Blue is a
 * single non-bot player standing still at that spot (hiding) against three Orange bots.
 */
function playMatch(seconds: number, seed: number, hider?: Vec3, cfg: BotConfig = BOTS) {
  const physics = new PhysicsWorld(DEPOT, BODY, DT);
  const nav = buildNavGrid(DEPOT, NAV);
  const state = createGameState(seed, BALLISTICS.maxBBs, ROUNDS);
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
    rounds: ROUNDS,
  });
  const commands = new Map<number, PlayerCommand>();
  const bots = new BotController(state, hider ? state.characters.filter((c) => c.team === 1) : state.characters, commands, {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: DEPOT.lanes,
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg,
    seed,
  });

  const stats = { rounds: 0, shots: 0, hits: 0, friendlyHits: 0, firstRoundEnd: -1, roundEnds: [] as number[], farthestFromSpawn: state.characters.map(() => 0) };
  for (let tick = 0; tick < seconds / DT; tick++) {
    bots.think(state, DT);
    stepSimulation(state, commands, ctx, DT);
    bots.observe(state);
    for (const e of state.events) {
      if (e.type === 'roundOver') {
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


describe('MEASURE', () => {
  beforeAll(async () => { await initPhysics(); });
  it('prints', { timeout: 300_000 }, () => {
    const out: string[] = [];
    for (const level of ['easy', 'normal', 'hard'] as const) {
      let shots = 0, hits = 0; const rounds: number[] = [];
      for (const seed of [1,2,3,4,5,6]) {
        const s = playMatch(150, seed, undefined, botConfig(level));
        shots += s.shots; hits += s.hits;
        let prev = 0; for (const r of s.roundEnds) { rounds.push(r - prev); prev = r; }
      }
      rounds.sort((a,b)=>a-b);
      out.push(`${level} hitrate=${(hits/shots*100).toFixed(1)}% medianRound=${rounds[Math.floor(rounds.length/2)]?.toFixed(1)} n=${rounds.length}`);
    }
    console.log(out.join('\n'));
  });
});

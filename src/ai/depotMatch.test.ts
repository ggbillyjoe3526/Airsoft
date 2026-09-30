import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BOTS } from '../config/bots';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { DEPOT } from '../map/depot';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { createCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { BotController } from './botController';

const DT = 1 / 60;

/** Six bots (3v3) play on Depot with real physics: the whole loop, headless. */
function playMatch(seconds: number, seed: number) {
  const physics = new PhysicsWorld(DEPOT, BODY, DT);
  const nav = buildNavGrid(DEPOT, NAV);
  const state = createGameState(seed, BALLISTICS.maxBBs);
  let id = 0;
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < ROUNDS.teamSize; i++) {
      const s = DEPOT.spawns[team]![i]!;
      const c = createCharacter(id++, vec3(s.position.x, s.position.y + PHYSICS.groundRestGap, s.position.z), s.yaw, LOADOUT, team);
      state.characters.push(c);
      physics.addCharacter(c);
    }
  }
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    body: BODY,
    ballistics: BALLISTICS,
    loadout: LOADOUT,
    killY: DEPOT.killY,
    hits: HITS,
    deadZones: DEPOT.deadZones,
    nav,
    navSnap: NAV.snap,
    roundResetDelay: ROUNDS.resetDelay,
  });
  const commands = new Map<number, PlayerCommand>();
  const bots = new BotController(state, state.characters, commands, {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: DEPOT.lanes,
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: BOTS,
    seed,
  });

  const stats = { rounds: 0, shots: 0, hits: 0, friendlyHits: 0, farthestFromSpawn: state.characters.map(() => 0) };
  for (let tick = 0; tick < seconds / DT; tick++) {
    bots.think(state, DT);
    stepSimulation(state, commands, ctx, DT);
    bots.observe(state);
    for (const e of state.events) {
      if (e.type === 'roundOver') stats.rounds++;
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

  it('never has bots hit their own teammates', { timeout: 30_000 }, () => {
    for (const seed of [2, 3]) expect(playMatch(90, seed).friendlyHits).toBe(0);
  });
});

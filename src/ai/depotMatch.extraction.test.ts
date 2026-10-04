import { beforeAll, describe, expect, it } from 'vitest';
import { BALLISTICS, WIND } from '../config/ballistics';
import { BOTS, botConfig } from '../config/bots';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { runSeed } from '../core/seed';
import { DEPOT } from '../map/depot';
import { buildNavGrid, createNavSearch } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { type Character, createCharacter } from '../sim/character';
import type { PlayerCommand } from '../sim/commands';
import { eliminate, isInPlay } from '../sim/elimination';
import { createRunContext } from '../sim/extraction';
import { startRun } from '../sim/round';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { vec3 } from '../sim/vec';
import { createWind } from '../sim/wind';
import { BotController } from './botController';
import { lowCoverBlocks, tallCoverBlocks } from './cover';
import { DT } from './depotMatchSupport';
import { SquadFollow } from './squadFollow';

/**
 * Extraction on Depot (M43), headless with real physics and bots: you (not a bot: you stand where the test puts you)
 * with two bot teammates against the home team. You're a ghost here (BBs pass through, Dev settings' Ghost) unless a
 * test wants you hit, so the run's own rules decide how it ends.
 */
function setUpRun(seed: number) {
  const x = DEPOT.extraction!;
  const squad = 3;
  const rules = { ...ROUNDS, roundTime: x.runTime, winsNeeded: 1 };
  const physics = new PhysicsWorld(DEPOT, BODY, DT);
  const nav = buildNavGrid(DEPOT, NAV);
  const run = createRunContext(x, { squad, seed: runSeed(seed), runner: 0, squadTeam: 0, respawnAfter: HITS.callTime, spawnLift: PHYSICS.groundRestGap });
  const state = createGameState(seed, BALLISTICS.maxBBs, rules, 'extraction');
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    wind: createWind(seed, WIND),
    killY: DEPOT.killY,
    hits: HITS,
    deadZones: DEPOT.deadZones,
    spawns: DEPOT.spawns,
    spawnLift: PHYSICS.groundRestGap,
    nav,
    navSnap: NAV.snap,
    rounds: rules,
    extraction: run,
  });
  const opponents = x.baseOpponents + squad;
  for (let id = 0; id < squad + opponents; id++) state.characters.push(createCharacter(id, vec3(), 0, LOADOUT, id < squad ? 0 : 1));
  startRun(state.round, state.characters, ctx.round);
  for (const c of state.characters) physics.addCharacter(c);
  const you = state.characters[0]!;
  you.ghost = true;
  const commands = new Map<number, PlayerCommand>();
  const bots = new BotController(state, state.characters.filter((c) => c !== you), commands, {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: DEPOT.lanes,
    lowCover: lowCoverBlocks(DEPOT.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    tallCover: tallCoverBlocks(DEPOT.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: BOTS,
    teamCfg: [botConfig('normal'), botConfig('normal')],
    seed,
  });
  const follow = new SquadFollow();
  const play = (seconds: number, onTick: () => void = () => {}) => {
    for (let i = 0; i < seconds / DT && state.round.phase === 'live'; i++) {
      bots.think(state, DT);
      stepSimulation(state, commands, ctx, DT);
      bots.observe(state);
      follow.update(bots, you, state.characters, state.events, state.round.phase === 'live');
      onTick();
    }
  };
  /** Puts you on the floor at (x, z) (between ticks, as a test would). */
  const moveYou = (p: { x: number; y: number; z: number }) => {
    you.position.x = p.x;
    you.position.y = p.y + PHYSICS.groundRestGap;
    you.position.z = p.z;
    you.prevPosition.x = you.position.x;
    you.prevPosition.y = you.position.y;
    you.prevPosition.z = you.position.z;
    you.velocity.x = 0;
    you.velocity.y = 0;
    you.velocity.z = 0;
  };
  const elimination = { deadZones: DEPOT.deadZones, nav, navSearch: createNavSearch(nav), snap: NAV.snap };
  /** You're hit by the first opponent. */
  const hitYou = () => eliminate(you, squad, state.characters, elimination);
  return { state, run, you, bots, play, moveYou, hitYou, dispose: () => physics.dispose() };
}

const mates = (cs: readonly Character[]) => cs.filter((c) => c.team === 0 && c.id !== 0);

describe('Extraction on Depot, headless (M43)', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('keeps your bot teammates with you, and ends "extracted" once you stand in an open exit for the count', () => {
    for (const seed of [1, 2]) {
      const r = setUpRun(seed);
      let near = 0;
      let ticks = 0;
      r.play(30, () => {
        for (const m of mates(r.state.characters)) {
          if (!isInPlay(m)) continue;
          ticks++;
          if (Math.hypot(m.position.x - r.you.position.x, m.position.z - r.you.position.z) < 8) near++;
        }
      });
      expect(r.bots.orderOf(r.you), `seed ${seed}`).toBe('follow');
      expect(near / Math.max(1, ticks), `seed ${seed}: teammates near you`).toBeGreaterThan(0.8);
      const open = r.state.round.run.exits.find((e) => e.open)!;
      r.moveYou(open.position);
      r.play(r.run.rules.extractTime + 2);
      expect(r.state.round.phase, `seed ${seed}`).toBe('matchOver');
      expect(r.state.round.reason, `seed ${seed}`).toBe('extracted');
      r.dispose();
    }
  });

  it('brings you back at the insertion after a hit, and a second hit ends the run "out"', () => {
    const r = setUpRun(3);
    r.play(5);
    r.hitYou();
    r.play(HITS.callTime + 0.2);
    expect(isInPlay(r.you)).toBe(true);
    expect(Math.hypot(r.you.position.x - r.run.insertion[0]!.position.x, r.you.position.z - r.run.insertion[0]!.position.z)).toBeLessThan(3);
    r.hitYou();
    r.play(HITS.callTime + 0.2);
    expect(r.state.round.reason).toBe('out');
    r.dispose();
  });
});

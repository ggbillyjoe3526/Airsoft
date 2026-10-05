import { BALLISTICS, WIND } from '../config/ballistics';
import { BOTS, botConfig, type Difficulty, defaultTeammateDifficulty } from '../config/bots';
import { EXTRACTION } from '../config/extraction';
import { FOOTSTEPS } from '../config/footsteps';
import { HITS, ROUNDS } from '../config/hits';
import { BODY, MOVEMENT } from '../config/movement';
import { NAV } from '../config/nav';
import { PHYSICS } from '../config/physics';
import { LOADOUT } from '../config/replicas';
import { caseSeed, runSeed } from '../core/seed';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { buildNavGrid, createNavSearch } from '../nav/navGrid';
import { PhysicsWorld } from '../physics/physicsWorld';
import { rollRunCases } from '../pool/caches';
import { GAME_POOL } from '../pool/gamePool';
import { type Character, createCharacter } from '../sim/character';
import { createCommand, type PlayerCommand } from '../sim/commands';
import { eliminate, isInPlay } from '../sim/elimination';
import { createRunContext, haulTotals, type RunState, reserveSize, runHaul } from '../sim/extraction';
import { startRun } from '../sim/round';
import { createSimContext, stepSimulation } from '../sim/simulation';
import { createGameState } from '../sim/state';
import { type Vec3, vec3 } from '../sim/vec';
import { createWind } from '../sim/wind';
import { type Bot } from './bot';
import { BotController } from './botController';
import { lowCoverBlocks, tallCoverBlocks } from './cover';
import { DT, fitNightTorches } from './depotMatchSupport';
import { sightConditionsOf } from './perception';
import { SquadFollow } from './squadFollow';
import { startOrder } from './squadOrders';

/**
 * Test-only (like depotMatchSupport.ts): a headless Extraction run with real physics and bots. The runner (character 0)
 * is you, standing where a test puts you, unless `runnerBot`: then a bot plays the runner by a simple plan (see
 * RunnerPlan), which is how the balance runs measure the mode. Call `initPhysics()` first.
 */
export interface RunOptions {
  seed: number;
  /** Squad members, the runner included (default 3: the default 3v3's squad). */
  squad?: number;
  /** The home team's difficulty, and your bot teammates' (default: as the game picks for that level). */
  opponents?: Difficulty;
  teammates?: Difficulty;
  /** A bot plays the runner (else you do, by hand: a ghost unless a test wants you hit). */
  runnerBot?: boolean;
  map?: MapData;
  /** The runner bot's plan (default RUNNER_PLAN). */
  plan?: RunnerPlanConfig;
  /** Every bot carries the weapon torch (fitNightTorches; default: on a night field, as the game fits it; M57, audit AI-02). */
  torches?: boolean;
}

/**
 * How the runner bot plays a run: opens up to `cases` cases, nearest first (going back first for anything it dropped),
 * then makes for the nearest open exit, at once once `leaveAt` seconds or fewer are left. First guesses, like a careful
 * first run: the plan's "two ammo cans and a field case".
 */
export interface RunnerPlanConfig {
  cases: number;
  /** Case kinds it leaves alone (the guarded locker, on a careful run). */
  skip: readonly string[];
  leaveAt: number;
  /** It opens a case from this far in front of it (within EXTRACTION.caseReach). */
  standOff: number;
}

export const RUNNER_PLAN: RunnerPlanConfig = { cases: 3, skip: ['locker'], leaveAt: 180, standOff: 0.9 };

export function setUpRun(opts: RunOptions) {
  const { seed } = opts;
  const map = opts.map ?? DEPOT;
  const x = map.extraction!;
  const squad = opts.squad ?? 3;
  const opponents = opts.opponents ?? 'normal';
  const teammates = opts.teammates ?? defaultTeammateDifficulty(opponents);
  const rules = { ...ROUNDS, roundTime: x.runTime, winsNeeded: 1 };
  const physics = new PhysicsWorld(map, BODY, DT);
  const nav = buildNavGrid(map, NAV);
  const cases = rollRunCases(GAME_POOL, x.cases, {}, caseSeed(seed));
  const run = createRunContext(x, {
    squad,
    seed: runSeed(seed),
    runner: 0,
    squadTeam: 0,
    respawnAfter: HITS.callTime,
    spawnLift: PHYSICS.groundRestGap,
    cases,
    waveEvery: EXTRACTION.waveEvery[opponents],
    sight: { query: physics, body: BODY },
    deadZones: map.deadZones,
  });
  const state = createGameState(seed, BALLISTICS.maxBBs, rules, 'extraction');
  const ctx = createSimContext({
    mover: physics,
    query: physics,
    movement: MOVEMENT,
    footsteps: FOOTSTEPS,
    body: BODY,
    ballistics: BALLISTICS,
    wind: createWind(seed, WIND),
    killY: map.killY,
    hits: HITS,
    deadZones: map.deadZones,
    spawns: map.spawns,
    spawnLift: PHYSICS.groundRestGap,
    nav,
    navSnap: NAV.snap,
    rounds: rules,
    extraction: run,
  });
  // The home team's cap and its reserve for the run's last part (M45).
  const home = x.baseOpponents + squad + reserveSize(run);
  for (let id = 0; id < squad + home; id++) state.characters.push(createCharacter(id, vec3(), 0, LOADOUT, id < squad ? 0 : 1));
  const you = state.characters[0]!;
  // The bots: everyone, or everyone but you when you play the runner by hand.
  const botCharacters = opts.runnerBot ? state.characters : state.characters.filter((c) => c !== you);
  if (opts.torches ?? map.night === true) fitNightTorches(botCharacters);
  startRun(state.round, state.characters, ctx.round);
  for (const c of state.characters) physics.addCharacter(c);
  you.ghost = !opts.runnerBot;
  const commands = new Map<number, PlayerCommand>();
  const bots = new BotController(state, botCharacters, commands, {
    query: physics,
    nav,
    navSnap: NAV.snap,
    lanes: map.lanes,
    lowCover: lowCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    tallCover: tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap),
    // Bushes and night as the map has them (M48: Woodland's woods and both night maps), as a match sets them.
    sight: sightConditionsOf(map),
    body: BODY,
    hits: HITS,
    loadout: LOADOUT,
    cfg: BOTS,
    teamCfg: [botConfig(teammates), botConfig(opponents)],
    seed,
  });
  const follow = new SquadFollow();
  const runner = opts.runnerBot ? new RunnerPlan(bots.bots.find((b) => b.character === you)!, opts.plan ?? RUNNER_PLAN) : undefined;
  /** Your keys: you aren't a bot, so this is what you do each tick (standing still unless a test says otherwise). */
  const yours = commands.get(you.id) ?? createCommand();
  commands.set(you.id, yours);
  const play = (seconds: number, onTick: () => void = () => {}) => {
    for (let i = 0; i < seconds / DT && state.round.phase === 'live'; i++) {
      runner?.steer(state.round.run, state.round.clock);
      bots.think(state, DT);
      if (runner) yours.use = runner.wantsUse(state.round.run);
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
  const elimination = { deadZones: map.deadZones, nav, navSearch: createNavSearch(nav), snap: NAV.snap };
  /** You're hit by the first opponent. */
  const hitYou = () => eliminate(you, squad, state.characters, elimination);
  /** `c` is hit by you. */
  const hitThem = (c: Character) => eliminate(c, you.id, state.characters, elimination);
  return { state, run, you, yours, bots, play, moveYou, hitYou, hitThem, physics, squad, dispose: () => physics.dispose() };
}

/** What a run came to: how it ended, after how long (s), and the Field Credits it got out with. */
export interface RunResult {
  reason: string;
  seconds: number;
  fc: number;
  cases: number;
}

/** Plays a whole run with the runner bot (setUpRun with runnerBot) and reports how it went. */
export function playRun(opts: RunOptions): RunResult {
  const r = setUpRun({ ...opts, runnerBot: true });
  const runTime = r.state.round.clock;
  r.play(runTime + 1);
  const run = r.state.round.run;
  const extracted = r.state.round.reason === 'extracted';
  const result = {
    reason: r.state.round.reason,
    seconds: runTime - r.state.round.clock,
    fc: extracted ? haulTotals(runHaul(run)).fc : 0,
    cases: run.cases.filter((k) => k.open && !k.dropped).length,
  };
  r.dispose();
  return result;
}

/** A home team's level measured over whole runs (the balance guards, M46, M48): how often the squad got out, and with what. */
export interface RunMeasure {
  extract: number;
  /** What the runs got out with over the minutes they lasted (Field Credits a minute). */
  fcPerMinute: number;
  runs: RunResult[];
}

/**
 * Plays seeds 1 to `seeds` on `map` with the runner bot and RUNNER_PLAN, two Normal bot teammates standing in for you,
 * against a home team at `opponents`.
 */
export function measureRuns(map: MapData, opponents: Difficulty, seeds: number): RunMeasure {
  const runs: RunResult[] = [];
  for (let seed = 1; seed <= seeds; seed++) runs.push(playRun({ seed, map, opponents, teammates: 'normal', plan: RUNNER_PLAN }));
  const minutes = runs.reduce((sum, r) => sum + r.seconds, 0) / 60;
  return {
    extract: runs.filter((r) => r.reason === 'extracted').length / runs.length,
    fcPerMinute: runs.reduce((sum, r) => sum + r.fc, 0) / minutes,
    runs,
  };
}

/**
 * The runner bot's plan (RUNNER_PLAN): a Hold here order on the runner itself, moved each tick to the next goal, and
 * its Use key held by a shut case it stands at with nobody in sight. Fights and cover come first, as for any order.
 */
class RunnerPlan {
  private readonly goal = vec3();
  private target = -1;

  constructor(
    private readonly bot: Bot,
    private readonly plan: RunnerPlanConfig,
  ) {}

  /** Before the bots think: the goal for this tick, and the hold order on it. */
  steer(run: RunState, clock: number): void {
    const b = this.bot;
    const me = b.character;
    if (!isInPlay(me)) return;
    this.target = this.nextCase(run, clock);
    if (this.target >= 0) {
      const k = run.cases[this.target]!;
      this.goal.x = k.position.x - Math.sin(k.yaw) * this.plan.standOff;
      this.goal.y = k.position.y;
      this.goal.z = k.position.z - Math.cos(k.yaw) * this.plan.standOff;
    } else {
      let best = Number.POSITIVE_INFINITY;
      for (const e of run.exits) {
        const d = Math.hypot(e.position.x - me.position.x, e.position.z - me.position.z);
        if (!e.open || d >= best) continue;
        best = d;
        copy(this.goal, e.position);
      }
    }
    if (b.order !== 'hold' || b.orderLeader !== me) startOrder(b, me, 'hold', 0);
    if (Math.hypot(b.orderGoal.x - this.goal.x, b.orderGoal.z - this.goal.z) > 0.05) copy(b.orderGoal, this.goal);
  }

  /** Holding Use: at its case, with nobody in sight. */
  wantsUse(run: RunState): boolean {
    const b = this.bot;
    if (this.target < 0 || b.targetVisible || !isInPlay(b.character)) return false;
    const k = run.cases[this.target]!;
    return Math.hypot(k.position.x - b.character.position.x, k.position.z - b.character.position.z) <= EXTRACTION.caseReach;
  }

  /** The case to make for: a dropped one first, then the nearest shut one while the plan allows more; -1: leave. */
  private nextCase(run: RunState, clock: number): number {
    const me = this.bot.character.position;
    const dropped = run.cases.findIndex((k) => k.dropped && !k.open);
    if (dropped >= 0) return dropped;
    const opened = run.cases.filter((k) => k.open && !k.dropped).length;
    if (opened >= this.plan.cases || clock <= this.plan.leaveAt) return -1;
    // Keep to the case it set out for while it's shut.
    if (this.target >= 0 && !run.cases[this.target]!.open) return this.target;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < run.cases.length; i++) {
      const k = run.cases[i]!;
      const d = Math.hypot(k.position.x - me.x, k.position.z - me.z);
      if (k.open || this.plan.skip.includes(k.kind) || d >= bestDistance) continue;
      best = i;
      bestDistance = d;
    }
    return best;
  }
}

function copy(to: Vec3, from: Vec3): void {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
}

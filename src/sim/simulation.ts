import type { BallisticsConfig } from '../config/ballistics';
import type { FootstepConfig } from '../config/footsteps';
import type { HitConfig } from '../config/hits';
import type { BodyConfig, MovementConfig } from '../config/movement';
import type { SpawnPoint } from '../map/mapTypes';
import { createNavSearch, type NavGrid } from '../nav/navGrid';
import { stepAccuracy } from './accuracy';
import { stepAiming } from './aiming';
import { type ArmamentContext, type Muzzle, stepArmament, type WorldQuery } from './armament';
import { createBBPool } from './ballistics';
import { type BBTargets, stepBBs } from './bbs';
import { rescueIfOutOfWorld } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { fillEliminatedCommand, isInPlay, isParked, planWalkOffRoutes, stepElimination } from './elimination';
import type { ExtractionContext } from './extraction';
import { stepFootsteps } from './footsteps';
import { type CharacterMover, createMovementScratch, type MovementScratch, stepMovement } from './movement';
import { leanedEye, stepLean } from './lean';
import { refillSpares, stepRangeTargets } from './rangeTargets';
import { createRng } from './rng';
import { type RoundContext, type RoundRules, stepRound } from './round';
import type { GameState } from './state';
import { copy, type Vec3, vec3 } from './vec';
import { type WindState, windAt } from './wind';

export interface SimServices {
  mover: CharacterMover;
  query: WorldQuery;
  movement: MovementConfig;
  footsteps: FootstepConfig;
  body: BodyConfig;
  ballistics: BallisticsConfig;
  /** Anything below this height has left the level (map data). */
  killY: number;
  hits: HitConfig;
  /** Per end of the map, its dead-zone spots (map data). */
  deadZones: readonly (readonly SpawnPoint[])[];
  /** Per end of the map, its spawn points (map data; empty: characters keep the spawns they were made with). */
  spawns?: readonly (readonly SpawnPoint[])[];
  /** Characters stand this far above a spawn's floor point (the physics rest gap). */
  spawnLift?: number;
  /** Walkability grid of the map (walk-off routes). */
  nav: NavGrid;
  /** Route ends snap to the nearest walkable cell within this distance. */
  navSnap: number;
  /** Round length, pause between rounds, wins needed, flag rules. */
  rounds: RoundRules;
  /** The flagpole, at end 1 where the defenders start (map data; absent: no flag mode). */
  pole?: Vec3 | undefined;
  /** Extraction (M43): the run's rules and places; absent in the other modes. */
  extraction?: ExtractionContext | undefined;
  /** The match's breeze (M30; createWind from the match's seed); still air without one. */
  wind?: WindState | undefined;
  /**
   * The practice range (M21): no rounds (it's always live), targets in GameState.targets, and the spare magazines
   * always full.
   */
  practice?: boolean;
}

/** Services and tuning the simulation needs from outside, plus reusable scratch. */
export interface SimContext extends SimServices {
  scratch: MovementScratch;
  /** Used for characters that have no command this tick. */
  idleCommand: PlayerCommand;
  /** Command followed by characters that have been hit (they don't take orders from their controller). */
  eliminatedCommand: PlayerCommand;
  muzzle: Muzzle;
  /** Reused every tick; the state-dependent fields are filled in by stepSimulation. */
  armament: ArmamentContext;
  targets: BBTargets;
  round: RoundContext;
}

export function createSimContext(services: SimServices): SimContext {
  return {
    ...services,
    scratch: createMovementScratch(),
    idleCommand: createCommand(),
    eliminatedCommand: createCommand(),
    muzzle: { eye: vec3(), yaw: 0, pitch: 0, spreadScale: 1 },
    armament: {
      ballistics: services.ballistics,
      bbs: createBBPool(0), // replaced by the state's pool and RNG each tick
      rng: createRng(0),
      query: services.query,
      events: [],
      fireHoldOff: 0,
    },
    targets: {
      characters: [],
      hits: services.hits,
      rangeTargets: [],
      elimination: { deadZones: services.deadZones, nav: services.nav, navSearch: createNavSearch(services.nav), snap: services.navSnap },
    },
    round: { rules: services.rounds, pole: services.pole, spawns: services.spawns ?? [], spawnLift: services.spawnLift ?? 0, extraction: services.extraction },
  };
}

/**
 * Advances the whole game by one fixed tick. Each character is driven by the command stored under
 * its id; the player and bots are indistinguishable here. Characters without a command this tick
 * keep their view and stand still (gravity still applies); characters that have been hit follow the
 * hit-calling routine instead of their command; once out and standing in the dead zone they are only timed (isParked).
 * Order: move (and footsteps), then use replicas (BBs leave from the new
 * eye position), then fly BBs (hitting walls or characters), then round flow.
 */
export function stepSimulation(
  state: GameState,
  commands: ReadonlyMap<number, PlayerCommand>,
  ctx: SimContext,
  dt: number,
): void {
  state.events.length = 0;
  const armCtx = ctx.armament;
  armCtx.bbs = state.bbs;
  armCtx.rng = state.rng;
  armCtx.events = state.events;
  ctx.targets.characters = state.characters;
  ctx.targets.rangeTargets = state.targets;
  // Once the round is decided it's a cease-fire, as after the end whistle at a site: nobody can fire,
  // and BBs still in the air can't hit anyone.
  const live = state.round.phase === 'live';
  // One walk-off route search a tick at most (M27): a victim hit last tick gets its route before it is stepped.
  planWalkOffRoutes(state.characters, ctx.targets.elimination);

  for (const c of state.characters) {
    copy(c.prevPosition, c.position);
    c.prevCrouchAmount = c.crouchAmount;
    c.prevLean = c.lean;
    c.prevYaw = c.yaw;
    c.prevPitch = c.pitch;
    // Out and standing in the dead zone: only its clock runs (audit SIM-15).
    if (isParked(c)) {
      stepElimination(c, ctx.hits, dt);
      continue;
    }
    const inPlay = isInPlay(c);
    let cmd = inPlay ? commands.get(c.id) : fillEliminatedCommand(c, ctx.hits, ctx.eliminatedCommand);
    if (!cmd) {
      cmd = ctx.idleCommand;
      cmd.yaw = c.yaw;
      cmd.pitch = c.pitch;
    }
    if (inPlay) stepAiming(c, cmd);
    else c.aiming = false;
    c.using = inPlay && live && cmd.use;
    stepMovement(c, cmd, ctx.movement, dt, ctx.mover, ctx.scratch);
    rescueIfOutOfWorld(c, ctx.killY);
    stepLean(c, cmd, ctx.body, ctx.hits, ctx.movement, ctx.query, dt);
    stepAccuracy(c, ctx.movement, dt);
    if (!inPlay) {
      stepElimination(c, ctx.hits, dt);
      continue;
    }
    stepFootsteps(c, ctx.footsteps, state.events);

    const m = ctx.muzzle;
    leanedEye(c, ctx.body, ctx.hits, m.eye); // BBs leave from the eyes, wherever a lean puts them
    m.yaw = c.yaw;
    m.pitch = c.pitch;
    m.spreadScale = c.spreadScale;
    const canFire = live && !c.sprinting && c.sprintLockout <= 0;
    // A click just after a sprint is kept until the lockout ends (not one made while still sprinting).
    armCtx.fireHoldOff = c.sprinting ? 0 : c.sprintLockout;
    stepArmament(c.id, c.armament, cmd, m, canFire, armCtx, dt);
  }

  if (ctx.wind) windAt(ctx.wind, state.time, state.wind);
  stepBBs(state.bbs, ctx.ballistics, ctx.query, ctx.killY, state.events, dt, live ? ctx.targets : undefined, state.rng, state.wind);
  if (ctx.practice) {
    stepRangeTargets(state.targets, dt);
    for (const c of state.characters) refillSpares(c.armament);
  } else {
    stepRound(state.round, state.characters, state.bbs, ctx.round, state.events, dt);
  }
  state.tick++;
  state.time += dt;
}

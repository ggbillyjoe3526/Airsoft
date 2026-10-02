import type { BallisticsConfig } from '../config/ballistics';
import type { FootstepConfig } from '../config/footsteps';
import type { HitConfig } from '../config/hits';
import type { BodyConfig, MovementConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import type { SpawnPoint } from '../map/mapTypes';
import { createNavSearch, type NavGrid } from '../nav/navGrid';
import { stepAccuracy } from './accuracy';
import { type ArmamentContext, type Muzzle, stepArmament, type WorldQuery } from './armament';
import { createBBPool } from './ballistics';
import { type BBTargets, stepBBs } from './bbs';
import { rescueIfOutOfWorld } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { fillEliminatedCommand, isInPlay, stepElimination } from './elimination';
import { stepFootsteps } from './footsteps';
import { type CharacterMover, createMovementScratch, type MovementScratch, stepMovement } from './movement';
import { leanedEye, stepLean } from './lean';
import { createRng } from './rng';
import { type RoundContext, type RoundRules, stepRound } from './round';
import type { GameState } from './state';
import { copy, type Vec3, vec3 } from './vec';

export interface SimServices {
  mover: CharacterMover;
  query: WorldQuery;
  movement: MovementConfig;
  footsteps: FootstepConfig;
  body: BodyConfig;
  ballistics: BallisticsConfig;
  loadout: readonly ReplicaConfig[];
  /** Anything below this height has left the level (map data). */
  killY: number;
  hits: HitConfig;
  /** Per team, dead-zone spots (map data). */
  deadZones: readonly (readonly SpawnPoint[])[];
  /** Walkability grid of the map (walk-off routes). */
  nav: NavGrid;
  /** Route ends snap to the nearest walkable cell within this distance. */
  navSnap: number;
  /** Round length, pause between rounds, wins needed, flag rules. */
  rounds: RoundRules;
  /** Per team, where the flagpole stands when that team defends (map data; absent: no flag mode). */
  flagSpots?: readonly Vec3[];
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
      loadout: services.loadout,
      ballistics: services.ballistics,
      bbs: createBBPool(0), // replaced by the state's pool and RNG each tick
      rng: createRng(0),
      query: services.query,
      events: [],
    },
    targets: {
      characters: [],
      hits: services.hits,
      elimination: { deadZones: services.deadZones, nav: services.nav, navSearch: createNavSearch(services.nav), snap: services.navSnap },
    },
    round: { rules: services.rounds, loadout: services.loadout, flagSpots: services.flagSpots ?? [] },
  };
}

/**
 * Advances the whole game by one fixed tick. Each character is driven by the command stored under
 * its id; the player and bots are indistinguishable here. Characters without a command this tick
 * keep their view and stand still (gravity still applies); characters that have been hit follow the
 * hit-calling routine instead of their command. Order: move (and footsteps), then use replicas (BBs leave from the new
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
  // Once the round is decided it's a cease-fire, as after the end whistle at a site: nobody can fire,
  // and BBs still in the air can't hit anyone.
  const live = state.round.phase === 'live';

  for (const c of state.characters) {
    copy(c.prevPosition, c.position);
    c.prevCrouchAmount = c.crouchAmount;
    c.prevLean = c.lean;
    c.prevYaw = c.yaw;
    c.prevPitch = c.pitch;
    const inPlay = isInPlay(c);
    let cmd = inPlay ? commands.get(c.id) : fillEliminatedCommand(c, ctx.hits, ctx.eliminatedCommand);
    if (!cmd) {
      cmd = ctx.idleCommand;
      cmd.yaw = c.yaw;
      cmd.pitch = c.pitch;
    }
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
    stepArmament(c.id, c.armament, cmd, m, canFire, armCtx, dt);
  }

  stepBBs(state.bbs, ctx.ballistics, ctx.query, ctx.killY, state.events, dt, live ? ctx.targets : undefined);
  stepRound(state.round, state.characters, state.bbs, ctx.round, state.events, dt);
  state.tick++;
  state.time += dt;
}

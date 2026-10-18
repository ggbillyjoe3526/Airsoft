import type { BallisticsConfig } from '../config/ballistics';
import type { FootstepConfig } from '../config/footsteps';
import { NOISE } from '../config/noise';
import type { HitConfig } from '../config/hits';
import type { BodyConfig, MovementConfig } from '../config/movement';
import type { SpawnPoint } from '../map/mapTypes';
import type { NavGrid } from '../nav/navGrid';
import { stepAccuracy } from './accuracy';
import { stepAiming } from './aiming';
import { type ArmamentContext, type Muzzle, stepArmament, type WorldQuery } from './armament';
import { createBBPool } from './ballistics';
import { type BBTargets, stepBBs } from './bbs';
import { rescueIfOutOfWorld } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { createEliminationContext, fillEliminatedCommand, isInPlay, isParked, planWalkOffRoutes, stepElimination } from './elimination';
import type { ExtractionContext } from './extraction';
import { stepFootsteps } from './footsteps';
import { stepWalkCycle } from './hitbox';
import { type CharacterMover, createMovementScratch, type MovementScratch, stepMovement } from './movement';
import { leanedEye, stepLean } from './lean';
import { stepMagTosses, tossMag } from './magShare';
import { createPropNoiseContext, type PropNoiseContext, readyQuiet, stepPropBump } from './propNoise';
import { refillSpares, stepRangeTargets } from './rangeTargets';
import { stepTorch } from './torch';
import { createRng } from './rng';
import { type RoundContext, type RoundRules, stepRound } from './round';
import type { GameState } from './state';
import { createVaultState, stepVault, stepVaultReady, tryVault, type VaultState, vaultingCommand, withVaultPresses } from './vault';
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
  /**
   * Per end, the walking distance to its dead zone over `nav` (buildDistanceField), when already built for these
   * spots on this grid; absent, the context builds them (createEliminationContext).
   */
  deadZoneFields?: readonly Float32Array[] | undefined;
  /** Round length, pause between rounds, wins needed, flag rules. */
  rounds: RoundRules;
  /** The flagpole, at end 1 where the defenders start (map data; absent: no flag mode). */
  pole?: Vec3 | undefined;
  /** Elimination's overtime flag spot, near the middle (map data, Dev 6 item 45; absent: no overtime). */
  overtimeFlag?: Vec3 | undefined;
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
  /**
   * Followed while vaulting (M102): the controller's view, the trigger and aim as the vault found them, nothing else (no
   * firing, aiming, reloading or switching starts; sim/vault.ts vaultingCommand).
   */
  vaultCommand: PlayerCommand;
  /** The first command after a vault, with the presses made during it (BP5, sim/vault.ts withVaultPresses). */
  afterVaultCommand: PlayerCommand;
  /** Where the tick's vault answer puts the vault it finds (DX6, sim/vault.ts stepVaultReady); never read. */
  vaultCheck: VaultState;
  muzzle: Muzzle;
  /** Reused every tick; the state-dependent fields are filled in by stepSimulation. */
  armament: ArmamentContext;
  targets: BBTargets;
  round: RoundContext;
  /** The noisy props' rules (NP1): the map's props (WorldQuery.noisyProps); the state-dependent fields filled each tick. */
  propNoise: PropNoiseContext;
}

export function createSimContext(services: SimServices): SimContext {
  return {
    ...services,
    scratch: createMovementScratch(),
    idleCommand: createCommand(),
    eliminatedCommand: createCommand(),
    vaultCommand: createCommand(),
    afterVaultCommand: createCommand(),
    vaultCheck: createVaultState(),
    muzzle: { eye: vec3(), yaw: 0, pitch: 0, spreadScale: 1, kickScale: 1 },
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
      elimination: createEliminationContext(services.deadZones, services.nav, services.navSnap, services.deadZoneFields),
    },
    round: { rules: services.rounds, pole: services.pole, spawns: services.spawns ?? [], spawnLift: services.spawnLift ?? 0, extraction: services.extraction, overtimeFlag: services.overtimeFlag },
    propNoise: createPropNoiseContext(NOISE, services.query.noisyProps),
  };
}

/**
 * Advances the whole game by one fixed tick. Each character is driven by the command stored under
 * its id; the player and bots are indistinguishable here. Characters without a command this tick
 * keep their view and stand still (gravity still applies); characters that have been hit follow the
 * hit-calling routine instead of their command; once out and standing in the dead zone they are only timed (isParked).
 * Order: move (a vault's start and its tick in place of the movement step; a run into a noisy prop sounds it, NP1; then
 * footsteps), lean and settle the aim, then use replicas (BBs leave from the new eye position) and toss a magazine to a
 * teammate (MG1), then fly BBs (hitting walls or characters), then land the magazines in the air, then round flow.
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
  const noise = ctx.propNoise;
  readyQuiet(state.propQuiet, noise.props.length);
  noise.quiet = state.propQuiet;
  noise.time = state.time;
  noise.events = state.events;
  // Once the round is decided it's a cease-fire, as after the end whistle at a site: nobody can fire,
  // and BBs still in the air can't hit anyone (they still stop on whoever they reach, M85).
  const live = state.round.phase === 'live';
  ctx.targets.ceaseFire = !live;
  // One walk-off route search a tick at most (M27): a victim hit last tick gets its route before it is stepped.
  planWalkOffRoutes(state.characters, ctx.targets.elimination);

  for (const c of state.characters) {
    copy(c.prevPosition, c.position);
    c.prevCrouchAmount = c.crouchAmount;
    c.prevLean = c.lean;
    c.prevWalkCycle = c.walkCycle;
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
    // A Jump press at a low obstacle vaults it instead (M102); while vaulting, only the view follows the command, the
    // trigger and aim stay as they were, and other presses wait for the vault's end (BP5, sim/vault.ts).
    if (inPlay && !c.vault.active) {
      cmd = withVaultPresses(c.vault, cmd, ctx.afterVaultCommand);
      tryVault(c, cmd, ctx.movement, ctx.body, ctx.query, state.events);
    }
    if (inPlay && c.vault.active) cmd = vaultingCommand(c, cmd, ctx.vaultCommand);
    if (inPlay) stepAiming(c, cmd, dt);
    else {
      c.aiming = false;
      c.aimRaise = 0;
    }
    c.using = inPlay && live && cmd.use;
    // A vault under way finishes even if its vaulter is hit meanwhile (nobody is left hanging over the obstacle).
    if (c.vault.active) stepVault(c, cmd, ctx.movement, dt, ctx.mover, ctx.scratch);
    else {
      stepMovement(c, cmd, ctx.movement, dt, ctx.mover, ctx.scratch);
      // Ran into a noisy prop (NP1): it sounds. A vault makes its own noise; someone hit and walking off makes none.
      if (inPlay && noise.props.length > 0) stepPropBump(c, ctx.scratch.desired, ctx.scratch.corrected, dt, ctx.body.radius, ctx.body.height, noise);
    }
    rescueIfOutOfWorld(c, ctx.killY);
    stepWalkCycle(c, ctx.hits); // the legs' swing, for their hit volumes and the drawn figure (M85)
    stepLean(c, cmd, ctx.body, ctx.hits, ctx.movement, ctx.query, dt);
    stepAccuracy(c, ctx.movement, dt);
    // Would a Jump press vault now (DX6)? The tick's answer, for the prompt.
    stepVaultReady(c, cmd, inPlay, ctx.movement, ctx.body, ctx.query, ctx.vaultCheck);
    if (!inPlay) {
      stepElimination(c, ctx.hits, dt);
      continue;
    }
    stepFootsteps(c, ctx.footsteps, state.events, ctx.query);

    const m = ctx.muzzle;
    leanedEye(c, ctx.body, ctx.hits, m.eye); // BBs leave from the eyes, wherever a lean puts them
    m.yaw = c.yaw;
    m.pitch = c.pitch;
    m.spreadScale = c.spreadScale;
    // Fired on the run the kick grows (the owner's 0.1 Dev 5 note 9), as the spread does.
    m.kickScale = c.sprinting ? ctx.movement.accuracy.sprintKick : 1;
    // No shot through a vault or the moment after it (M102); a click in that moment is kept until it ends.
    armCtx.fireHoldOff = c.vault.active ? 0 : c.fireLockout;
    stepArmament(c.id, c.armament, cmd, m, live && c.fireLockout <= 0, armCtx, dt);
    // After the armament: a switch this tick to a replica without a light puts the torch out (M33h).
    stepTorch(c, cmd, state.events, dt);
    // A magazine tossed to a teammate (MG1): only while the round is live.
    if (live && cmd.tossMag >= 0) tossMag(c, cmd.tossMag, state.characters, state.magTosses, ctx, state.events);
  }

  if (ctx.wind) windAt(ctx.wind, state.time, state.wind);
  stepBBs(state.bbs, ctx.ballistics, ctx.query, ctx.killY, state.events, dt, ctx.targets, state.rng, state.wind, noise.props.length > 0 ? noise : undefined);
  // After the BBs: a catcher hit this tick is out of play, and the magazine is lost (MG1).
  stepMagTosses(state.magTosses, state.characters, live, state.events, dt);
  if (ctx.practice) {
    stepRangeTargets(state.targets, dt, state.rng);
    for (const c of state.characters) refillSpares(c.armament);
  } else {
    stepRound(state.round, state.characters, state.bbs, ctx.round, state.events, dt);
  }
  state.tick++;
  state.time += dt;
}

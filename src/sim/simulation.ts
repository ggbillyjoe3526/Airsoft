import type { BallisticsConfig } from '../config/ballistics';
import type { BodyConfig, MovementConfig } from '../config/movement';
import type { ReplicaConfig } from '../config/replicas';
import { type ArmamentContext, type Muzzle, stepArmament, type WorldQuery } from './armament';
import { stepBBs } from './bbs';
import { eyeHeight, rescueIfOutOfWorld } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { type CharacterMover, createMovementScratch, type MovementScratch, stepMovement } from './movement';
import type { GameState } from './state';
import { copy, vec3 } from './vec';

export interface SimServices {
  mover: CharacterMover;
  query: WorldQuery;
  movement: MovementConfig;
  body: BodyConfig;
  ballistics: BallisticsConfig;
  loadout: readonly ReplicaConfig[];
  /** Anything below this height has left the level (map data). */
  killY: number;
}

/** Services and tuning the simulation needs from outside, plus reusable scratch. */
export interface SimContext extends SimServices {
  scratch: MovementScratch;
  /** Used for characters that have no command this tick. */
  idleCommand: PlayerCommand;
  muzzle: Muzzle;
}

export function createSimContext(services: SimServices): SimContext {
  return {
    ...services,
    scratch: createMovementScratch(),
    idleCommand: createCommand(),
    muzzle: { eye: vec3(), yaw: 0, pitch: 0 },
  };
}

/**
 * Advances the whole game by one fixed tick. Each character is driven by the command stored under
 * its id; the player and bots are indistinguishable here. Characters without a command this tick
 * keep their view and stand still (gravity still applies). Order: move, then use replicas (BBs leave
 * from the new eye position), then fly BBs.
 */
export function stepSimulation(
  state: GameState,
  commands: ReadonlyMap<number, PlayerCommand>,
  ctx: SimContext,
  dt: number,
): void {
  state.events.length = 0;
  const armCtx: ArmamentContext = {
    loadout: ctx.loadout,
    ballistics: ctx.ballistics,
    bbs: state.bbs,
    rng: state.rng,
    query: ctx.query,
    events: state.events,
  };

  for (const c of state.characters) {
    copy(c.prevPosition, c.position);
    c.prevCrouchAmount = c.crouchAmount;
    let cmd = commands.get(c.id);
    if (!cmd) {
      cmd = ctx.idleCommand;
      cmd.yaw = c.yaw;
      cmd.pitch = c.pitch;
    }
    stepMovement(c, cmd, ctx.movement, dt, ctx.mover, ctx.scratch);
    rescueIfOutOfWorld(c, ctx.killY);

    const m = ctx.muzzle;
    m.eye.x = c.position.x;
    m.eye.y = c.position.y + eyeHeight(c.crouchAmount, ctx.body);
    m.eye.z = c.position.z;
    m.yaw = c.yaw;
    m.pitch = c.pitch;
    const canFire = !c.sprinting && c.sprintLockout <= 0;
    stepArmament(c.id, c.armament, cmd, m, canFire, armCtx, dt);
  }

  stepBBs(state.bbs, ctx.ballistics, ctx.query, ctx.killY, state.events, dt);
  state.tick++;
  state.time += dt;
}

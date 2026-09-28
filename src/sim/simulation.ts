import type { MovementConfig } from '../config/movement';
import { rescueIfOutOfWorld } from './character';
import { createCommand, type PlayerCommand } from './commands';
import { type CharacterMover, createMovementScratch, type MovementScratch, stepMovement } from './movement';
import type { GameState } from './state';
import { copy } from './vec';

/** Services and tuning the simulation needs from outside (physics, config, level limits), plus reusable scratch. */
export interface SimContext {
  mover: CharacterMover;
  movement: MovementConfig;
  /** Characters falling below this height are returned to their spawn (map data). */
  killY: number;
  scratch: MovementScratch;
  /** Used for characters that have no command this tick. */
  idleCommand: PlayerCommand;
}

export function createSimContext(mover: CharacterMover, movement: MovementConfig, killY: number): SimContext {
  return { mover, movement, killY, scratch: createMovementScratch(), idleCommand: createCommand() };
}

/**
 * Advances the whole game by one fixed tick. Each character is driven by the command stored
 * under its id; the player and bots are indistinguishable here. Characters without a command
 * this tick keep their view and stand still (gravity still applies).
 */
export function stepSimulation(
  state: GameState,
  commands: ReadonlyMap<number, PlayerCommand>,
  ctx: SimContext,
  dt: number,
): void {
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
  }
  state.tick++;
  state.time += dt;
}

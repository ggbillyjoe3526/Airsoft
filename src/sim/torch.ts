import type { LightId } from '../config/torches';
import type { Character } from './character';
import type { PlayerCommand } from './commands';
import { isInPlay } from './elimination';
import type { GameEvent } from './events';

/**
 * The weapon torch (M33h): a light fitted to a replica (ReplicaParts.light), switched on and off through the command
 * like any other control, so the player and the bots work it the same way. Plain data on the character; what it lights
 * is worked out by map/torchLight.ts (for the bots) and drawn by render/torchBeams.ts.
 */

/** The light fitted to the replica in `c`'s hands, or null. */
export function lightInHand(c: Character): LightId | null {
  const a = c.armament;
  return a.parts[a.active]?.light ?? null;
}

/** Whether `c`'s torch is lit right now: switched on, on the replica in hand, and in play. */
export function torchLit(c: Character): boolean {
  return c.torchOn && isInPlay(c) && lightInHand(c) !== null;
}

/**
 * One tick of the torch for a character in play: the command's toggle switches it (a click event), only with a light
 * on the replica in hand; switching to a replica without one turns it off. Allocates only the event of a switch.
 */
export function stepTorch(c: Character, cmd: PlayerCommand, events: GameEvent[], dt: number): void {
  c.torchTime += dt;
  const fitted = lightInHand(c) !== null;
  if (!fitted) {
    c.torchOn = false;
    return;
  }
  if (!cmd.toggleTorch) return;
  c.torchOn = !c.torchOn;
  c.torchTime = 0;
  events.push({ type: 'torch', characterId: c.id, on: c.torchOn });
}

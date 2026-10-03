import type { Character } from '../sim/character';

/** A body movement worth a rustle of kit: dropping into a crouch, standing back up, or starting to lean out. */
export type FoleyMove = 'crouch' | 'stand' | 'lean';

/** Less change per tick than this (crouch 0..1, lean -1..1) counts as holding still. */
const MOTION_EPSILON = 1e-4;

/** Which way a value moved this tick: -1, 0 or 1. */
function motion(now: number, prev: number): number {
  const d = now - prev;
  return d > MOTION_EPSILON ? 1 : d < -MOTION_EPSILON ? -1 : 0;
}

/**
 * Turns characters' crouch and lean into rustle cues, once per movement: when a crouch, a stand or a lean away
 * from upright starts, not every tick it continues. Leaning back to upright is quiet. Presentation only (bots
 * don't hear these); call once per simulation tick.
 */
export class FoleyTracker {
  private readonly crouchMotion = new Map<number, number>();
  private readonly leanMotion = new Map<number, number>();

  /** Calls `onMove` for each movement that started this tick. Characters that aren't alive are skipped. */
  update(characters: readonly Character[], onMove: (c: Character, move: FoleyMove) => void): void {
    for (const c of characters) {
      const crouch = c.status === 'alive' ? motion(c.crouchAmount, c.prevCrouchAmount) : 0;
      if (crouch !== 0 && crouch !== (this.crouchMotion.get(c.id) ?? 0)) onMove(c, crouch > 0 ? 'crouch' : 'stand');
      this.crouchMotion.set(c.id, crouch);
      // Moving away from upright (the lean growing in either direction) is the start of a peek.
      const lean = c.status === 'alive' ? motion(Math.abs(c.lean), Math.abs(c.prevLean)) : 0;
      if (lean > 0 && (this.leanMotion.get(c.id) ?? 0) <= 0) onMove(c, 'lean');
      this.leanMotion.set(c.id, lean);
    }
  }
}

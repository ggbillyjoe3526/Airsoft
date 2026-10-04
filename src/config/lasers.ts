/**
 * Lasers (M26): a part on a replica's laser rail, unlocked from the asset pool (pool.md). A laser makes the replica
 * steadier from the hip: its dot shows where the BB will go, so the shots group tighter without raising a sight.
 * First guesses for the owner's playtest.
 */
export type LaserId = 'redLaser';

export interface LaserConfig {
  /** Multiplies the replica's spread (below 1 is tighter). */
  spreadScale: number;
  /** The dot's colour (presentation). */
  colour: number;
}

export const LASERS: Readonly<Record<LaserId, LaserConfig>> = {
  redLaser: { spreadScale: 0.8, colour: 0xff2a2a },
};

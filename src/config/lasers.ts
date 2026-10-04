/**
 * Lasers (M26): a part on a replica's laser rail, unlocked from the asset pool (pool.md). A laser makes the replica
 * steadier from the hip: the shots group tighter without raising a sight. (No dot is drawn in the world yet:
 * KNOWN_ISSUES.)
 * First guesses for the owner's playtest.
 */
export type LaserId = 'redLaser';

export interface LaserConfig {
  /** One line on the Loadout's Customise screen. */
  blurb: string;
  /** Multiplies the replica's spread (below 1 is tighter). */
  spreadScale: number;
  /** The dot's colour (presentation). */
  colour: number;
}

export const LASERS: Readonly<Record<LaserId, LaserConfig>> = {
  redLaser: { blurb: 'A laser module on the rail: steadier from the hip, the shots group tighter without a sight.', spreadScale: 0.8, colour: 0xff2a2a },
};

import type { Character } from './character';

/**
 * What the "what got you" card (M41) says about the hit that put the player out, as plain data kept at hit time. One
 * record is reused for every hit (nothing is allocated per tick or per hit); the bots' controller fills it, since only
 * it knows what a bot was doing (ai/botController.ts), and the presentation reads it the tick the hit comes in.
 */
export interface HitFacts {
  /** Simulation time of the hit (-Infinity: none yet). */
  time: number;
  victimId: number;
  shooterId: number;
  /** The direction the BB travelled, as a yaw in the BB's direction convention (atan2 of x, z): from the shooter to the victim. */
  yaw: number;
  /** Metres between the two, along the floor. */
  distance: number;
  /** The victim was moving (their horizontal speed was at least `movingSpeed` m/s) as the BB hit. */
  moving: boolean;
  /** The BB had bounced first. */
  ricochet: boolean;
  /** The shooter was on the victim's team (friendly fire). */
  friendly: boolean;
  /**
   * The shooter was a bot that was holding an angle (still, its view already on the spot) when it first saw the victim;
   * false: it was not; null: not known (the shooter is not a bot, or fired on your own side, or the BB was a ricochet).
   */
  held: boolean | null;
  /** Seconds the victim had been in the shooter's view, unbroken, at the hit; null: not known. */
  inView: number | null;
}

export function createHitFacts(): HitFacts {
  return { time: Number.NEGATIVE_INFINITY, victimId: -1, shooterId: -1, yaw: 0, distance: 0, moving: false, ricochet: false, friendly: false, held: null, inView: null };
}

/** Writes the hit of `victim` by `shooter` at `time` into `out`; `held` and `inView` are what the shooter's bot knew (see HitFacts). */
export function recordHitFacts(
  out: HitFacts,
  time: number,
  victim: Character,
  shooter: Character,
  ricochet: boolean,
  held: boolean | null,
  inView: number | null,
  movingSpeed: number,
): void {
  const dx = victim.position.x - shooter.position.x;
  const dz = victim.position.z - shooter.position.z;
  out.time = time;
  out.victimId = victim.id;
  out.shooterId = shooter.id;
  out.yaw = Math.atan2(dx, dz);
  out.distance = Math.hypot(dx, dz);
  out.moving = Math.hypot(victim.velocity.x, victim.velocity.z) >= movingSpeed;
  out.ricochet = ricochet;
  out.friendly = victim.team === shooter.team;
  out.held = held;
  out.inView = inView;
}

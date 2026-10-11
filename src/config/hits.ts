import { FLAG } from './modes';

export interface HitConfig {
  bodyRadius: number;
  bodyBottom: number;
  bodyTop: number;
  headHeight: number;
  headRadius: number;
  crouchDrop: number;
  friendlyFire: boolean;
  /** A BB that has bounced (a ricochet) knocks out whoever it hits; when false it only ticks them (M20, Match pop-up). */
  ricochetsCount: boolean;
  callTime: number;
  walkOffSpeed: number;
  walkOffTime: number;
  deadZoneArrive: number;
  waypointReach: number;
  stuckSpeed: number;
  stuckTime: number;
  vanishTime: number;
  /**
   * Leaning (peeking around cover): the upper body tilts sideways about a pivot at the hips. Everything
   * that leans (eyes and BB origin, hit volume, the drawn figure, what bots see) uses this one geometry.
   */
  lean: {
    /** Tilt at full lean (radians). */
    maxAngle: number;
    /** Height of the pivot (the hips) above the feet when standing; crouching lowers it by crouchDrop. */
    pivotHeight: number;
  };
  /**
   * A player's chest volume (M85): a capsule `bodyRadius` round, its spheres' centres this high above the feet,
   * standing; it rolls with a lean. `bodyBottom` and `bodyTop` are the practice range figures' (sim/rangeTargets.ts) and
   * the shoulders' wall check for leaning (sim/lean.ts).
   */
  torsoBottom: number;
  torsoTop: number;
  /** The hips: two capsules side by side, `halfWidth` either side of the middle, spheres from `bottom` to `top`. */
  hips: { bottom: number; top: number; halfWidth: number; radius: number };
  /**
   * The legs (M85): each swings about its hip (lean.pivotHeight, `hipSpread` to either side) on the walk cycle and is
   * squashed towards the hips when crouching, as the drawn figure's are (config/characters.ts takes these numbers). A
   * thigh, a shin and a boot capsule each. Heights are below the hip, standing; z is forward-negative, as the figure.
   */
  legs: {
    hipSpread: number;
    /** The thigh's top above the hip pivot, the knee and the ankle below it (metres), and the knee's z. */
    hipLift: number;
    knee: number;
    kneeZ: number;
    ankle: number;
    thighRadius: number;
    shinRadius: number;
    /** The boot: its middle this far below the hip, from `heel` to `toe` (z) as a capsule of `radius`. */
    boot: { drop: number; heel: number; toe: number; radius: number };
    /** Walk cycle: leg swing at full stride (radians) and strides per metre walked, as the figures draw it. */
    swing: number;
    stridesPerMetre: number;
    /** Legs swing only above this speed (m/s); more than `maxStride` (m) in one tick is a teleport, not a step. */
    walkingSpeed: number;
    maxStride: number;
  };
}

/**
 * Hit rules and hit calling. One BB hit and you're out: call it (hand up, "HIT!"), walk off to the
 * dead zone, wait for the next round.
 */
export const HITS: HitConfig = {
  /**
   * Hit volume, matching the figure players see (config/characters.ts builds the figure from these
   * numbers): an upright body capsule from the boots to the shoulders, as wide as the torso and legs,
   * plus a head sphere covering head, cap and goggles. Heights are from the feet, standing.
   */
  bodyRadius: 0.2,
  bodyBottom: 0.02,
  bodyTop: 1.5,
  headHeight: 1.62,
  headRadius: 0.13,
  /**
   * Crouching lowers everything above the hips this far. Crouched, the head top is at 1.13 m, so
   * 1.2 m crouch cover hides you completely.
   */
  crouchDrop: 0.62,
  /** Friendly hits count, as they do at a real site. A match can turn it off (config/matchRules.ts). */
  friendlyFire: true,
  /** Ricochets don't count unless the match says so (owner, M20): a bounced BB ticks you, but you play on. */
  ricochetsCount: false,
  /** Seconds a hit player stands still with a hand up calling the hit. */
  callTime: 1.4,
  /** Walk-off pace as a fraction of the normal (run) speed: a brisk walk-off, so it fits in walkOffTime. */
  walkOffSpeed: 0.8,
  /**
   * Longest walk-off (seconds); anyone still walking then leaves the field. The longest route on Depot (from the far
   * quarter to the other end's dead zone, 58 m) takes 17.2 s at walk-off pace; 14 s cut it short (audit SIM-06), so
   * 20 s, checked for every point of the map in depot.test.ts.
   */
  walkOffTime: 20,
  /**
   * Close enough to the dead-zone spot to stop walking (metres). Well under half the spots' spacing, so
   * teammates who walk in from the same side don't end up standing inside each other.
   */
  deadZoneArrive: 0.15,
  /** A route waypoint counts as reached within this distance (metres). */
  waypointReach: 0.4,
  /**
   * Walking off slower than this (m/s) for `stuckTime` seconds counts as blocked: the character leaves
   * the field instead of grinding against cover.
   */
  stuckSpeed: 0.5,
  stuckTime: 0.5,
  /** Leaving the field: the figure stands and fades out over this long, then appears in the dead zone. */
  vanishTime: 0.6,
  /**
   * About 34°: the eyes move ~0.4 m sideways (enough to see past a corner from a body-width back) and drop
   * ~0.12 m; the legs stay put. The pivot is the drawn figure's hip height (config/characters.ts uses it).
   */
  lean: { maxAngle: 0.6, pivotHeight: 0.92 },
  /**
   * Measured against the drawn figure (render/figureHitVolume.test.ts, M85). The chest with its plate carrier, pouches
   * and pack is about as deep as it is wide, so round, from the cummerbund (1.15 m) to the top of the plates (1.52 m).
   * The hips and belt below are an oval, 0.34 m across and 0.22 m deep. Below them only the two legs are drawn, with a
   * gap between: one round volume down to the boots (before M85) caught BBs on thin air from the side.
   */
  torsoBottom: 1.2,
  torsoTop: 1.4,
  hips: { bottom: 0.95, top: 1.05, halfWidth: 0.06, radius: 0.11 },
  /**
   * Measured against the drawn legs (render/figureHitVolume.test.ts): a thigh tapering from 0.094 m to 0.064 m, a shin
   * about 0.055 m, the knee pad, and a boot 0.3 m long and 0.1 m tall (render/figureHuman.ts humanLeg).
   */
  legs: {
    hipSpread: 0.095,
    hipLift: 0.03,
    knee: 0.44,
    kneeZ: -0.015,
    ankle: 0.78,
    thighRadius: 0.085,
    shinRadius: 0.062,
    boot: { drop: 0.874, heel: 0.058, toe: -0.148, radius: 0.05 },
    swing: 0.55,
    stridesPerMetre: 0.75,
    walkingSpeed: 0.2,
    maxStride: 1,
  },
};

/**
 * Match flow: 3v3 rounds against the clock (elimination or flag, see config/modes.ts), first to 5 round wins. These are
 * the defaults; the Match pop-up changes team size, rounds to win and round time (config/matchRules.ts).
 */
export const ROUNDS = {
  /** Players per team, including the local player on team 0. */
  teamSize: 3,
  /** Round length (s). Elimination: a round that runs out of time is a draw (nobody scores). Flag: the defenders win it. */
  roundTime: 150,
  /** Seconds between a round ending and everyone respawning. */
  resetDelay: 4,
  /** Round wins needed to win the match. */
  winsNeeded: 5,
  /** First to 5 is at most 9 decided rounds: swap ends after 4, so the decider is in the second half. */
  halfTimeAfter: 4,
  /**
   * Elimination: Blue starts in the east. On Depot the east end wins a little over half the rounds in bot-only
   * matches (54%, DECISIONS 2026-10-03), so the player's team plays its first rounds, the ones that teach the map, there.
   */
  eliminationFirstEnd: 1,
  /** The lead a team needs once it has `winsNeeded` round wins: 1, the first there wins (Win by two sets 2, M39). */
  winBy: 1,
  /** Elimination: a round that runs out of time is a draw, played again (the Rules picker can give it to the side with more players left, M39). */
  timeOutToMorePlayers: false,
  flag: FLAG,
} as const;

/**
 * Settings › Gameplay › Hit marker (M97, owner's playtest note of 2026-10-07): the red X over the crosshair when your BB
 * lands. Off by default (his call); the hit tick you hear plays either way.
 */
export const HIT_MARKER_CHOICES: readonly { id: 'on' | 'off'; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'Only the tick you hear tells you a BB landed.' },
  { id: 'on', label: 'On', blurb: 'A red X flashes over the crosshair as well as the tick.' },
];
export const DEFAULT_HIT_MARKER = false;

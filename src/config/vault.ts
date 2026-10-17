/**
 * Vaulting (M102, 0.1 Dev 6): Jump pressed at a low obstacle takes you over it in one short, committed move (sim/vault.ts).
 * Heights are measured from the floor you take off from (owner, 2026-10-12: obstacles of 0.7 to 0.9 m, crouch cover
 * stays peek-only). Units: metres, seconds, radians. First guesses, to tune in play.
 */
export interface VaultConfig {
  /** The obstacle's top, above the floor you take off from: the lowest and the highest you vault. */
  minHeight: number;
  maxHeight: number;
  /**
   * The obstacle's top at most this far above the floor you land on: only an obstacle low from both sides is vaulted, so
   * 1.2 m crouch cover never is, not even from a raised side (a ramp beside it, the uphill side of a log on a slope), and
   * nothing takes you down off a balcony's edge.
   */
  maxLandingHeight: number;
  /** The floor you land on at most this far above the one you take off from (the far side of a slope). */
  maxClimb: number;
  /** The deepest obstacle you vault over, along the way you go (a wall, a barrier, a crate; never a platform). */
  maxDepth: number;
  /** How far in front of the body (from its surface) a Jump press finds an obstacle: `reach` plus `reachPerSpeed` × speed. */
  reach: number;
  reachPerSpeed: number;
  /** The height above the floor the face of the obstacle is looked for at (over any kerb you walk onto). */
  faceProbe: number;
  /** The top is flat: every sample of it within this of the first. */
  topTolerance: number;
  /** Spacing of the samples along the top that find its far side. */
  depthStep: number;
  /** Room kept between the far side and the body where it lands. */
  landingRoom: number;
  /** The feet pass this far over the top. */
  clearance: number;
  /** The largest angle between the vault's way and the view: nobody vaults backwards, blind. */
  maxViewAngle: number;
  /** The rise onto the top takes at least this long. */
  riseTime: number;
  /** Speed across the top: the speed you came in at, held between these. */
  minSpeed: number;
  maxSpeed: number;
  /** How high the body arcs over the top, on top of `clearance`. */
  arc: number;
  /** Speed downwards handed to the fall at the far side: the push off the top. */
  dropSpeed: number;
  /** How far the body tucks over the top, as a crouch (0..1): the eyes, the hit volume and the figure all follow it. */
  tuck: number;
  /** The replica stays carried (no firing) through the vault and this long after it (Character.fireLockout). */
  fireLockout: number;
  /** A body held back this far from its path (by a wall it couldn't see) gives up the vault and falls where it is. */
  blockedAt: number;
  /**
   * Presentation (render/match/cameraRig.ts): the view dips (`pitch`, down) and tips (`roll`) at the middle of a vault, eased
   * in and out, so it reads as a hop over rather than a lift. Less with reduced motion.
   */
  camera: { pitch: number; roll: number };
}

const DEG = Math.PI / 180;

export const VAULT: VaultConfig = {
  minHeight: 0.6,
  maxHeight: 0.95,
  // As high as a vault from this side (M102's critic: a crouch log on Woodland's Knoll was only 0.63 to 0.92 m over
  // its uphill side, and 1.15 let a vault down its far side).
  maxLandingHeight: 0.95,
  maxClimb: 0.3,
  maxDepth: 1.0,
  reach: 0.55,
  reachPerSpeed: 0.12,
  faceProbe: 0.4,
  topTolerance: 0.1,
  depthStep: 0.1,
  landingRoom: 0.12,
  clearance: 0.08,
  maxViewAngle: 70 * DEG,
  riseTime: 0.16,
  minSpeed: 3.5,
  maxSpeed: 5,
  arc: 0.04,
  dropSpeed: 2.5,
  tuck: 0.6,
  fireLockout: 0.3,
  blockedAt: 0.12,
  camera: { pitch: 4 * DEG, roll: 3 * DEG },
};

/**
 * The maps' low walls built to be vaulted (M102: Depot's office, Woodland's cabin, Neon Heights' Capsules, the range):
 * the top of the owner's 0.7 to 0.9 m. Lower ones a plain jump rides over too often (Rapier's capsule slides up the
 * edge: about one jump in nine over 0.85 m, one in thirty over 0.9 m), and none is deeper than a wall (0.4 m), so
 * nobody stands on one. Not cover: a crouched player's eyes are over it. Map checks find them by this height.
 */
export const VAULT_WALL_HEIGHT = 0.9;
/** The deepest of those walls: thinner than a body, so its top is never somewhere to stand. */
export const VAULT_WALL_MAX_DEPTH = 0.4;

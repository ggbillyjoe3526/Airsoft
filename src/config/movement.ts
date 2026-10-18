import { PHYSICS } from './physics';
import { SIM_DT } from './sim';
import { VAULT, type VaultConfig } from './vault';

/** Character movement tuning. Units: metres, seconds, radians. */
export interface MovementConfig {
  /** Normal pace, with no modifier key. */
  runSpeed: number;
  /** Walking (hold the walk key): slow and quiet, for sneaking and holding angles. */
  walkSpeed: number;
  /** Sprinting, with the replica in hand or holstered: the top speed, which the holster never adds to. */
  sprintSpeed: number;
  /**
   * The normal pace with the replica holstered (M92; the owner's Dev 6 playtest note 27): faster than `runSpeed` without
   * holding sprint, never as fast as `sprintSpeed`. Paid for with the slower draw from the holster (HOLSTER.drawScale).
   */
  holsterRunSpeed: number;
  crouchSpeed: number;
  /** Horizontal acceleration while grounded and pushing a direction (m/s^2). */
  groundAccel: number;
  /** Horizontal deceleration while grounded and not pushing (m/s^2). */
  groundDecel: number;
  airAccel: number;
  gravity: number;
  /** Terminal fall speed (m/s). Keeps falls readable and collision stable. */
  maxFallSpeed: number;
  jumpSpeed: number;
  /** Minimum time between jumps, keeps jumping "limited" and bunny-hop free. */
  jumpCooldown: number;
  /**
   * A jump press is kept this long (seconds) and fires as soon as a jump is allowed: pressed a tick or two before
   * landing, or while still standing up from a crouch (audit SIM-05, owner 2026-10-04). The cooldown still limits it.
   */
  jumpBuffer: number;
  /** Sprint only counts when forward input is at least this. */
  sprintMinForward: number;
  /** Seconds to go fully between standing and crouched (eye height blend). */
  crouchTransitionTime: number;
  /** At or above this crouch amount the character counts as crouched: no sprinting or jumping. */
  crouchedThreshold: number;
  /**
   * While rising, if the collision-corrected upward move is below this fraction of the intended one,
   * we hit a ceiling and stop rising. Sliding along walls trims upward moves by tiny amounts, so a
   * strict comparison would kill jumps next to cover.
   */
  ceilingBlockFraction: number;
  /**
   * A standing character stays glued to ground up to this far below its feet (so it follows small
   * drops such as stepping off a ledge). Larger drops become a fall. Deeper than the fastest pace drops in a tick
   * down the steepest ramp (the sprint: 6.3 m/s × 1/60 s × 0.5 = 5.3 cm) plus the probe rounding the ramp's
   * crest: at 6 cm that sprint left the ground for 0.3 s over the top of Neon Heights' stairs (BN1).
   */
  groundSettleDistance: number;
  /** Movement input magnitude below this is treated as no input. */
  inputDeadzone: number;
  /**
   * Up a ramp the character controller slides a level move up the slope and keeps only about cos²θ of it, so a sprint
   * lost a quarter of its pace on Depot's ramps (audit SIM-17). The move is lengthened by 1 + rampPace · rise², where
   * rise is the slope climbed on the last tick (rise per metre); 1 gives the pace back in full, 0 turns this off.
   */
  rampPace: number;
  /**
   * A climb steeper than this (rise per metre) is a step onto a ledge, not a ramp, and isn't lengthened. A little over
   * PHYSICS.maxRampSlope, the steepest ramp a map may use.
   */
  rampMaxRise: number;
  maxPitch: number;
  /** Seconds to go from upright to a full lean (Q / E held). */
  leanTime: number;
  /** A leaning head stays at least this far from walls (metres), so you never see or shoot through them. */
  leanWallClearance: number;
  /** From this much of a full lean (0..1) you move at walking pace, quietly; less slows you part of the way. */
  leanQuietFrom: number;
  /**
   * Holding walk while aiming down sights (M84, owner's playtest note 8): the aiming pace (walkSpeed) times this, a
   * slower, steadier creep.
   */
  aimWalkScale: number;
  /** How a shooter's stance and movement scale their replica's spread (see sim/accuracy.ts). */
  accuracy: AccuracyConfig;
  /** Vaulting over low obstacles (M102, sim/vault.ts). */
  vault: VaultConfig;
}

/**
 * Accuracy by stance and movement: multipliers on a replica's spreadDeg. Standing still is the
 * reference (1); crouching steadies; walking, running, jumping and sprinting shake the aim. The
 * multiplier jumps up at once when you start moving. Once you stop walking or running it locks back on
 * almost at once (lockTime); the moments just after a sprint or a landing stay shaky (settleTime).
 */
export interface AccuracyConfig {
  /** Below this horizontal speed (m/s) a character counts as still. */
  stillBelow: number;
  /**
   * Holding still steadies the aim further: the multiplier eases from 1 down to `steady` over `steadyTime`
   * seconds of standing still on the ground (owner, 2026-10-03: the stiller you are, the more accurate).
   */
  steady: number;
  steadyTime: number;
  /** At walking pace (walkSpeed) and at the normal pace (runSpeed); in between it blends linearly. */
  walk: number;
  run: number;
  /**
   * While sprinting: you can fire on the run (owner's 0.1 Dev 5 playtest, note 9), far wider than walking or running,
   * and the shake carries into the moments after.
   */
  sprint: number;
  /** Each shot's kick is multiplied by this while sprinting: firing on the run climbs faster too. */
  sprintKick: number;
  /** Off the ground (jumping, falling); the shake carries into the landing. */
  air: number;
  /**
   * Seconds off the ground before `air` applies (a jump applies it at once). A brief loss of ground contact
   * (a step down, a bump in the floor) then never flashes the spread wide.
   */
  airSpreadDelay: number;
  /** Multiplier for being fully crouched and still (applied on top of the movement one). */
  crouched: number;
  /**
   * Multiplier with the sight raised to your eye (M84: iron sights or an optic), on top of the others: it eases in as
   * the sight comes up (Character.aimRaise).
   */
  aimed: number;
  /**
   * The crouch multiplier once moving at crouchSpeed (blended from `crouched` by speed above stillBelow): crouching
   * steadies a still shooter much more than a moving one, so crouch-walking is never as accurate as standing still
   * (audit SIM-10).
   */
  crouchedMoving: number;
  /**
   * Seconds for the multiplier to settle back (time constant) after a sprint or time in the air: those shakes
   * carry into the moments after, for `carryTime` seconds since the sprint or the landing.
   */
  settleTime: number;
  carryTime: number;
  /**
   * Time constant (s) for settling once walking or running stops: the aim locks on almost at once (owner,
   * 2026-10-03: "instant lock"), so the crosshair snaps in rather than easing.
   */
  lockTime: number;
}

/** Heights are measured from the character's position (capsule bottom), which rests PHYSICS.groundRestGap above the floor. */
export interface BodyConfig {
  radius: number;
  height: number;
  standEyeHeight: number;
  crouchEyeHeight: number;
}

const GRAVITY = 20;

/**
 * Whole ticks, plus one, that a character is off the ground after stepping down a ledge of `ledge` metres, so the
 * in-air spread delay outlasts the drop of the tallest walkable ledge (audit SIM-02: 0.1 s was exactly the time a
 * 0.15 m kerb takes, and the landing tick flashed the spread wide).
 */
function ledgeDropTime(ledge: number, gravity: number, tick: number): number {
  return Math.ceil(Math.sqrt((2 * ledge) / gravity) / tick + 1) * tick;
}

export const MOVEMENT: MovementConfig = {
  runSpeed: 4.2,
  walkSpeed: 2.3,
  sprintSpeed: 6.3,
  // Owner's Dev 6 note 27: holstering alone makes you faster than armed, but no faster than a sprint, and a holstered
  // sprint is the same sprint. Beta 1 playtest item 18 asked for a little faster: about 30 % over the run, 25 m in
  // 4.6 s rather than 6.0, against 4.0 s sprinting.
  holsterRunSpeed: 5.4,
  crouchSpeed: 2.1,
  groundAccel: 45,
  groundDecel: 38,
  airAccel: 6,
  gravity: GRAVITY,
  maxFallSpeed: 30,
  jumpSpeed: 5.4,
  jumpCooldown: 0.55,
  jumpBuffer: 0.1,
  sprintMinForward: 0.5,
  crouchTransitionTime: 0.15,
  crouchedThreshold: 0.5,
  ceilingBlockFraction: 0.5,
  groundSettleDistance: 0.07,
  inputDeadzone: 0.01,
  rampPace: 0,
  rampMaxRise: PHYSICS.maxRampSlope * 1.2,
  maxPitch: Math.PI / 2 - 0.02,
  leanTime: 0.18,
  leanWallClearance: 0.2,
  leanQuietFrom: 0.5,
  // Shift while aiming creeps at 1.4 m/s, against 2.3 aimed or walking (owner's note 8: "the player should slow down").
  aimWalkScale: 0.6,
  accuracy: {
    stillBelow: 0.4,
    // Owner's 0.1 Dev 3 playtest: standing still steadies to ×0.7, and walking with Shift costs ×1.15 (was 1.5); his
    // Dev 6 note 29 asks that Shift's slower pace clearly pays off in accuracy, so walking is now ×1.0.
    // M12a eased to ×0.7 over half a second; the owner found that too slow and smooth and asked for an "instant
    // lock" (2026-10-03), so it now takes a few ticks. Gentler than CS / Valorant, but the same idea.
    steady: 0.7,
    steadyTime: 0.05,
    walk: 1.0,
    run: 2.6,
    // Firing on the run (owner's 0.1 Dev 5 playtest, note 9): ×3.5, three times walking's spread and a third wider than
    // running's, with half as much kick again, so a sprint-and-spray only lands close in.
    sprint: 3.5,
    sprintKick: 1.5,
    air: 4.5,
    // 0.15 s (9 ticks): stepping down PHYSICS.maxWalkableLedge never counts as being in the air.
    airSpreadDelay: ledgeDropTime(PHYSICS.maxWalkableLedge, GRAVITY, SIM_DT),
    crouched: 0.65,
    // Audit SIM-10 (2026-10-04, playtest): ×0.9 at full crouch pace makes crouch-walking ×1.02, a hair worse than
    // standing still (×1.0) and still steadier than walking upright at that pace (×1.13); it was ×0.74.
    crouchedMoving: 0.9,
    // M84 (owner's note 16): the sight at your eye halves the spread; the hip stays as it was and stays viable
    // (measured against Normal bots in ai/aimedFire.test.ts; ×0.65 barely showed past a player's own aim error).
    aimed: 0.5,
    settleTime: 0.15,
    carryTime: 0.25,
    lockTime: 0.015,
  },
  vault: VAULT,
};

/**
 * The holster (M92, the owner's playtest note 3): key 3 puts the replica away for a faster pace without sprinting
 * (MovementConfig.holsterRunSpeed; Dev 6 note 27); drawing it again takes the replica's own draw time (Handling.drawTime) times
 * `drawScale`, so a holstered player is slower to the first shot than one running with the replica ready.
 */
export const HOLSTER = {
  /** The rifle's 0.45 s draw becomes 0.81 s, the pistol's 0.3 s 0.54 s; parts that speed a draw speed this one too. */
  drawScale: 1.8,
} as const;

export const BODY: BodyConfig = {
  radius: 0.32,
  height: 1.8,
  standEyeHeight: 1.62,
  crouchEyeHeight: 1.05,
};

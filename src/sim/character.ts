import type { BodyConfig } from '../config/movement';
import { LOADOUT, type ReplicaConfig } from '../config/replicas';
import { type Armament, createArmament } from './armament';
import { cancelVault, createVaultState, type VaultState } from './vault';
import { copy, type Vec3, vec3 } from './vec';

/**
 * Where a character is in the hit-calling cycle: playing, standing with a hand up calling the hit,
 * walking off to the dead zone, leaving the field (a walk-off that couldn't finish fades out where it
 * is), or out (waiting in the dead zone for the next round).
 */
export type LifeStatus = 'alive' | 'calling' | 'walkingOff' | 'leaving' | 'out';

/** Plain-data character state. No Three.js objects live here. */
export interface Character {
  id: number;
  /**
   * The rigged figure it is drawn as (HV1): 0 the human, 1 the robot (render/figures/figureMix.ts robotFigures, set by the
   * session). Its hit volume takes that figure's shape where the match carries them (HitConfig.figureBodies).
   */
  figure: number;
  /** Team index (0 = Alpha, 1 = Beta). */
  team: number;
  /**
   * The end of the map (0 or 1) this character starts from this round: map spawns, dead zones and lanes are
   * per end, and the teams swap ends at half-time (sim/round.ts teamEnd). Starts as the team index.
   */
  end: number;
  status: LifeStatus;
  /** Seconds since `status` last changed. */
  statusTime: number;
  /** Who hit this character this round (-1 if not hit). */
  hitBy: number;
  /** Dead-zone spot this character walks to once hit. */
  deadZoneTarget: Vec3;
  /** Way the dead-zone spot faces. */
  deadZoneYaw: number;
  /** Planned walk to the dead zone (waypoints) and the one currently being walked to. */
  walkOffRoute: Vec3[];
  walkOffLeg: number;
  /** The walk-off route is still to be searched (the elimination step rations searches to one per tick, M27). */
  walkOffRoutePending: boolean;
  /** Seconds this character has made no real progress while walking off. */
  walkOffStuck: number;
  /** Feet position (bottom of the collision capsule). */
  position: Vec3;
  /** Position at the start of the last tick, for render interpolation. */
  prevPosition: Vec3;
  velocity: Vec3;
  /** Where the character starts each round (and returns to if it ever leaves the world). */
  spawnPosition: Vec3;
  spawnYaw: number;
  yaw: number;
  pitch: number;
  /** 0 = standing, 1 = fully crouched. */
  crouchAmount: number;
  /** Crouch amount at the start of the last tick, for render interpolation of the eye height. */
  prevCrouchAmount: number;
  /** How far the character leans: -1 fully left, 1 fully right, 0 upright (see sim/lean.ts). */
  lean: number;
  /** Lean at the start of the last tick, for render interpolation. */
  prevLean: number;
  /**
   * The walk cycle's phase (radians, M85): grows with the ground covered (HITS.legs.stridesPerMetre), so the legs'
   * hit volumes and the drawn legs swing together (sim/hitbox.ts legSwing). `prevWalkCycle` is last tick's, for drawing.
   */
  walkCycle: number;
  prevWalkCycle: number;
  /** View angles at the start of the last tick, for render interpolation of turning. */
  prevYaw: number;
  prevPitch: number;
  grounded: boolean;
  jumpCooldown: number;
  /** Seconds a jump press is still kept for (MovementConfig.jumpBuffer); 0 = none pending. */
  jumpWanted: number;
  /** Slope climbed on the last tick on the ground (rise per metre moved; 0 on the flat, going down, or in the air). */
  groundRise: number;
  sprinting: boolean;
  /** Walking slowly and quietly (walk key held, not crouched). */
  walking: boolean;
  /** Ground covered since the last footstep (m). */
  stepDistance: number;
  /** In the air since the last tick on the ground, and the fastest it fell meanwhile (m/s), for landing sounds. */
  airborne: boolean;
  fallSpeed: number;
  /**
   * Seconds until the replica can be fired again after a vault (0 = ready): it is carried through the vault and comes up
   * a moment after (M102, VaultConfig.fireLockout). A sprint has none since the owner's 0.1 Dev 5 playtest (note 9).
   */
  fireLockout: number;
  /** How much stance and movement scale the replica's spread right now (1 = standing still; see sim/accuracy.ts). */
  spreadScale: number;
  /** Seconds off the ground so far (0 while grounded); a jump starts it at the in-air spread delay (sim/accuracy.ts). */
  airTime: number;
  /** Seconds standing still on the ground so far (0 while moving or in the air); steadies the aim (sim/accuracy.ts). */
  stillTime: number;
  /** A vault over a low obstacle (M102, sim/vault.ts): while `active` the body follows its path, not its command. */
  vault: VaultState;
  /**
   * Aiming down the sights of the replica in hand (sim/aiming.ts): its iron sights or a fitted optic, and it slows you
   * to walking pace. Bots never aim down sights.
   */
  aiming: boolean;
  /** How far the sight is raised to the eye (0..1, sim/aiming.ts): the aimed accuracy eases in with it (M84). */
  aimRaise: number;
  /** Holding the Use key this tick while in play (M44: opens a case in Extraction). Bots never use it. */
  using: boolean;
  /** Seconds left in which a sprint's or a jump's shake still settles slowly (sim/accuracy.ts); 0 = locks on fast. */
  shakeCarry: number;
  armament: Armament;
  /** BBs pass through: the Dev settings' Ghost (M24), for the player only. Kept between rounds. */
  ghost: boolean;
  /**
   * The weapon torch on the replica in hand is on (M33h, sim/torch.ts): only while that replica has a light fitted and
   * the character is in play. Off at every round's start and when hit.
   */
  torchOn: boolean;
  /** Seconds since the torch was last switched (bots hold a state at least BOT_TORCH.minHold, so it never strobes). */
  torchTime: number;
  /**
   * Seconds left in which BBs neither hit this character nor are hit by it (Extraction's insertion grace, Audit 2
   * SIM-03; sim/extraction.ts). 0 everywhere else, and from every respawn until a run sets it.
   */
  grace: number;
}

export function createCharacter(
  id: number,
  spawn: Vec3,
  yaw: number,
  loadout: readonly ReplicaConfig[] = LOADOUT,
  team = 0,
): Character {
  return {
    id,
    figure: 0,
    team,
    end: team,
    status: 'alive',
    statusTime: 0,
    hitBy: -1,
    deadZoneTarget: vec3(),
    deadZoneYaw: 0,
    walkOffRoute: [],
    walkOffLeg: 0,
    walkOffRoutePending: false,
    walkOffStuck: 0,
    position: vec3(spawn.x, spawn.y, spawn.z),
    prevPosition: vec3(spawn.x, spawn.y, spawn.z),
    velocity: vec3(),
    spawnPosition: vec3(spawn.x, spawn.y, spawn.z),
    spawnYaw: yaw,
    yaw,
    pitch: 0,
    crouchAmount: 0,
    prevCrouchAmount: 0,
    lean: 0,
    prevLean: 0,
    walkCycle: 0,
    prevWalkCycle: 0,
    prevYaw: yaw,
    prevPitch: 0,
    grounded: false,
    jumpCooldown: 0,
    jumpWanted: 0,
    groundRise: 0,
    sprinting: false,
    walking: false,
    stepDistance: 0,
    airborne: false,
    fallSpeed: 0,
    fireLockout: 0,
    spreadScale: 1,
    airTime: 0,
    stillTime: 0,
    vault: createVaultState(),
    shakeCarry: 0,
    aiming: false,
    aimRaise: 0,
    using: false,
    armament: createArmament(loadout),
    ghost: false,
    torchOn: false,
    torchTime: 0,
    grace: 0,
  };
}

/** Eye height above the feet for a given crouch amount (0 = standing, 1 = crouched). */
export function eyeHeight(crouchAmount: number, body: BodyConfig): number {
  return body.standEyeHeight + (body.crouchEyeHeight - body.standEyeHeight) * crouchAmount;
}

/**
 * Safety net: a character below `killY` has escaped the level (physics glitch, map hole) and is
 * put back at its spawn with no momentum. Returns true if it was rescued.
 */
export function rescueIfOutOfWorld(c: Character, killY: number): boolean {
  if (c.position.y >= killY) return false;
  copy(c.position, c.spawnPosition);
  copy(c.prevPosition, c.spawnPosition);
  c.prevCrouchAmount = c.crouchAmount;
  c.velocity.x = 0;
  c.velocity.y = 0;
  c.velocity.z = 0;
  c.grounded = false;
  c.airborne = false;
  c.fallSpeed = 0;
  c.airTime = 0;
  cancelVault(c);
  return true;
}

/**
 * Puts a character back at its spawn for a new round: alive, standing, full magazines, fire selectors, optics,
 * hop-up dials and BB weights left as they were.
 */
export function respawnCharacter(c: Character): void {
  copy(c.position, c.spawnPosition);
  copy(c.prevPosition, c.spawnPosition);
  c.velocity.x = 0;
  c.velocity.y = 0;
  c.velocity.z = 0;
  c.yaw = c.spawnYaw;
  c.pitch = 0;
  c.prevYaw = c.yaw;
  c.prevPitch = 0;
  c.crouchAmount = 0;
  c.prevCrouchAmount = 0;
  c.lean = 0;
  c.prevLean = 0;
  c.walkCycle = 0;
  c.prevWalkCycle = 0;
  c.grounded = false;
  c.jumpCooldown = 0;
  c.jumpWanted = 0;
  c.groundRise = 0;
  c.sprinting = false;
  c.walking = false;
  c.stepDistance = 0;
  c.airborne = false;
  c.fallSpeed = 0;
  c.fireLockout = 0;
  c.spreadScale = 1;
  c.airTime = 0;
  c.stillTime = 0;
  cancelVault(c);
  c.shakeCarry = 0;
  c.aiming = false;
  c.aimRaise = 0;
  c.torchOn = false;
  c.torchTime = 0;
  c.grace = 0;
  c.using = false;
  c.status = 'alive';
  c.statusTime = 0;
  c.hitBy = -1;
  c.walkOffStuck = 0;
  c.walkOffRoutePending = false;
  const { replicas, modes, optics, hopUps, bbWeights, parts, triggerWasDown, bottomless } = c.armament;
  // The same replicas, with fresh magazines for the parts fitted (a hi-cap refills as a hi-cap).
  c.armament = createArmament(replicas, parts);
  // A trigger still held from before the round needs letting go and pulling again (no semi shot at the whistle).
  c.armament.triggerWasDown = triggerWasDown;
  c.armament.bottomless = bottomless;
  if (modes.length === c.armament.modes.length) c.armament.modes = modes;
  if (optics.length === c.armament.optics.length) c.armament.optics = optics;
  if (hopUps.length === c.armament.hopUps.length) c.armament.hopUps = hopUps;
  if (bbWeights.length === c.armament.bbWeights.length) c.armament.bbWeights = bbWeights;
}

import type { BodyConfig } from '../config/movement';
import { LOADOUT, type ReplicaConfig } from '../config/replicas';
import { type Armament, createArmament } from './armament';
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
  /** Team index (0 = Blue, 1 = Orange). */
  team: number;
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
  grounded: boolean;
  jumpCooldown: number;
  sprinting: boolean;
  /** Seconds until the replica can be fired again after sprinting (0 = ready). */
  sprintLockout: number;
  armament: Armament;
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
    team,
    status: 'alive',
    statusTime: 0,
    hitBy: -1,
    deadZoneTarget: vec3(),
    deadZoneYaw: 0,
    walkOffRoute: [],
    walkOffLeg: 0,
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
    grounded: false,
    jumpCooldown: 0,
    sprinting: false,
    sprintLockout: 0,
    armament: createArmament(loadout),
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
  return true;
}

/** Puts a character back at its spawn for a new round: alive, standing, full magazines. */
export function respawnCharacter(c: Character, loadout: readonly ReplicaConfig[]): void {
  copy(c.position, c.spawnPosition);
  copy(c.prevPosition, c.spawnPosition);
  c.velocity.x = 0;
  c.velocity.y = 0;
  c.velocity.z = 0;
  c.yaw = c.spawnYaw;
  c.pitch = 0;
  c.crouchAmount = 0;
  c.prevCrouchAmount = 0;
  c.grounded = false;
  c.jumpCooldown = 0;
  c.sprinting = false;
  c.sprintLockout = 0;
  c.status = 'alive';
  c.statusTime = 0;
  c.hitBy = -1;
  c.walkOffStuck = 0;
  c.armament = createArmament(loadout);
}

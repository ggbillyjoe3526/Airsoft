import type { BodyConfig } from '../config/movement';
import { LOADOUT, type ReplicaConfig } from '../config/replicas';
import { type Armament, createArmament } from './armament';
import { copy, type Vec3, vec3 } from './vec';

/** Plain-data character state. No Three.js objects live here. */
export interface Character {
  id: number;
  /** Feet position (bottom of the collision capsule). */
  position: Vec3;
  /** Position at the start of the last tick, for render interpolation. */
  prevPosition: Vec3;
  velocity: Vec3;
  /** Where the character returns to if it ever leaves the world (safety net). */
  spawnPosition: Vec3;
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
): Character {
  return {
    id,
    position: vec3(spawn.x, spawn.y, spawn.z),
    prevPosition: vec3(spawn.x, spawn.y, spawn.z),
    velocity: vec3(),
    spawnPosition: vec3(spawn.x, spawn.y, spawn.z),
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

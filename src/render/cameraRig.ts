import type * as THREE from 'three';
import type { BodyConfig } from '../config/movement';
import { type Character, eyeHeight } from '../sim/character';

/**
 * Places the camera at the character's interpolated eye position (feet and crouch both interpolated,
 * so crouching is smooth at any refresh rate). View angles come straight from the latest input
 * (not the last tick) so aiming never lags behind the mouse.
 */
export function updateFirstPersonCamera(
  camera: THREE.PerspectiveCamera,
  c: Character,
  body: BodyConfig,
  alpha: number,
  yaw: number,
  pitch: number,
): void {
  const x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha;
  const y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha;
  const z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha;
  const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
  camera.position.set(x, y + eyeHeight(crouch, body), z);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

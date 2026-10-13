import type * as THREE from 'three';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import { RENDER } from '../config/render';
import { SIM_DT } from '../config/sim';
import { VAULT } from '../config/vault';
import { type Character, eyeHeight } from '../sim/character';
import { leanOffset } from '../sim/lean';
import { vaultProgress } from '../sim/vault';
import { lerpAngle, vec3 } from '../sim/vec';

const lean = vec3();

/**
 * Places the camera at the character's interpolated eye position (feet, crouch and lean all
 * interpolated, so crouching and leaning are smooth at any refresh rate). View angles come straight from
 * the latest input (not the last tick) so aiming never lags behind the mouse. Leaning shifts the eye
 * sideways (the simulation's geometry and facing, so BBs leave from the eye you see from) and rolls the view a
 * little; over a vault the view dips and tips, eased in and out (M102). `rollScale` of each: less with reduced motion.
 */
export function updateFirstPersonCamera(
  camera: THREE.PerspectiveCamera,
  c: Character,
  body: BodyConfig,
  hits: HitConfig,
  alpha: number,
  yaw: number,
  pitch: number,
  rollScale = 1,
): void {
  const x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha;
  const y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha;
  const z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha;
  const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
  const leaning = c.prevLean + (c.lean - c.prevLean) * alpha;
  const eye = eyeHeight(crouch, body);
  // The lean follows the character's facing as the simulation has it (the same as the BB origin), not the
  // fresher view yaw, so what you see from is exactly where your BBs leave from.
  leanOffset(eye, leaning, crouch, lerpAngle(c.prevYaw, c.yaw, alpha), hits, lean);
  camera.position.set(x + lean.x, y + eye + lean.y, z + lean.z);
  // Leaning right tips the view clockwise (negative roll about the view axis), and left the other way. A vault dips
  // the view and tips it left (the hands go down on the top as the legs swing over), most at its middle.
  const vault = Math.sin(Math.PI * vaultProgress(c, alpha, SIM_DT)) * rollScale;
  camera.rotation.set(pitch - vault * VAULT.camera.pitch, yaw, vault * VAULT.camera.roll - leaning * RENDER.leanCameraRoll * rollScale, 'YXZ');
}

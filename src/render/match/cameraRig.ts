import type * as THREE from 'three';
import type { HitConfig } from '../../config/hits';
import type { BodyConfig } from '../../config/movement';
import { RENDER } from '../../config/render';
import { SIM_DT } from '../../config/sim';
import { VAULT } from '../../config/vault';
import { type Character, eyeHeight } from '../../sim/character';
import { leanOffset } from '../../sim/lean';
import { vaultProgress } from '../../sim/vault';
import { lerpAngle, vec3 } from '../../sim/vec';

const lean = vec3();

/**
 * Places the camera at the character's interpolated eye position (feet, crouch and lean all
 * interpolated, so crouching and leaning are smooth at any refresh rate). View angles come straight from
 * the latest input (not the last tick) so aiming never lags behind the mouse. Leaning shifts the eye
 * sideways (the simulation's geometry and facing, so BBs leave from the eye you see from) and rolls the view a
 * little; over a vault the view dips and tips, eased in and out (M102). `rollScale` of each: less with reduced motion.
 * `shownLean`: the lean to draw in place of the simulation's (LeanViewEase, KI1).
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
  shownLean?: number,
): void {
  const x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha;
  const y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha;
  const z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha;
  const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
  const leaning = shownLean ?? c.prevLean + (c.lean - c.prevLean) * alpha;
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

/**
 * The lean the view shows (KI1): the simulation's, interpolated, except where a wall cut it short (sim/lean.ts stepLean
 * cuts it within a tick, a jump of the view of up to ~0.3 m). Then the view eases back towards upright at
 * RENDER.leanCut.easeTime per full lean, never more than RENDER.leanCut.allowance metres further out than the
 * simulation's eye (still clear of the wall). Presentation only: BBs and bots use the simulation's lean. One per view;
 * allocates nothing.
 */
export class LeanViewEase {
  private shown = 0;

  /** The lean (-1..1) to draw `c` with this frame, `dt` seconds after the last; `alpha` interpolates ticks. */
  update(c: Character, body: BodyConfig, hits: HitConfig, alpha: number, dt: number): number {
    const target = c.prevLean + (c.lean - c.prevLean) * alpha;
    const was = this.shown;
    const mag = Math.abs(target);
    // Leaning further, or to the other side: drawn as it is.
    if (mag >= Math.abs(was) || (target !== 0 && Math.sign(target) !== Math.sign(was))) {
      this.shown = target;
      return target;
    }
    let eased = Math.max(mag, Math.abs(was) - dt / RENDER.leanCut.easeTime);
    // Never further out than allowance past the simulation's eye, which the walls leave clear by leanWallClearance.
    const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
    const above = eyeHeight(crouch, body) - (hits.lean.pivotHeight - hits.crouchDrop * crouch);
    if (above > 0) {
      const out = above * Math.sin(mag * hits.lean.maxAngle) + RENDER.leanCut.allowance;
      eased = Math.min(eased, Math.asin(Math.min(1, out / above)) / hits.lean.maxAngle);
    }
    this.shown = Math.sign(was) * eased;
    return this.shown;
  }

  /** Draws the simulation's lean from the next frame on (a new round, a respawn). */
  reset(): void {
    this.shown = 0;
  }
}

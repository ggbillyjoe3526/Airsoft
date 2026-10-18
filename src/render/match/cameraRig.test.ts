import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HITS } from '../../config/hits';
import { RENDER } from '../../config/render';
import { BODY, MOVEMENT } from '../../config/movement';
import { SIM_DT } from '../../config/sim';
import { VAULT } from '../../config/vault';
import { createCharacter, eyeHeight } from '../../sim/character';
import { vec3 } from '../../sim/vec';
import { LeanViewEase, updateFirstPersonCamera } from './cameraRig';

describe('updateFirstPersonCamera: a vault (M102)', () => {
  function vaulting(progress: number) {
    const c = createCharacter(0, vec3(), 0);
    c.vault.active = true;
    c.vault.end = 0.4;
    c.vault.time = progress * c.vault.end;
    return c;
  }

  it('dips and tips the view most at the vault\'s middle, and not at all outside one', () => {
    const camera = new THREE.PerspectiveCamera();
    updateFirstPersonCamera(camera, createCharacter(0, vec3(), 0), BODY, HITS, 1, 0, 0.1);
    expect(camera.rotation.x).toBeCloseTo(0.1, 9);
    expect(camera.rotation.z).toBeCloseTo(0, 9);
    updateFirstPersonCamera(camera, vaulting(0.5), BODY, HITS, 1, 0, 0.1);
    expect(camera.rotation.x).toBeCloseTo(0.1 - VAULT.camera.pitch, 6);
    expect(camera.rotation.z).toBeCloseTo(VAULT.camera.roll, 6);
    updateFirstPersonCamera(camera, vaulting(0.1), BODY, HITS, 1, 0, 0.1);
    expect(camera.rotation.x).toBeGreaterThan(0.1 - VAULT.camera.pitch);
    expect(camera.rotation.x).toBeLessThan(0.1);
  });

  it('is gentler with reduced motion', () => {
    const camera = new THREE.PerspectiveCamera();
    updateFirstPersonCamera(camera, vaulting(0.5), BODY, HITS, 1, 0, 0, 0.25);
    expect(camera.rotation.x).toBeCloseTo(-0.25 * VAULT.camera.pitch, 6);
    expect(camera.rotation.z).toBeCloseTo(0.25 * VAULT.camera.roll, 6);
  });

  it('eases through the tick it is drawn in', () => {
    const camera = new THREE.PerspectiveCamera();
    const c = vaulting(0);
    c.vault.time = SIM_DT;
    updateFirstPersonCamera(camera, c, BODY, HITS, 0, 0, 0);
    expect(camera.rotation.x).toBeCloseTo(0, 9);
    updateFirstPersonCamera(camera, c, BODY, HITS, 1, 0, 0);
    expect(camera.rotation.x).toBeLessThan(0);
  });
});

describe('updateFirstPersonCamera: a lean (BP5: the offset and roll had no test)', () => {
  function leaning(lean: number) {
    const c = createCharacter(0, vec3(2, 0, 3), 0);
    c.lean = c.prevLean = lean;
    return c;
  }

  it('moves the eye to the side leaned to and rolls the view that way, and mirrors for the other side', () => {
    const camera = new THREE.PerspectiveCamera();
    updateFirstPersonCamera(camera, leaning(0), BODY, HITS, 1, 0, 0);
    const upright = camera.position.clone();
    expect(upright.x).toBeCloseTo(2, 9);
    expect(upright.y).toBeCloseTo(eyeHeight(0, BODY), 9);
    // Facing -z (yaw 0), the right is +x: a right lean moves the eye right, a little lower, and tips the view clockwise.
    updateFirstPersonCamera(camera, leaning(1), BODY, HITS, 1, 0, 0);
    const right = camera.position.clone();
    expect(right.x).toBeGreaterThan(upright.x + 0.1);
    expect(right.y).toBeLessThan(upright.y);
    expect(right.z).toBeCloseTo(3, 9);
    expect(camera.rotation.z).toBeCloseTo(-RENDER.leanCameraRoll, 9);
    updateFirstPersonCamera(camera, leaning(-1), BODY, HITS, 1, 0, 0);
    expect(camera.position.x - upright.x).toBeCloseTo(-(right.x - upright.x), 9);
    expect(camera.position.y).toBeCloseTo(right.y, 9);
    expect(camera.rotation.z).toBeCloseTo(RENDER.leanCameraRoll, 9);
  });

  it('rolls a quarter as far with reduced motion, from the same eye', () => {
    const camera = new THREE.PerspectiveCamera();
    updateFirstPersonCamera(camera, leaning(1), BODY, HITS, 1, 0, 0);
    const full = camera.position.clone();
    updateFirstPersonCamera(camera, leaning(1), BODY, HITS, 1, 0, 0, 0.25);
    expect(camera.rotation.z).toBeCloseTo(-0.25 * RENDER.leanCameraRoll, 9);
    expect(camera.position.distanceTo(full)).toBeLessThan(1e-9);
  });
});

describe('LeanViewEase: a lean a wall cuts short (KI1)', () => {
  const FRAME = 1 / 120;
  /** The eye's sideways reach at lean `l`, standing (as leanOffset puts it). */
  const reach = (l: number) => (eyeHeight(0, BODY) - HITS.lean.pivotHeight) * Math.sin(Math.abs(l) * HITS.lean.maxAngle);
  function leaningAt(lean: number) {
    const c = createCharacter(0, vec3(), 0);
    c.lean = c.prevLean = lean;
    return c;
  }

  it('draws the simulation\'s lean while it leans out, holds, or comes back at its own pace', () => {
    const ease = new LeanViewEase();
    const c = leaningAt(0);
    for (let i = 0; i <= 20; i++) {
      c.prevLean = c.lean;
      c.lean = Math.min(1, c.lean + SIM_DT / MOVEMENT.leanTime);
      expect(ease.update(c, BODY, HITS, 1, SIM_DT)).toBe(c.lean);
    }
    for (let i = 0; i <= 20; i++) {
      c.prevLean = c.lean;
      c.lean = Math.max(0, c.lean - SIM_DT / MOVEMENT.leanTime);
      expect(ease.update(c, BODY, HITS, 1, SIM_DT)).toBeCloseTo(c.lean, 12);
    }
  });

  it('eases a cut, never drawing the eye more than the allowance past the simulation\'s, and inside the wall clearance', () => {
    expect(RENDER.leanCut.allowance + RENDER.near * Math.tan((120 * Math.PI) / 360)).toBeLessThan(MOVEMENT.leanWallClearance);
    const ease = new LeanViewEase();
    const c = leaningAt(1);
    ease.update(c, BODY, HITS, 1, FRAME);
    // A post comes alongside: the lean is cut to 0.2 within a tick.
    c.prevLean = 1;
    c.lean = 0.2;
    const shown: number[] = [];
    for (let i = 0; i < 40; i++) shown.push(ease.update(c, BODY, HITS, 1, FRAME));
    expect(shown[0]!).toBeGreaterThan(0.2);
    expect(shown[0]!).toBeLessThan(1);
    for (const s of shown) expect(reach(s) - reach(0.2)).toBeLessThanOrEqual(RENDER.leanCut.allowance + 1e-9);
    for (let i = 1; i < shown.length; i++) expect(shown[i]!).toBeLessThanOrEqual(shown[i - 1]!);
    // Settled on the simulation's lean within easeTime.
    expect(shown[Math.ceil(RENDER.leanCut.easeTime / FRAME)]).toBeCloseTo(0.2, 12);
  });

  it('follows a switch to the other side at once, and starts from the simulation\'s after a reset', () => {
    const ease = new LeanViewEase();
    ease.update(leaningAt(1), BODY, HITS, 1, FRAME);
    expect(ease.update(leaningAt(-0.3), BODY, HITS, 1, FRAME)).toBe(-0.3);
    ease.update(leaningAt(1), BODY, HITS, 1, FRAME);
    ease.reset();
    expect(ease.update(leaningAt(0), BODY, HITS, 1, FRAME)).toBe(0);
  });

  it('draws the camera with the lean it is given', () => {
    const camera = new THREE.PerspectiveCamera();
    updateFirstPersonCamera(camera, leaningAt(0.2), BODY, HITS, 1, 0, 0, 1, 0.5);
    const shown = camera.position.x;
    updateFirstPersonCamera(camera, leaningAt(0.5), BODY, HITS, 1, 0, 0);
    expect(shown).toBeCloseTo(camera.position.x, 12);
    expect(camera.rotation.z).toBeCloseTo(-0.5 * RENDER.leanCameraRoll, 12);
  });
});

describe('LeanViewEase: QA edge cases (KI1)', () => {
  const lean = (l: number, crouch = 0, prev = l) => {
    const c = createCharacter(0, vec3(), 0);
    c.lean = l;
    c.prevLean = prev;
    c.crouchAmount = c.prevCrouchAmount = crouch;
    return c;
  };

  it('stays finite for a zero, a huge (hidden tab) and a crouched frame, and never overshoots upright', () => {
    for (const dt of [0, 1e-6, 0.5, 60]) {
      for (const crouch of [0, 1]) {
        const ease = new LeanViewEase();
        ease.update(lean(1, crouch), BODY, HITS, 1, 1 / 60);
        const s = ease.update(lean(0.2, crouch, 1), BODY, HITS, 1, dt);
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0.2 - 1e-12);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
  });

  it('eases a cut to the other side of upright from the same side it was on, and to nothing when the lean key is let go', () => {
    const ease = new LeanViewEase();
    ease.update(lean(-1), BODY, HITS, 1, 1 / 60);
    const s = ease.update(lean(0, 0, -1), BODY, HITS, 1, 1 / 120);
    expect(s).toBeLessThan(0);
    expect(s).toBeGreaterThan(-1);
    for (let i = 0; i < 60; i++) ease.update(lean(0), BODY, HITS, 1, 1 / 120);
    expect(ease.update(lean(0), BODY, HITS, 1, 1 / 120)).toBe(0);
  });
});

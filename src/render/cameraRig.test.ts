import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HITS } from '../config/hits';
import { BODY } from '../config/movement';
import { SIM_DT } from '../config/sim';
import { VAULT } from '../config/vault';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { updateFirstPersonCamera } from './cameraRig';

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

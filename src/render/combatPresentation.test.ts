import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { RENDER } from '../config/render';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { heardReplicas, listenerAxes } from './combatPresentation';

const who = (id: number, loadout: Parameters<typeof createCharacter>[3]) => createCharacter(id, vec3(), 0, loadout, id === 0 ? 0 : 1);

describe('M32 acceptance 7: every replica a character carries has its sounds', () => {
  it("lists the player's replicas first, as carried, then each other replica once, by id", () => {
    const player = who(0, [AEG, GAS_PISTOL]);
    const bot = who(1, [CYBER_PISTOL, GAS_PISTOL]);
    const other = who(2, [CYBER_PISTOL, AEG]);
    const heard = heardReplicas([AEG, GAS_PISTOL], [player, bot, other]);
    expect(heard.map((r) => r.id)).toEqual(['aeg', 'pistol', 'cyber']);
    expect(heard.slice(0, 2)).toEqual([AEG, GAS_PISTOL]);
    expect(heard[2]).toBe(CYBER_PISTOL);
  });

  it("includes a bot's replica even when the player carries something else (the AEG left at home)", () => {
    const player = who(0, [GAS_PISTOL]);
    const bot = who(1, [CYBER_PISTOL, AEG]);
    // Without the other characters the Cyber Pistol would shoot silently.
    expect(heardReplicas([GAS_PISTOL], []).map((r) => r.id)).toEqual(['pistol']);
    expect(heardReplicas([GAS_PISTOL], [player, bot]).map((r) => r.id)).toEqual(['pistol', 'cyber', 'aeg']);
  });

  it('adds nothing when everyone carries what the player does, and does not change what it is given', () => {
    const loadout = [AEG, GAS_PISTOL];
    const heard = heardReplicas(loadout, [who(0, loadout), who(1, loadout), who(2, loadout)]);
    expect(heard).toEqual(loadout);
    expect(heard).not.toBe(loadout);
    expect(loadout).toEqual([AEG, GAS_PISTOL]);
  });
});

describe("M53: the listener's ears follow the view (audit AUD-05)", () => {
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const camera = new THREE.PerspectiveCamera();

  it('gives a steep look up or down an up at right angles to it, not the world up a degree away', () => {
    for (const pitch of [MOVEMENT.maxPitch, -MOVEMENT.maxPitch, 0.4, 0]) {
      for (const yaw of [0, 1.2, -2.8]) {
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        listenerAxes(camera, forward, up);
        expect(up.length(), `pitch ${pitch}`).toBeCloseTo(1, 9);
        expect(forward.dot(up), `pitch ${pitch} yaw ${yaw}`).toBeCloseTo(0, 9);
        // Level, it is the world's up; looking down, it tips forward with the view.
        expect(up.y).toBeCloseTo(Math.cos(pitch), 9);
      }
    }
  });

  it("rolls with a lean, so the ears tilt with the head", () => {
    camera.rotation.set(0, 0, -RENDER.leanCameraRoll, 'YXZ');
    listenerAxes(camera, forward, up);
    expect(up.x).toBeCloseTo(Math.sin(RENDER.leanCameraRoll), 9);
    expect(forward.dot(up)).toBeCloseTo(0, 9);
  });

  it('keeps the up a unit vector at right angles to the view for a camera under a scaled, turned parent (M53 QA)', () => {
    const parent = new THREE.Object3D();
    parent.scale.setScalar(3);
    parent.rotation.set(0.3, 0.9, -0.2, 'YXZ');
    const child = new THREE.PerspectiveCamera();
    parent.add(child);
    child.rotation.set(-1.2, 0.4, 0.1, 'YXZ');
    listenerAxes(child, forward, up);
    expect(forward.length()).toBeCloseTo(1, 9);
    expect(up.length()).toBeCloseTo(1, 9);
    expect(forward.dot(up)).toBeCloseTo(0, 9);
  });

  it('reads the camera as it is now, not as it was at the last matrix update (M53 QA)', () => {
    const cam = new THREE.PerspectiveCamera();
    cam.rotation.set(0, 0, 0, 'YXZ');
    listenerAxes(cam, forward, up);
    expect(up.y).toBeCloseTo(1, 9);
    cam.rotation.set(-MOVEMENT.maxPitch, 0, 0, 'YXZ');
    listenerAxes(cam, forward, up);
    expect(up.y).toBeCloseTo(Math.cos(MOVEMENT.maxPitch), 9);
    expect(forward.y).toBeCloseTo(-Math.sin(MOVEMENT.maxPitch), 9);
  });
});

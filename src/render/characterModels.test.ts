import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { buildFigure, figureMuzzle } from './characterModels';

describe('figureMuzzle', () => {
  it('matches the muzzle of the built figure for any position, yaw, pitch and crouch', () => {
    const figure = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial());
    // A marker at the barrel tip, in the aim group's own space.
    const tip = new THREE.Object3D();
    tip.position.set(FIGURE.rifle.x, FIGURE.rifle.y, FIGURE.rifle.butt - FIGURE.rifle.length);
    figure.aim.add(tip);
    const c = createCharacter(0, vec3(), 0);
    const got = vec3();
    const want = new THREE.Vector3();
    for (const [x, z, yaw, pitch, crouch] of [
      [0, 0, 0, 0, 0],
      [3, -2, 1.1, 0.3, 0],
      [-5, 7, -2.5, -0.4, 1],
      [1, 1, Math.PI, 0.8, 0.5],
    ] as const) {
      c.position.x = x;
      c.position.z = z;
      c.yaw = yaw;
      c.pitch = pitch;
      c.crouchAmount = crouch;
      // Pose the figure the way CharacterRenderer does.
      figure.root.position.set(x, 0, z);
      figure.root.rotation.y = yaw;
      figure.upper.position.y = FIGURE.hipHeight - crouch * FIGURE.crouchDrop;
      figure.aim.rotation.x = pitch;
      figure.root.updateMatrixWorld(true);
      tip.getWorldPosition(want);
      figureMuzzle(c, got);
      expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z)).toBeLessThan(1e-6);
    }
  });
});

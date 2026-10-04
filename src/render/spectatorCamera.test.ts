import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BODY } from '../config/movement';
import { SPECTATOR } from '../config/render';
import type { WorldQuery } from '../sim/armament';
import { createCharacter } from '../sim/character';
import { vec3 } from '../sim/vec';
import { SpectatorCamera } from './spectatorCamera';

/** A WorldQuery that counts its casts and reports a wall `wall` metres along every ray. */
function countingQuery(wall: number): WorldQuery & { casts: number } {
  const q = {
    casts: 0,
    raycastStatic: () => {
      q.casts++;
      return wall;
    },
  };
  return q;
}

describe('SpectatorCamera', () => {
  it('casts its wall check once per tick pose, not once per rendered frame (audit REN-12)', () => {
    const watched = createCharacter(1, vec3(0, 0, 0), 0);
    const self = createCharacter(0, vec3(5, 0, 5), 0);
    const query = countingQuery(-1);
    const spectator = new SpectatorCamera([self, watched], self, BODY, query);
    const camera = new THREE.PerspectiveCamera();
    // Three frames between the same two ticks: one cast.
    spectator.place(camera, watched, 0.2, 1 / 144);
    spectator.place(camera, watched, 0.5, 1 / 144);
    spectator.place(camera, watched, 0.9, 1 / 144);
    expect(query.casts).toBe(1);
    // The next tick moved the target: one more.
    watched.position.x += 0.05;
    spectator.place(camera, watched, 0.1, 1 / 144);
    spectator.place(camera, watched, 0.6, 1 / 144);
    expect(query.casts).toBe(2);
    // Turning counts as a change too.
    watched.yaw += 0.1;
    spectator.place(camera, watched, 0.3, 1 / 144);
    expect(query.casts).toBe(3);
  });

  it('still pulls the camera in front of a wall behind the target', () => {
    const watched = createCharacter(1, vec3(0, 0, 0), 0);
    const self = createCharacter(0, vec3(5, 0, 5), 0);
    const wall = 1;
    const spectator = new SpectatorCamera([self, watched], self, BODY, countingQuery(wall));
    const camera = new THREE.PerspectiveCamera();
    spectator.place(camera, watched, 1, 1 / 60);
    const head = new THREE.Vector3(0, BODY.standEyeHeight, 0);
    expect(camera.position.distanceTo(head)).toBeCloseTo(wall - SPECTATOR.wallPadding, 5);
  });
});

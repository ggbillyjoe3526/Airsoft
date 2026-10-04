import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { BB_VISUALS } from '../config/render';
import { createBBPool, spawnBB, stepBBFlight } from '../sim/ballistics';
import { vec3 } from '../sim/vec';
import { BBRenderer } from './bbRenderer';

const DT = 1 / 60;

/** World position and uniform scale of drawn BB number `i`. */
function drawn(r: BBRenderer, i: number): { pos: THREE.Vector3; scale: number } {
  const balls = r.object.children[0] as THREE.InstancedMesh;
  const m = new THREE.Matrix4();
  balls.getMatrixAt(i, m);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  m.decompose(pos, new THREE.Quaternion(), scale);
  return { pos, scale: scale.x };
}

describe('BBRenderer', () => {
  const eye = { x: 0, y: 1.6, z: 0 };

  it('draws an own BB at the muzzle, then exactly on its path once it has converged', () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    stepBBFlight(bb, BALLISTICS, DT); // as in the game: presentation sees the BB after its first tick
    r.startFromMuzzle(bb, { x: 0.2, y: 1.4, z: -0.5 }, Number.POSITIVE_INFINITY);
    r.update(0, eye);
    expect(drawn(r, 0).pos.distanceTo(new THREE.Vector3(0.2, 1.4, -0.5))).toBeLessThan(1e-6);
    const ticks = Math.ceil(BB_VISUALS.muzzleConvergeTime / DT) + 1;
    for (let i = 0; i < ticks; i++) stepBBFlight(bb, BALLISTICS, DT);
    r.update(1, eye);
    expect(drawn(r, 0).pos.distanceTo(new THREE.Vector3(bb.position.x, bb.position.y, bb.position.z))).toBeLessThan(1e-6);
    r.dispose();
  });

  it('finishes the muzzle blend before a close wall, so the BB arrives where it hits', () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    stepBBFlight(bb, BALLISTICS, DT);
    const flight = 4.4 / 88; // a wall 4.4 m away: 0.05 s, much shorter than muzzleConvergeTime
    r.startFromMuzzle(bb, { x: 0.2, y: 1.4, z: -0.5 }, flight);
    const ticks = Math.ceil((flight * BB_VISUALS.convergeBeforeImpact) / DT) + 1;
    for (let i = 0; i < ticks; i++) stepBBFlight(bb, BALLISTICS, DT);
    r.update(1, eye);
    expect(drawn(r, 0).pos.distanceTo(new THREE.Vector3(bb.position.x, bb.position.y, bb.position.z))).toBeLessThan(1e-6);
    r.dispose();
  });

  it('keeps far BBs at least the minimum angular size', () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    spawnBB(pool, 1, vec3(0, 1.6, -30), vec3(0, 0, -1), 88, 0, 0.25e-3);
    spawnBB(pool, 1, vec3(0, 1.6, -1), vec3(0, 0, -1), 88, 0, 0.25e-3);
    r.update(0, eye);
    const far = drawn(r, 0);
    expect((far.scale * BB_VISUALS.radius) / 30).toBeCloseTo(BB_VISUALS.minAngularRadius, 6);
    expect(drawn(r, 1).scale).toBe(1); // near BBs keep their real drawn size
    r.dispose();
  });

  it("draws the streak back along the tick's own path, not along the speed the BB ends the tick at (drag, M30)", () => {
    const pool = createBBPool(1);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 1, vec3(0, 1.6, -3), vec3(0, 0, -1), 88, 0, 0.25e-3);
    // A tick that carried the BB 1.4 m (84 m/s on average) while drag and gravity bent its end-of-tick velocity to
    // 70 m/s with a downward part: far from the mean velocity of the tick.
    bb.prevPosition.x = 0;
    bb.prevPosition.y = 1.6;
    bb.prevPosition.z = -3;
    bb.position.x = 0;
    bb.position.y = 1.6;
    bb.position.z = -4.4;
    bb.velocity.x = 0;
    bb.velocity.y = -5;
    bb.velocity.z = -70;
    bb.age = 1;
    r.update(0.5, eye);
    const trails = r.object.children[1] as THREE.LineSegments;
    const p = (trails.geometry.getAttribute('position') as THREE.BufferAttribute).array;
    const head = new THREE.Vector3(p[0], p[1], p[2]);
    const tail = new THREE.Vector3(p[3], p[4], p[5]);
    expect(head.distanceTo(new THREE.Vector3(0, 1.6, -3.7))).toBeLessThan(1e-5); // half way along the tick
    // The tail is on the line prevPosition -> position: level here, and no further back than the tick's mean speed says.
    expect(tail.y).toBeCloseTo(1.6, 5);
    expect(tail.x).toBeCloseTo(0, 5);
    expect(tail.z - head.z).toBeCloseTo((1.4 / DT) * BB_VISUALS.trailSeconds, 4);
    r.dispose();
  });

  it('keeps the streak on the segment of a BB flying through real drag, whichever way it is drawn between ticks', () => {
    const pool = createBBPool(1);
    const r = new BBRenderer(pool, DT);
    const bb = spawnBB(pool, 1, vec3(0, 1.6, 0), vec3(0.6, 0.1, -0.8), 88, 0.12, 0.25e-3);
    for (let i = 0; i < 90; i++) {
      bb.prevPosition.x = bb.position.x;
      bb.prevPosition.y = bb.position.y;
      bb.prevPosition.z = bb.position.z;
      stepBBFlight(bb, BALLISTICS, DT);
    }
    const dir = new THREE.Vector3(bb.position.x - bb.prevPosition.x, bb.position.y - bb.prevPosition.y, bb.position.z - bb.prevPosition.z).normalize();
    const trails = r.object.children[1] as THREE.LineSegments;
    for (const alpha of [0, 0.5, 1]) {
      r.update(alpha, eye);
      const p = (trails.geometry.getAttribute('position') as THREE.BufferAttribute).array;
      const along = new THREE.Vector3(p[3] - p[0], p[4] - p[1], p[5] - p[2]);
      const off = along.clone().sub(dir.clone().multiplyScalar(along.dot(dir)));
      expect(off.length(), `alpha ${alpha}`).toBeLessThan(2e-4);
    }
    r.dispose();
  });
});

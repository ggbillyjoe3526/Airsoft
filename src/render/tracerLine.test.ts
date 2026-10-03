import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { RENDER } from '../config/render';
import { bbMass, hopUpLift, LOADOUT, muzzleVelocity } from '../config/replicas';
import { createArmament, fitOptic } from '../sim/armament';
import { type BB, createBBPool, spawnBB, stepBBFlight } from '../sim/ballistics';
import { vec3 } from '../sim/vec';
import { BBRenderer } from './bbRenderer';
import { verticalFovFor } from './renderer';
import { Viewmodel } from './viewmodel';

const DT = 1 / 60;
const EYE = new THREE.Vector3(0, 1.6, 0);

/** One simulation tick of a BB's flight, keeping its previous position as the game does (sim/bbs.ts). */
function tick(bb: BB): void {
  bb.prevPosition.x = bb.position.x;
  bb.prevPosition.y = bb.position.y;
  bb.prevPosition.z = bb.position.z;
  stepBBFlight(bb, BALLISTICS, DT);
}

/** The streak's head and tail (world space) of drawn BB `i`. */
function streak(r: BBRenderer, i: number): [THREE.Vector3, THREE.Vector3] {
  const trails = r.object.children[1] as THREE.LineSegments;
  const p = (trails.geometry.getAttribute('position') as THREE.BufferAttribute).array;
  const o = i * 6;
  return [new THREE.Vector3(p[o], p[o + 1], p[o + 2]), new THREE.Vector3(p[o + 3], p[o + 4], p[o + 5])];
}

/** The main camera at the eye, looking down -Z, as the game sets it (16:9). */
function mainCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(verticalFovFor(RENDER.horizontalFov16x9), 16 / 9, RENDER.near, RENDER.far);
  cam.position.copy(EYE);
  cam.updateMatrixWorld(true);
  return cam;
}

/** Where a world point lands on screen (normalised device coordinates), and whether it is in front of the camera. */
function onScreen(p: THREE.Vector3, cam: THREE.PerspectiveCamera): { x: number; y: number; inFront: boolean } {
  const inFront = p.clone().applyMatrix4(cam.matrixWorldInverse).z < -cam.near;
  const s = p.clone().project(cam);
  return { x: s.x, y: s.y, inFront };
}

describe('BB tracers leave the muzzle in line with the barrel (owner playtest, 2026-10-03)', () => {
  for (const [slot, replica] of LOADOUT.entries()) {
    for (const aim of [0, 1]) {
      if (aim === 1 && !replica.opticMount) continue;
      it(`${replica.id}, ${aim ? 'aiming down the sight' : 'from the hip'}: every frame of the streak lies on the line from the muzzle to the crosshair`, () => {
        const vm = new Viewmodel(16 / 9, 0x3a7bd5, LOADOUT);
        const arm = createArmament(LOADOUT);
        arm.active = slot;
        if (aim) fitOptic(arm, LOADOUT, 'redDot');
        vm.update(DT, 0, 0, 0, 4.2, false, arm, LOADOUT, false, aim);
        const cam = mainCamera();
        const muzzle = new THREE.Vector3();
        expect(vm.muzzleWorld(cam, muzzle)).toBe(true);
        const m = onScreen(muzzle, cam);
        expect(m.inFront).toBe(true);
        expect(m.y).toBeLessThan(0); // the muzzle is drawn below the crosshair

        // The barrel itself points straight ahead: its far end vanishes at the screen centre, so on screen the
        // barrel runs from the muzzle towards the crosshair, the way the BB is drawn.
        const markers: THREE.Object3D[] = [];
        vm.scene.traverseVisible((o) => o.name === 'muzzle' && markers.push(o));
        expect(markers).toHaveLength(1); // the replica in hand
        const barrel = new THREE.Vector3(0, 0, -1).transformDirection(markers[0]!.matrixWorld);
        expect(Math.hypot(barrel.x, barrel.y)).toBeLessThan(1e-9);

        const pool = createBBPool(1);
        const r = new BBRenderer(pool, DT);
        const bb = spawnBB(pool, 0, vec3(EYE.x, EYE.y, EYE.z), vec3(0, 0, -1), muzzleVelocity(replica), hopUpLift(replica, replica.hopUpDial), bbMass(replica));
        tick(bb); // presentation first sees a BB after its first tick
        r.startFromMuzzle(bb, muzzle, Number.POSITIVE_INFINITY);
        const len = Math.hypot(m.x, m.y);
        for (let frame = 0; frame < 16; frame++) {
          const alpha = (frame % 4) / 4;
          if (frame > 0 && alpha === 0) tick(bb);
          r.update(alpha, EYE);
          for (const p of streak(r, 0)) {
            const s = onScreen(p, cam);
            expect(s.inFront, `frame ${frame}`).toBe(true); // never reaching back behind the camera
            // On the muzzle-to-centre line (cross product ~0), between the two ends.
            expect(Math.abs(s.x * m.y - s.y * m.x) / len, `frame ${frame}`).toBeLessThan(0.002);
            expect(Math.hypot(s.x, s.y), `frame ${frame}`).toBeLessThanOrEqual(len + 1e-6);
          }
        }
        r.dispose();
        vm.dispose();
      });
    }
  }

  it("a fresh BB's streak starts at the muzzle and grows from there, for anyone's shots", () => {
    const pool = createBBPool(2);
    const r = new BBRenderer(pool, DT);
    const mine = spawnBB(pool, 0, vec3(0, 1.6, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    const theirs = spawnBB(pool, 1, vec3(5, 1.5, 0), vec3(0, 0, -1), 88, 0, 0.25e-3);
    tick(mine);
    tick(theirs);
    r.startFromMuzzle(mine, { x: 0.2, y: 1.4, z: -0.5 }, Number.POSITIVE_INFINITY);
    r.update(0, EYE); // the instant it was fired: no streak yet
    const [head, tail] = streak(r, 0);
    expect(head.distanceTo(new THREE.Vector3(0.2, 1.4, -0.5))).toBeLessThan(1e-6);
    expect(tail.distanceTo(head)).toBeLessThan(1e-6);
    const [theirHead, theirTail] = streak(r, 1);
    expect(theirTail.distanceTo(theirHead)).toBeLessThan(1e-6);
    r.update(0.5, EYE); // half a tick later: the tail is still where it left (to within the straight-streak approximation)
    expect(streak(r, 0)[1].distanceTo(new THREE.Vector3(0.2, 1.4, -0.5))).toBeLessThan(0.01);
    expect(streak(r, 1)[1].distanceTo(new THREE.Vector3(5, 1.5, 0))).toBeLessThan(0.01);
    expect(streak(r, 0)[0].distanceTo(streak(r, 0)[1])).toBeGreaterThan(0.5); // while the head has flown on
    r.dispose();
  });
});

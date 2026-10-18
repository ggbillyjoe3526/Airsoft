import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HITS } from '../../config/hits';
import { BODY } from '../../config/movement';
import type { WorldQuery } from '../../sim/armament';
import { createCharacter, eyeHeight } from '../../sim/character';
import { leanOffset } from '../../sim/lean';
import { vec3 } from '../../sim/vec';
import { SpectatorCamera } from './spectatorCamera';

/** BP3b QA: the spectator camera follows the watched player's lean, and its wall check casts from the leaned eye. */

/** A query that records the origin of each cast and finds no wall. */
function recordingQuery(): WorldQuery & { origins: { x: number; y: number; z: number }[] } {
  const q = {
    origins: [] as { x: number; y: number; z: number }[],
    raycastStatic: (o: { x: number; y: number; z: number }) => {
      q.origins.push({ x: o.x, y: o.y, z: o.z });
      return -1;
    },
  };
  return q;
}

function leaning(lean: number) {
  const watched = createCharacter(1, vec3(2, 0, 3), 0);
  watched.yaw = 0.7;
  watched.prevYaw = 0.7;
  watched.lean = lean;
  watched.prevLean = lean;
  const self = createCharacter(0, vec3(9, 0, 9), 0);
  return { watched, self };
}

describe('the spectator camera follows the watched lean', () => {
  it('sits the eye out by the lean offset, so the camera moves sideways with a peek', () => {
    const upright = leaning(0);
    const peeking = leaning(1);
    const place = (w: ReturnType<typeof leaning>) => {
      const cam = new THREE.PerspectiveCamera();
      new SpectatorCamera([w.self, w.watched], w.self, BODY, recordingQuery(), HITS).place(cam, w.watched, 1, 1 / 60);
      return cam.position.clone();
    };
    const a = place(upright);
    const b = place(peeking);
    const off = leanOffset(eyeHeight(0, BODY), 1, 0, 0.7, HITS, vec3());
    expect(Math.hypot(off.x, off.z), 'the lean moves the eye').toBeGreaterThan(0.1);
    expect(b.x - a.x).toBeCloseTo(off.x, 6);
    expect(b.y - a.y).toBeCloseTo(off.y, 6);
    expect(b.z - a.z).toBeCloseTo(off.z, 6);
  });

  it('without a hit config the camera leaves the lean out (the optional argument)', () => {
    const upright = leaning(0);
    const peeking = leaning(1);
    const place = (w: ReturnType<typeof leaning>) => {
      const cam = new THREE.PerspectiveCamera();
      new SpectatorCamera([w.self, w.watched], w.self, BODY, recordingQuery()).place(cam, w.watched, 1, 1 / 60);
      return cam.position.clone();
    };
    expect(place(peeking).distanceTo(place(upright))).toBeCloseTo(0, 9);
  });

  it('casts the wall check from the leaned eye, and a changed lean alone casts again', () => {
    const { watched, self } = leaning(1);
    const q = recordingQuery();
    const spectator = new SpectatorCamera([self, watched], self, BODY, q, HITS);
    const cam = new THREE.PerspectiveCamera();
    spectator.place(cam, watched, 1, 1 / 60);
    const off = leanOffset(eyeHeight(0, BODY), 1, 0, 0.7, HITS, vec3());
    expect(q.origins).toHaveLength(1);
    expect(q.origins[0]!.x).toBeCloseTo(2 + off.x, 6);
    expect(q.origins[0]!.y).toBeCloseTo(eyeHeight(0, BODY) + off.y, 6);
    expect(q.origins[0]!.z).toBeCloseTo(3 + off.z, 6);
    // Same pose: cached. Only the lean differs: a new cast, from the new eye.
    spectator.place(cam, watched, 1, 1 / 60);
    expect(q.origins).toHaveLength(1);
    watched.lean = 0;
    watched.prevLean = 0;
    spectator.place(cam, watched, 1, 1 / 60);
    expect(q.origins).toHaveLength(2);
    expect(q.origins[1]!.x).toBeCloseTo(2, 9);
    expect(q.origins[1]!.z).toBeCloseTo(3, 9);
  });
});

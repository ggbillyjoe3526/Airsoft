import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { TEAMMATE_MARKERS } from '../config/matchInfo';
import { BODY } from '../config/movement';
import { FOV_SETTING } from '../config/render';
import { buildFigure, disposeFigure } from './characterModels';
import { verticalFovFor } from './renderer';
import { projectMarker, type ScreenMarker } from './screenMarker';

const W = 1600;
const H = 900;
const M = 30;

function camera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(70, W / H, 0.05, 200); // at the origin, looking down -Z
  cam.updateMatrixWorld();
  return cam;
}

const at = (x: number, y: number, z: number): ScreenMarker => projectMarker(new THREE.Vector3(x, y, z), camera(), W, H, M, { x: 0, y: 0, onScreen: false });

describe('screen markers', () => {
  it('sit on the point when it is in view', () => {
    expect(at(0, 0, -10)).toMatchObject({ x: W / 2, y: H / 2, onScreen: true });
    const right = at(2, 1, -10);
    expect(right.onScreen).toBe(true);
    expect(right.x).toBeGreaterThan(W / 2);
    expect(right.y).toBeLessThan(H / 2);
  });

  it('pin to the edge, on the side you would turn to, when the point is out of view or behind you', () => {
    const farRight = at(50, 0, -5);
    expect(farRight).toMatchObject({ x: W - M, onScreen: false });
    const behindRight = at(3, 0, 10);
    expect(behindRight.onScreen).toBe(false);
    expect(behindRight.x).toBeCloseTo(W - M, 0);
    const behindLeft = at(-3, 0, 10);
    expect(behindLeft.x).toBeCloseTo(M, 0);
    const deadBehind = at(0, 0, 10);
    expect(deadBehind.y).toBeCloseTo(H - M, 0);
    for (const p of [farRight, behindRight, behindLeft, deadBehind]) {
      expect(p.x).toBeGreaterThanOrEqual(M - 1e-6);
      expect(p.x).toBeLessThanOrEqual(W - M + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(M - 1e-6);
      expect(p.y).toBeLessThanOrEqual(H - M + 1e-6);
    }
  });
});

describe('screen markers after the camera moves', () => {
  it('use where the camera is now, not where it was last rendered', () => {
    const cam = camera();
    cam.rotation.y = -Math.PI / 2; // turned to face +X, without updating its matrices
    const m = projectMarker(new THREE.Vector3(10, 0, 0), cam, W, H, M, { x: 0, y: 0, onScreen: false });
    expect(m.onScreen).toBe(true);
    expect(m.x).toBeCloseTo(W / 2, 6);
    expect(m.y).toBeCloseTo(H / 2, 6);
  });
});

describe("teammates' name markers (FA13)", () => {
  // The figures' visible heads, tallest headgear included (the hit pose's raised arm is hidden while playing).
  const headTop = Math.max(
    ...[0, 1, 2, 3, 4, 5].map((id) => {
      const f = buildFigure(0x3d8bff, new THREE.MeshStandardMaterial(), new THREE.SpriteMaterial(), id, null, FIGURE.detail.high);
      f.root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      f.root.traverseVisible((o) => {
        if (o instanceof THREE.Mesh) box.expandByObject(o);
      });
      disposeFigure(f);
      return box.max.y;
    }),
  );
  const eye = BODY.standEyeHeight;
  const HEIGHT = 1080;
  /** Pixels between the top of a standing teammate's head and the marker's anchor, `distance` m ahead at eye level. */
  function gapPx(distance: number, horizontalFov: number): number {
    const cam = new THREE.PerspectiveCamera(verticalFovFor(horizontalFov), 16 / 9, 0.05, 500);
    cam.position.set(0, eye, 0);
    cam.updateMatrixWorld();
    const out = { x: 0, y: 0, onScreen: false };
    const head = projectMarker(new THREE.Vector3(0, headTop, -distance), cam, (HEIGHT * 16) / 9, HEIGHT, 0, out).y;
    return head - projectMarker(new THREE.Vector3(0, eye + TEAMMATE_MARKERS.aboveEyes, -distance), cam, (HEIGHT * 16) / 9, HEIGHT, 0, out).y;
  }

  it('anchors over the head, never inside it, at any range', () => {
    expect(eye + TEAMMATE_MARKERS.aboveEyes).toBeGreaterThan(headTop);
    expect(gapPx(60, FOV_SETTING.max)).toBeGreaterThan(0);
  });

  it('sits just over the head up close, not a hand above it (it was 0.45 m over the eyes: 170 px at 2 m)', () => {
    // The narrowest field of view magnifies most. Within about 4% of the screen's height at 1.5 m and 2 m.
    for (const d of [1.5, 2]) expect(gapPx(d, FOV_SETTING.min)).toBeLessThan(HEIGHT * 0.045);
  });
});

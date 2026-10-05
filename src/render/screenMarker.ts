import * as THREE from 'three';

/** Where a world point shows on screen, for a HUD marker. */
export interface ScreenMarker {
  /** Pixels from the left / top of the view. */
  x: number;
  y: number;
  /** False if the point is off screen or behind the camera: the marker is pinned to the edge, towards it. */
  onScreen: boolean;
}

const v = new THREE.Vector3();

/**
 * Projects `point` onto a `width` × `height` view. Points off screen (or behind the camera) are pinned
 * `margin` pixels inside the edge, in the direction you'd turn to face them. Writes into `out`. The camera's matrices
 * must be current: the caller calls `camera.updateMatrixWorld()` once a frame, after the camera is placed, before its
 * markers (MatchPresentation.frame; M64, audit UI-13), not once per marker here.
 */
export function projectMarker(point: THREE.Vector3, camera: THREE.Camera, width: number, height: number, margin: number, out: ScreenMarker): ScreenMarker {
  v.copy(point).applyMatrix4(camera.matrixWorldInverse);
  const behind = v.z > 0; // camera space looks down -Z
  v.applyMatrix4(camera.projectionMatrix); // to clip space, divided by w: NDC
  let nx = v.x;
  let ny = v.y;
  if (behind) {
    // Behind you: mirror it, and push it to the edge so it never shows in the middle.
    nx = -nx;
    ny = -ny;
  }
  const halfW = width / 2 - margin;
  const halfH = height / 2 - margin;
  let px = nx * (width / 2);
  let py = -ny * (height / 2);
  if (behind && Math.hypot(px, py) < 1) py = height; // dead behind: pin it to the bottom edge
  out.onScreen = !behind && Math.abs(px) <= halfW && Math.abs(py) <= halfH;
  if (!out.onScreen) {
    // Scale the direction down onto the inner rectangle's edge.
    const s = Math.min(halfW / Math.max(Math.abs(px), 1e-6), halfH / Math.max(Math.abs(py), 1e-6));
    if (behind || s < 1) {
      px *= s;
      py *= s;
    }
  }
  out.x = width / 2 + px;
  out.y = height / 2 + py;
  return out;
}

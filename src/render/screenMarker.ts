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

/** How far apart (px) two edge-pinned markers on one edge sit: `down` a side edge, `across` the top or bottom. */
export interface EdgeStep {
  down: number;
  across: number;
}

/** The screen edge a pinned marker sits on: 0 left, 1 right, 2 top, 3 bottom (the nearest one). */
function edgeOf(m: ScreenMarker, width: number, height: number): number {
  const left = m.x;
  const right = width - m.x;
  const top = m.y;
  const bottom = height - m.y;
  const side = Math.min(left, right);
  if (side <= Math.min(top, bottom)) return left <= right ? 0 : 1;
  return top <= bottom ? 2 : 3;
}

/** The most edge markers laid out in one frame (pings, the flag, exits, the hold marker); past it they are left as they are. */
const EDGE_PINS_MAX = 32;

/**
 * This frame's edge-pinned markers, laid out together (BP6): one pinned within a label of another on the same edge
 * moves along that edge, away from it, until it is `step` px clear of every marker placed before it (past the end of
 * the edge that way, to the other side of it). `begin` once a frame, then `place` each marker after it is projected
 * (and moved off the minimap). Nothing allocated per frame.
 */
export class EdgePins {
  private readonly edge = new Int8Array(EDGE_PINS_MAX);
  private readonly along = new Float64Array(EDGE_PINS_MAX);
  private count = 0;

  begin(): void {
    this.count = 0;
  }

  /** Moves `m` (if pinned to an edge) clear of the markers placed this frame on its edge, and notes it. Returns `m`. */
  place(m: ScreenMarker, width: number, height: number, step: Readonly<EdgeStep>): ScreenMarker {
    if (m.onScreen || this.count >= EDGE_PINS_MAX) return m;
    const e = edgeOf(m, width, height);
    const side = e < 2;
    const gap = side ? step.down : step.across;
    const size = side ? height : width;
    let at = side ? m.y : m.x;
    // Each pass moves past one marker in the way; a marker can be in the way at most once from each side.
    for (let pass = 0; pass <= this.count * 2; pass++) {
      let blocker = -1;
      for (let i = 0; i < this.count; i++) {
        if (this.edge[i] === e && Math.abs(at - this.along[i]!) < gap - 1e-6) {
          blocker = i;
          break;
        }
      }
      if (blocker < 0) break;
      const b = this.along[blocker]!;
      // Away from the one in the way: on its far side from the edge's middle when they share a spot.
      const up = at < b || (at === b && b < size / 2);
      let next = up ? b - gap : b + gap;
      // Off the end of the edge that way: the other side of the one in the way.
      if (next < gap / 2 || next > size - gap / 2) next = up ? b + gap : b - gap;
      if (next < gap / 2 || next > size - gap / 2) break;
      at = next;
    }
    if (side) m.y = at;
    else m.x = at;
    this.edge[this.count] = e;
    this.along[this.count] = at;
    this.count++;
    return m;
  }
}

/**
 * Which way (degrees, clockwise from pointing right) an edge-pinned marker at `m` lies from the middle of a
 * `width` × `height` view: the way to turn for what it marks (BP6: the arrow on an edge-pinned flag or exit marker).
 */
export function edgeAngle(m: Readonly<ScreenMarker>, width: number, height: number): number {
  return (Math.atan2(m.y - height / 2, m.x - width / 2) * 180) / Math.PI;
}

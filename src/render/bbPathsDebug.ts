import * as THREE from 'three';
import { BB_VISUALS } from '../config/render';
import type { BBPool } from '../sim/ballistics';

/**
 * Debug view: the flight paths of the most recent BBs as lines, to see hop-up and drop at a glance.
 * Records one point per simulation tick while enabled. Fixed-size buffers.
 */
export class BBPathsDebug {
  readonly object: THREE.LineSegments;
  enabled = false;
  private readonly points: Float32Array;
  private readonly lengths: Uint16Array;
  /** Which BB (by serial) each path slot is recording, 0 = free. */
  private readonly serials: Float64Array;
  private nextSlot = 0;
  private readonly segs: Float32Array;

  constructor(private readonly pool: BBPool) {
    const paths = BB_VISUALS.debugPaths;
    const per = BB_VISUALS.debugPathPoints;
    this.points = new Float32Array(paths * per * 3);
    this.lengths = new Uint16Array(paths);
    this.serials = new Float64Array(paths);
    this.segs = new Float32Array(paths * (per - 1) * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.segs, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.object = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: BB_VISUALS.debugPathColor }));
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  toggle(): void {
    this.enabled = !this.enabled;
    this.object.visible = this.enabled;
  }

  /** Call after each simulation tick. */
  recordTick(): void {
    if (!this.enabled) return;
    const per = BB_VISUALS.debugPathPoints;
    for (const bb of this.pool.bbs) {
      if (!bb.active) continue;
      let slot = this.serials.indexOf(bb.serial);
      if (slot < 0) {
        slot = this.nextSlot;
        this.nextSlot = (this.nextSlot + 1) % this.serials.length;
        this.serials[slot] = bb.serial;
        this.lengths[slot] = 0;
      }
      const n = this.lengths[slot]!;
      if (n >= per) continue;
      const o = (slot * per + n) * 3;
      this.points[o] = bb.position.x;
      this.points[o + 1] = bb.position.y;
      this.points[o + 2] = bb.position.z;
      this.lengths[slot] = n + 1;
    }
  }

  /** Rebuilds the line buffer (only while enabled). */
  update(): void {
    if (!this.enabled) return;
    const per = BB_VISUALS.debugPathPoints;
    let v = 0;
    for (let s = 0; s < this.lengths.length; s++) {
      const n = this.lengths[s]!;
      for (let i = 1; i < n; i++) {
        const a = (s * per + i - 1) * 3;
        const b = (s * per + i) * 3;
        this.segs[v++] = this.points[a]!;
        this.segs[v++] = this.points[a + 1]!;
        this.segs[v++] = this.points[a + 2]!;
        this.segs[v++] = this.points[b]!;
        this.segs[v++] = this.points[b + 1]!;
        this.segs[v++] = this.points[b + 2]!;
      }
    }
    const geo = this.object.geometry;
    geo.setDrawRange(0, v / 3);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}

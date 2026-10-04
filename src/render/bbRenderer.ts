import * as THREE from 'three';
import { BB_VISUALS } from '../config/render';
import type { BB, BBPool } from '../sim/ballistics';

/**
 * Draws every BB in flight as a small bright ball with a short streak behind it (one instanced
 * mesh + one line-segment buffer, sized to the pool, so nothing is allocated per frame).
 */
export class BBRenderer {
  readonly object = new THREE.Group();
  private readonly balls: THREE.InstancedMesh;
  private readonly trails: THREE.LineSegments;
  private readonly trailPositions: Float32Array;
  private readonly matrix = new THREE.Matrix4();
  /** Per pool slot: visual offset (muzzle minus true spawn point) for your own BBs, and which BB it belongs to. */
  private readonly offsets: Float32Array;
  private readonly offsetSerial: Float64Array;
  /** Per pool slot: seconds over which the muzzle offset blends away (never longer than the flight). */
  private readonly convergeTimes: Float32Array;

  constructor(
    private readonly pool: BBPool,
    private readonly tickSeconds: number,
  ) {
    const n = pool.bbs.length;
    this.offsets = new Float32Array(n * 3);
    this.offsetSerial = new Float64Array(n);
    this.convergeTimes = new Float32Array(n);
    this.balls = new THREE.InstancedMesh(
      new THREE.SphereGeometry(BB_VISUALS.radius, 8, 6),
      new THREE.MeshBasicMaterial({ color: BB_VISUALS.color }),
      n,
    );
    this.balls.count = 0;
    this.balls.frustumCulled = false;

    this.trailPositions = new Float32Array(n * 2 * 3);
    const colors = new Float32Array(n * 2 * 3);
    const head = new THREE.Color(BB_VISUALS.trailColor);
    for (let i = 0; i < n; i++) {
      // Bright at the BB, fading to black (invisible with additive blending) at the tail.
      colors.set([head.r, head.g, head.b, 0, 0, 0], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setDrawRange(0, 0);
    this.trails = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: BB_VISUALS.trailOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.trails.frustumCulled = false;
    this.object.add(this.balls, this.trails);
  }

  /** `alpha` interpolates between the last two simulation ticks. */
  update(alpha: number, camera: { x: number; y: number; z: number }): void {
    let count = 0;
    const tp = this.trailPositions;
    const bbs = this.pool.bbs;
    const trail = BB_VISUALS.trailSeconds;
    const minScale = BB_VISUALS.minAngularRadius / BB_VISUALS.radius;
    for (let i = 0; i < bbs.length; i++) {
      const bb = bbs[i]!;
      if (!bb.active) continue;
      let x = bb.prevPosition.x + (bb.position.x - bb.prevPosition.x) * alpha;
      let y = bb.prevPosition.y + (bb.position.y - bb.prevPosition.y) * alpha;
      let z = bb.prevPosition.z + (bb.position.z - bb.prevPosition.z) * alpha;
      // The streak never reaches back past where the BB was fired: a fresh BB's full-length streak would run
      // behind the shooter (for your own shots, behind the camera, drawn as a line slanting up from the bottom
      // of the screen to the muzzle).
      const age = Math.max(0, bb.age - (1 - alpha) * this.tickSeconds);
      // Back along the tick's own path (its mean velocity, the line the head is interpolated on), not the BB's speed at
      // the tick's end: drag slows a BB by a few m/s within a tick (M30), which would lift the tail off the path.
      const streak = Math.min(trail, age);
      const back = streak / this.tickSeconds;
      let tx = x - (bb.position.x - bb.prevPosition.x) * back;
      let ty = y - (bb.position.y - bb.prevPosition.y) * back;
      let tz = z - (bb.position.z - bb.prevPosition.z) * back;
      // Own shots: start at the muzzle, blend onto the true path (head and tail blend separately).
      if (this.offsetSerial[i] === bb.serial) {
        const converge = this.convergeTimes[i]!;
        const head = Math.max(0, 1 - age / converge);
        const tail = Math.min(1, Math.max(0, 1 - (age - streak) / converge));
        const o = i * 3;
        x += this.offsets[o]! * head;
        y += this.offsets[o + 1]! * head;
        z += this.offsets[o + 2]! * head;
        tx += this.offsets[o]! * tail;
        ty += this.offsets[o + 1]! * tail;
        tz += this.offsets[o + 2]! * tail;
      }
      // Keep far BBs visible: scale up in proportion to distance once they'd be under the minimum size.
      const dist = Math.hypot(x - camera.x, y - camera.y, z - camera.z);
      const s = Math.max(1, dist * minScale);
      this.matrix.makeScale(s, s, s).setPosition(x, y, z);
      this.balls.setMatrixAt(count, this.matrix);
      const o = count * 6;
      tp[o] = x;
      tp[o + 1] = y;
      tp[o + 2] = z;
      tp[o + 3] = tx;
      tp[o + 4] = ty;
      tp[o + 5] = tz;
      count++;
    }
    this.balls.count = count;
    this.balls.instanceMatrix.needsUpdate = true;
    const geo = this.trails.geometry;
    geo.setDrawRange(0, count * 2);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /**
   * Draw `bb` as if fired from `muzzle` (world space): it starts there and blends onto its real path
   * over BB_VISUALS.muzzleConvergeTime, or sooner if it will hit something first (`flightTime`, s), so
   * the streak always arrives where the impact puff appears. Only the visuals move; the simulated BB
   * is untouched.
   */
  startFromMuzzle(bb: BB, muzzle: { x: number; y: number; z: number }, flightTime: number): void {
    const i = this.pool.bbs.indexOf(bb);
    if (i < 0) return;
    this.offsetSerial[i] = bb.serial;
    this.convergeTimes[i] = Math.max(
      BB_VISUALS.minConvergeTime,
      Math.min(BB_VISUALS.muzzleConvergeTime, flightTime * BB_VISUALS.convergeBeforeImpact),
    );
    this.offsets[i * 3] = muzzle.x - bb.prevPosition.x;
    this.offsets[i * 3 + 1] = muzzle.y - bb.prevPosition.y;
    this.offsets[i * 3 + 2] = muzzle.z - bb.prevPosition.z;
  }

  get visibleCount(): number {
    return this.balls.count;
  }

  dispose(): void {
    this.balls.geometry.dispose();
    (this.balls.material as THREE.Material).dispose();
    this.balls.dispose();
    this.trails.geometry.dispose();
    (this.trails.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}

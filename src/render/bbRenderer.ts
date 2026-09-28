import * as THREE from 'three';
import { BB_VISUALS } from '../config/render';
import type { BBPool } from '../sim/ballistics';

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

  constructor(private readonly pool: BBPool) {
    const n = pool.bbs.length;
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
  update(alpha: number): void {
    let count = 0;
    const tp = this.trailPositions;
    for (const bb of this.pool.bbs) {
      if (!bb.active) continue;
      const x = bb.prevPosition.x + (bb.position.x - bb.prevPosition.x) * alpha;
      const y = bb.prevPosition.y + (bb.position.y - bb.prevPosition.y) * alpha;
      const z = bb.prevPosition.z + (bb.position.z - bb.prevPosition.z) * alpha;
      this.matrix.makeTranslation(x, y, z);
      this.balls.setMatrixAt(count, this.matrix);
      const o = count * 6;
      tp[o] = x;
      tp[o + 1] = y;
      tp[o + 2] = z;
      tp[o + 3] = x - bb.velocity.x * BB_VISUALS.trailSeconds;
      tp[o + 4] = y - bb.velocity.y * BB_VISUALS.trailSeconds;
      tp[o + 5] = z - bb.velocity.z * BB_VISUALS.trailSeconds;
      count++;
    }
    this.balls.count = count;
    this.balls.instanceMatrix.needsUpdate = true;
    const geo = this.trails.geometry;
    geo.setDrawRange(0, count * 2);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
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

import * as THREE from 'three';
import type { PuffConfig } from '../config/render';
import type { Vec3 } from '../sim/vec';

interface Puff {
  x: number;
  y: number;
  z: number;
  /** Seconds since spawned; >= lifetime means free. */
  age: number;
}

/** Dust puffs where BBs hit something: grow fast, then shrink away. Pooled, one draw call per pool. */
export class ImpactPuffs {
  readonly object: THREE.InstancedMesh;
  private readonly puffs: Puff[] = [];
  private next = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly rot = new THREE.Quaternion();

  constructor(private readonly cfg: PuffConfig) {
    for (let i = 0; i < cfg.max; i++) this.puffs.push({ x: 0, y: 0, z: 0, age: cfg.lifetime });
    this.object = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(cfg.radius, 1),
      new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: cfg.opacity,
        depthWrite: false,
      }),
      cfg.max,
    );
    this.object.count = 0;
    this.object.frustumCulled = false;
  }

  spawn(at: Vec3): void {
    const p = this.puffs[this.next]!;
    this.next = (this.next + 1) % this.puffs.length;
    p.x = at.x;
    p.y = at.y;
    p.z = at.z;
    p.age = 0;
  }

  /** `camera` is the eye position, used to keep far puffs a minimum size on screen. */
  update(dt: number, camera: { x: number; y: number; z: number }): void {
    const P = this.cfg;
    let count = 0;
    const minScale = P.minAngularRadius / P.radius;
    for (const p of this.puffs) {
      if (p.age >= P.lifetime) continue;
      p.age += dt;
      const t = p.age;
      const grow = Math.min(1, t / P.growTime);
      const fade = 1 - Math.max(0, (t - P.growTime) / (P.lifetime - P.growTime));
      const dist = Math.hypot(p.x - camera.x, p.y - camera.y, p.z - camera.z);
      const s = Math.max(0, grow * fade) * Math.max(1, dist * minScale);
      this.pos.set(p.x, p.y + t * P.drift, p.z);
      this.scale.setScalar(s);
      this.matrix.compose(this.pos, this.rot, this.scale);
      this.object.setMatrixAt(count++, this.matrix);
    }
    this.object.count = count;
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.dispose();
    this.object.removeFromParent();
  }
}


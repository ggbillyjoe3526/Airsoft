import * as THREE from 'three';
import { IMPACT_PUFFS } from '../config/render';
import type { Vec3 } from '../sim/vec';

interface Puff {
  x: number;
  y: number;
  z: number;
  /** Seconds since spawned; >= lifetime means free. */
  age: number;
}

/** Little dust puffs where BBs hit something: grow fast, then shrink away. Pooled, one draw call. */
export class ImpactPuffs {
  readonly object: THREE.InstancedMesh;
  private readonly puffs: Puff[] = [];
  private next = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private readonly rot = new THREE.Quaternion();

  constructor() {
    for (let i = 0; i < IMPACT_PUFFS.max; i++) this.puffs.push({ x: 0, y: 0, z: 0, age: IMPACT_PUFFS.lifetime });
    this.object = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(IMPACT_PUFFS.radius, 0),
      new THREE.MeshBasicMaterial({
        color: IMPACT_PUFFS.color,
        transparent: true,
        opacity: IMPACT_PUFFS.opacity,
        depthWrite: false,
      }),
      IMPACT_PUFFS.max,
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

  update(dt: number): void {
    let count = 0;
    for (const p of this.puffs) {
      if (p.age >= IMPACT_PUFFS.lifetime) continue;
      p.age += dt;
      const t = p.age;
      const grow = Math.min(1, t / IMPACT_PUFFS.growTime);
      const fade = 1 - Math.max(0, (t - IMPACT_PUFFS.growTime) / (IMPACT_PUFFS.lifetime - IMPACT_PUFFS.growTime));
      const s = Math.max(0, grow * fade);
      this.pos.set(p.x, p.y + t * 0.15, p.z); // drifts up a touch
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


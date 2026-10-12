import * as THREE from 'three';
import { FIGURE_RIG } from '../config/figureRig';

/**
 * The empty magazines rigged figures throw away as they reload (BF1; the owner's ruling, 11 Oct: bots drop the empty
 * magazine): each leaves the hand with the sidecar's throw, falls, lands lying on its side where the thrower stood and
 * is gone after the sidecar's lifetime. A few at most (FIGURE_RIG.thrownMagazines.max: the oldest goes first), each one
 * mesh borrowing its thrower's geometry and material; a figure that frees them takes its magazines with it (forget).
 * Look only: nothing in the simulation knows about them.
 */

interface Flying {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  gravity: number;
  /** Where it comes to rest: the ground's height plus half its thickness, and the axis it lies flat on (its own). */
  restY: number;
  flatAxis: THREE.Vector3;
  age: number;
  lifetime: number;
  landed: boolean;
}

/** One step of a thrown magazine's flight (exported for the tests): falls, turns, and lies flat once it lands. */
export function stepThrown(f: Pick<Flying, 'velocity' | 'spin' | 'gravity' | 'restY' | 'flatAxis' | 'landed'>, position: THREE.Vector3, quaternion: THREE.Quaternion, dt: number): void {
  if (f.landed) return;
  f.velocity.y -= f.gravity * dt;
  position.addScaledVector(f.velocity, dt);
  const rate = f.spin.length();
  if (rate > 1e-6) quaternion.premultiply(turn.setFromAxisAngle(axis.copy(f.spin).divideScalar(rate), rate * dt));
  if (position.y > f.restY) return;
  // Landed: on the ground, lying on its flat side (its flat axis turned to point straight up or down, whichever is nearer).
  position.y = f.restY;
  f.landed = true;
  axis.copy(f.flatAxis).applyQuaternion(quaternion).normalize();
  quaternion.premultiply(turn.setFromUnitVectors(axis, axis.y >= 0 ? UP : DOWN));
}

const turn = new THREE.Quaternion();
const axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

export class ThrownMagazines {
  readonly object = new THREE.Group();
  private readonly flying: Flying[] = [];

  constructor() {
    this.object.name = 'thrownMagazines';
  }

  /** How many are out now. */
  get count(): number {
    return this.flying.length;
  }

  /**
   * Throws a magazine of `geometry` in `material` from `matrix` (world) with `velocity` (m/s) and `spin` (rad/s, axis
   * times rate), to land at height `groundY`; it lies on the axis of `geometry` it is thinnest along. Copies its inputs.
   */
  throw(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, velocity: THREE.Vector3, spin: THREE.Vector3, gravity: number, groundY: number, lifetime: number, castShadow: boolean): void {
    if (this.flying.length >= FIGURE_RIG.thrownMagazines.max) this.drop(0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'thrownMagazine';
    matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = castShadow;
    geometry.boundingBox ?? geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const thin = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
    const flatAxis = new THREE.Vector3().setComponent(thin, 1);
    const half = (size.getComponent(thin) * mesh.scale.getComponent(thin)) / 2;
    this.object.add(mesh);
    this.flying.push({ mesh, velocity: velocity.clone(), spin: spin.clone(), gravity, restY: groundY + half, flatAxis, age: 0, lifetime, landed: false });
  }

  update(dt: number): void {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]!;
      f.age += dt;
      if (f.age >= f.lifetime) {
        this.drop(i);
        continue;
      }
      stepThrown(f, f.mesh.position, f.mesh.quaternion, dt);
    }
  }

  /** Takes away every magazine made of `geometry` or `material` (its thrower is freeing them). */
  forget(geometry: THREE.BufferGeometry | null, material: THREE.Material | null): void {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const m = this.flying[i]!.mesh;
      if (m.geometry === geometry || m.material === material) this.drop(i);
    }
  }

  /** Every magazine gone (a new round). */
  clear(): void {
    for (let i = this.flying.length - 1; i >= 0; i--) this.drop(i);
  }

  dispose(): void {
    this.clear();
    this.object.removeFromParent();
  }

  private drop(i: number): void {
    const [f] = this.flying.splice(i, 1);
    f?.mesh.removeFromParent();
  }
}

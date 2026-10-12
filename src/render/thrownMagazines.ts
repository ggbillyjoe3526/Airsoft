import * as THREE from 'three';
import { FIGURE_RIG } from '../config/figureRig';

/**
 * The empty magazines rigged figures throw away as they reload (BF1; the owner's ruling, 11 Oct: bots drop the empty
 * magazine): each leaves the hand with the sidecar's throw, falls, lands lying on its side where the thrower stood and
 * is gone after the sidecar's lifetime. A few at most (FIGURE_RIG.thrownMagazines.max: the oldest goes first), each one
 * mesh borrowing its thrower's geometry and material; a figure that frees them takes its magazines with it (forget).
 * Pooled like the BB puffs: the meshes and their records are made once and reused, so a throw allocates nothing.
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
  /** The throw's number, so the oldest out is the one to go when all are out. */
  born: number;
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

const size = new THREE.Vector3();

export class ThrownMagazines {
  readonly object = new THREE.Group();
  /** The records out now, then the ones made earlier and free again (`out` of them are out). */
  private readonly flying: Flying[] = [];
  private out = 0;
  private throws = 0;

  constructor() {
    this.object.name = 'thrownMagazines';
  }

  /** How many are out now. */
  get count(): number {
    return this.out;
  }

  /**
   * Throws a magazine of `geometry` in `material` from `matrix` (world) with `velocity` (m/s) and `spin` (rad/s, axis
   * times rate), to land at height `groundY`; it lies on the axis of `geometry` it is thinnest along. Copies its inputs.
   */
  throw(geometry: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, velocity: THREE.Vector3, spin: THREE.Vector3, gravity: number, groundY: number, lifetime: number, castShadow: boolean): void {
    if (this.out >= FIGURE_RIG.thrownMagazines.max) this.drop(this.oldest());
    const f = this.take(geometry, material);
    const mesh = f.mesh;
    mesh.geometry = geometry;
    mesh.material = material;
    matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = castShadow;
    geometry.boundingBox ?? geometry.computeBoundingBox();
    geometry.boundingBox!.getSize(size);
    const thin = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
    f.flatAxis.set(0, 0, 0).setComponent(thin, 1);
    f.restY = groundY + (size.getComponent(thin) * mesh.scale.getComponent(thin)) / 2;
    f.velocity.copy(velocity);
    f.spin.copy(spin);
    f.gravity = gravity;
    f.age = 0;
    f.lifetime = lifetime;
    f.landed = false;
    f.born = this.throws++;
    this.object.add(mesh);
  }

  update(dt: number): void {
    for (let i = this.out - 1; i >= 0; i--) {
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
    for (let i = this.out - 1; i >= 0; i--) {
      const m = this.flying[i]!.mesh;
      if (m.geometry === geometry || m.material === material) this.drop(i);
    }
  }

  /** Every magazine gone (a new round: CharacterRenderer.roundStarted). */
  clear(): void {
    for (let i = this.out - 1; i >= 0; i--) this.drop(i);
  }

  dispose(): void {
    this.clear();
    this.object.removeFromParent();
  }

  /** A free record (made the first time the pool is that deep), now counted as out. */
  private take(geometry: THREE.BufferGeometry, material: THREE.Material): Flying {
    if (this.out === this.flying.length) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'thrownMagazine';
      this.flying.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), gravity: 0, restY: 0, flatAxis: new THREE.Vector3(), age: 0, lifetime: 0, landed: false, born: 0 });
    }
    return this.flying[this.out++]!;
  }

  private oldest(): number {
    let at = 0;
    for (let i = 1; i < this.out; i++) if (this.flying[i]!.born < this.flying[at]!.born) at = i;
    return at;
  }

  /** Record `i` back to the free ones: the last one out takes its place. */
  private drop(i: number): void {
    const f = this.flying[i]!;
    f.mesh.removeFromParent();
    const last = --this.out;
    this.flying[i] = this.flying[last]!;
    this.flying[last] = f;
  }
}

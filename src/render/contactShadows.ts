import * as THREE from 'three';
import { CONTACT_SHADOWS } from '../config/render';
import type { Character } from '../sim/character';

const S = CONTACT_SHADOWS;

/**
 * The contact shadow's disc (no texture): a fan of two rings, darkest in the middle, `middleShade` of that at `middle`
 * of the radius out and clear at the rim, as black with vertex alpha. Radius 1, lying flat (facing up).
 */
export function contactDiscGeometry(): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const col: number[] = [0, 0, 0, 1];
  for (const [ring, alpha] of [
    [S.middle, S.middleShade],
    [1, 0],
  ] as const) {
    for (let s = 0; s < S.segments; s++) {
      const t = (s / S.segments) * Math.PI * 2;
      pos.push(Math.cos(t) * ring, 0, Math.sin(t) * ring);
      col.push(0, 0, 0, alpha);
    }
  }
  const idx: number[] = [];
  const n = S.segments;
  for (let s = 0; s < n; s++) {
    const next = (s + 1) % n;
    // Wound to face up (+y): centre, then clockwise seen from below.
    idx.push(0, 1 + next, 1 + s, 1 + s, 1 + next, 1 + n + next, 1 + s, 1 + n + next, 1 + n + s);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  return geo;
}

/** The disc's radius (m) for a figure `crouch` (0 standing .. 1 fully crouched) down. */
export function contactRadius(crouch: number): number {
  return S.radius + (S.crouchedRadius - S.radius) * Math.min(1, Math.max(0, crouch));
}

/**
 * Contact shadows (audit section 5, F5): a soft dark disc on the floor under each player, all of them one instanced
 * draw call, on every preset. It grounds a figure on Low, where there are no shadow maps, and under a wall's shade on
 * every preset. A crouch draws it tighter; a figure fading out of play takes its disc with it. Reads the characters'
 * state only; allocation-free each frame.
 */
export class ContactShadows {
  readonly object: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();

  constructor(
    private readonly characters: readonly Character[],
    /** How long a figure leaving play takes to fade (s): its disc fades with it (HitConfig.vanishTime). */
    private readonly vanishTime: number,
  ) {
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: S.darkness,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.object = new THREE.InstancedMesh(contactDiscGeometry(), material, Math.min(S.maxFigures, Math.max(1, characters.length)));
    this.object.name = 'contact-shadows';
    this.object.frustumCulled = false;
    this.object.count = 0;
  }

  /** Once per frame: a disc under every figure drawn (not `hiddenId`, the one the camera is inside). */
  update(alpha: number, hiddenId: number): void {
    let n = 0;
    const max = this.object.instanceMatrix.count;
    for (const c of this.characters) {
      if (n >= max) break;
      if (c.id === hiddenId) continue;
      const fade = c.status === 'leaving' ? Math.min(1, Math.max(0, 1 - c.statusTime / this.vanishTime)) : 1;
      if (fade <= 0) continue;
      const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
      const r = contactRadius(crouch) * fade;
      this.position.set(
        c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha,
        c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha + S.lift,
        c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha,
      );
      this.object.setMatrixAt(n++, this.matrix.compose(this.position, this.turn, this.scale.set(r, 1, r)));
    }
    this.object.count = n;
    this.object.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}

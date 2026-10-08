import * as THREE from 'three';
import { PLANE } from '../config/dressing';
import { createRng, rngNext } from '../sim/rng';

/**
 * A plane crossing the sky now and then (G9, MapDressing.plane): a small dark airframe with steady wingtip and beacon
 * lights, high over the field on a seeded line. One mesh, one draw call while it is up there (hidden between passes:
 * one crosses, then the sky is empty for a while). Built once with fixed geometry; update only moves its matrix, so it
 * allocates nothing per frame. Under Reduced motion it is hidden altogether. No flashing: its lights are steady.
 */

const P = PLANE;

export class PassingPlane {
  readonly object: THREE.Mesh;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private time = 0;
  private pass = -1;
  private motion = true;
  /** How long one pass takes (s) and the gap between passes. */
  private readonly crossing: number;

  /**
   * A plane `height` m up, one passing about every `every` seconds, over a field centred on `centre`; `night` picks the
   * airframe's colour (a dark silhouette by night, pale by day).
   */
  constructor(
    private readonly centre: { x: number; z: number },
    private readonly height: number,
    private readonly every: number,
    night: boolean,
  ) {
    this.crossing = P.path / P.speed;
    const body = new THREE.CylinderGeometry(P.length * 0.055, P.length * 0.04, P.length, 6).rotateZ(Math.PI / 2);
    const nose = new THREE.ConeGeometry(P.length * 0.055, P.length * 0.16, 6).rotateZ(-Math.PI / 2).translate(P.length * 0.58, 0, 0);
    const wing = new THREE.BoxGeometry(P.length * 0.2, P.length * 0.015, P.span).translate(P.length * 0.03, 0, 0);
    const tail = new THREE.BoxGeometry(P.length * 0.14, P.length * 0.2, P.length * 0.014).translate(-P.length * 0.44, P.length * 0.1, 0);
    const stab = new THREE.BoxGeometry(P.length * 0.12, P.length * 0.012, P.span * 0.36).translate(-P.length * 0.44, 0, 0);
    const parts = [body, nose, wing, tail, stab].map((g) => paint(g, night ? P.night : P.day, 1));
    // The lights: a small cube at each wingtip and under the belly, in their own colours, bright (they are unlit).
    const lights: [number, number, number, string][] = [
      [P.length * 0.04, 0, -P.span / 2, P.lights.port],
      [P.length * 0.04, 0, P.span / 2, P.lights.starboard],
      [-P.length * 0.1, -P.length * 0.05, 0, P.lights.beacon],
    ];
    for (const [x, y, z, colour] of lights) parts.push(paint(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(x, y, z), colour, 1.5));
    const merged = mergeAll(parts);
    this.object = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    this.object.name = 'passingPlane';
    this.object.frustumCulled = false;
    this.object.matrixAutoUpdate = false;
    this.object.visible = false;
    this.object.renderOrder = -1;
  }

  /** Reduced motion on (false): no plane crosses. */
  setMotion(on: boolean): void {
    this.motion = on;
    if (!on) this.object.visible = false;
  }

  /** Moves it on by `dt`: one pass every `every` seconds along a seeded line; nothing drawn between passes. */
  update(dt: number): void {
    if (!this.motion) return;
    this.time += dt;
    const period = this.every + this.crossing;
    const n = Math.floor(this.time / period);
    const at = this.time - n * period;
    if (at > this.crossing) {
      this.object.visible = false;
      return;
    }
    if (n !== this.pass) {
      this.pass = n;
      this.setPath(n);
    }
    this.at.lerpVectors(this.from, this.to, at / this.crossing);
    this.object.visible = true;
    this.object.matrix.compose(this.at, this.quaternion, this.scale);
    this.object.matrixWorldNeedsUpdate = true;
  }

  /** Pass `n`'s line across the sky (seeded): a heading and an offset from the field's middle. */
  private setPath(n: number): void {
    const rng = createRng(P.seed + n * 101);
    const heading = rngNext(rng) * Math.PI * 2;
    const dx = Math.cos(heading);
    const dz = Math.sin(heading);
    const across = (rngNext(rng) * 2 - 1) * P.path * 0.3;
    const y = this.height * (0.85 + rngNext(rng) * 0.3);
    const mx = this.centre.x - dz * across;
    const mz = this.centre.z + dx * across;
    this.from.set(mx - dx * (P.path / 2), y, mz - dz * (P.path / 2));
    this.to.set(mx + dx * (P.path / 2), y, mz + dz * (P.path / 2));
    // Its nose (own +x) along the heading.
    this.quaternion.setFromAxisAngle(UP, Math.atan2(-dz, dx));
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const tint = new THREE.Color();

/** One part, non-indexed and vertex-coloured `hex` (sRGB) times `k`, as the other merged meshes are. */
function paint(geo: THREE.BufferGeometry, hex: string, k: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  tint.setStyle(hex);
  const n = g.getAttribute('position').count;
  const colours = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colours.set([tint.r * k, tint.g * k, tint.b * k], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** The parts as one geometry (positions and colours only). */
function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  for (const p of parts) {
    const a = p.getAttribute('position');
    const c = p.getAttribute('color');
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i));
      col.push(c.getX(i), c.getY(i), c.getZ(i));
    }
    p.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
}

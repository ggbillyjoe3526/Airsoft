import * as THREE from 'three';
import { PLANE } from '../config/dressing';
import { createRng, rngNext } from '../sim/rng';

/**
 * A plane crossing the sky now and then (G9, MapDressing.plane): a small dark airframe with steady wingtip and beacon
 * lights, high over the field on a seeded line, hidden between passes (one crosses, then the sky is empty until the
 * next is due). Its mesh draws it (one draw call while it is up there) only where nothing carries it: in the game the
 * tree ring's mesh does (render/skyHost.ts, no draw call of its own) and this is its flight, which DressingEffects
 * hands to the ring each frame. A pass starts every `every` seconds, start to start; the
 * crossing (PLANE.path / PLANE.speed) takes part of that. Built once with fixed geometry; update only moves its matrix
 * and setNight rewrites the airframe's colours in place, so it allocates nothing after it is made. Under Reduced motion
 * it is hidden altogether. No flashing: its lights are steady.
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
  /** How long one crossing takes (s). */
  private readonly crossing: number;
  /** Start to start (s): `every`, or the crossing itself if that is longer (back-to-back passes, never overlapping). */
  private readonly period: number;
  /** The airframe's vertices: the first this many of the colour buffer (the lights follow). */
  private readonly airframe: number;

  /**
   * A plane `height` m up, a pass starting every `every` seconds, over a field centred on `centre`; `night` picks the
   * airframe's colour (a dark silhouette by night, pale by day), and setNight changes it later.
   */
  constructor(
    private readonly centre: { x: number; z: number },
    private readonly height: number,
    every: number,
    night: boolean,
  ) {
    this.crossing = P.path / P.speed;
    this.period = Math.max(every, this.crossing);
    const { geometry, airframe } = planeGeometry(night);
    this.airframe = airframe;
    this.object = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    this.object.name = 'passingPlane';
    this.object.frustumCulled = false;
    this.object.matrixAutoUpdate = false;
    this.object.visible = false;
    this.object.renderOrder = -1;
  }

  /** By night a dark silhouette, by day the pale airframe: its colours rewritten in place (the lights keep theirs). */
  setNight(night: boolean): void {
    const colours = this.object.geometry.getAttribute('color') as THREE.BufferAttribute;
    tint.setStyle(night ? P.night : P.day);
    for (let i = 0; i < this.airframe; i++) colours.setXYZ(i, tint.r, tint.g, tint.b);
    colours.needsUpdate = true;
  }

  /** Reduced motion on (false): no plane crosses. */
  setMotion(on: boolean): void {
    this.motion = on;
    if (!on) this.object.visible = false;
  }

  /** Moves it on by `dt`: a pass starting every `period` seconds along a seeded line; nothing drawn between passes. */
  update(dt: number): void {
    if (!this.motion) return;
    this.time += dt;
    const n = Math.floor(this.time / this.period);
    const at = this.time - n * this.period;
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

/**
 * The plane as one geometry (positions and colours, non-indexed), its nose along its own +x: the airframe in the day's
 * or the `night`'s colour, then a steady light at each wingtip and under the belly. `airframe`: how many of its vertices
 * (the first) are the airframe. PassingPlane draws it; render/skyHost.ts puts the same plane in the tree ring's mesh.
 */
export function planeGeometry(night: boolean): { geometry: THREE.BufferGeometry; airframe: number } {
  const body = new THREE.CylinderGeometry(P.length * 0.055, P.length * 0.04, P.length, 6).rotateZ(Math.PI / 2);
  const nose = new THREE.ConeGeometry(P.length * 0.055, P.length * 0.16, 6).rotateZ(-Math.PI / 2).translate(P.length * 0.58, 0, 0);
  const wing = new THREE.BoxGeometry(P.length * 0.2, P.length * 0.015, P.span).translate(P.length * 0.03, 0, 0);
  const tail = new THREE.BoxGeometry(P.length * 0.14, P.length * 0.2, P.length * 0.014).translate(-P.length * 0.44, P.length * 0.1, 0);
  const stab = new THREE.BoxGeometry(P.length * 0.12, P.length * 0.012, P.span * 0.36).translate(-P.length * 0.44, 0, 0);
  const parts = [body, nose, wing, tail, stab].map((g) => paint(g, night ? P.night : P.day, 1));
  const airframe = parts.reduce((n, g) => n + g.getAttribute('position').count, 0);
  // The lights: a small cube at each wingtip and under the belly, in their own colours, bright (they are unlit).
  const lights: [number, number, number, string][] = [
    [P.length * 0.04, 0, -P.span / 2, P.lights.port],
    [P.length * 0.04, 0, P.span / 2, P.lights.starboard],
    [-P.length * 0.1, -P.length * 0.05, 0, P.lights.beacon],
  ];
  for (const [x, y, z, colour] of lights) parts.push(paint(new THREE.BoxGeometry(0.5, 0.5, 0.5).translate(x, y, z), colour, 1.5));
  return { geometry: mergeAll(parts), airframe };
}

/**
 * The farthest the plane gets from the world's middle across the field (m) and its highest flight (m), for a plane
 * `height` m up: the sphere a mesh carrying it is culled by must hold every point of every pass.
 */
export function planeReach(height: number): { across: number; top: number } {
  return { across: Math.hypot(P.path / 2, P.path * 0.3) + P.length, top: height * 1.15 + P.length };
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

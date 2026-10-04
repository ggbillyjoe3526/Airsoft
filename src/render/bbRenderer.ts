import * as THREE from 'three';
import { BB_VISUALS } from '../config/render';
import type { BB, BBPool } from '../sim/ballistics';
import { softDotTexture } from './softDot';

/** Vertices and indices of one streak: a quad, two corners at the head and two at the tail. */
const QUAD_VERTICES = 4;
const QUAD_INDICES = 6;
/** The glow's soft dot is drawn this much wider than its radius (as the puffs', impactPuffs.ts). */
const SOFT_EDGE = 1.4;
const WHITE = new THREE.Color(0xffffff);

/**
 * The BB's ball, two-toned (FA8): lit cream on top, a warm grey underneath, so it reads as a ball in the sun. Vertex
 * colours on the sphere; the material is white.
 */
function twoToneBall(): THREE.SphereGeometry {
  const geo = new THREE.SphereGeometry(BB_VISUALS.radius, 8, 6);
  const lit = new THREE.Color(BB_VISUALS.color);
  const shade = new THREE.Color(BB_VISUALS.shadeColor);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.lerpColors(shade, lit, THREE.MathUtils.smoothstep(pos.getY(i) / BB_VISUALS.radius, -0.6, 0.5));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Draws every BB in flight as a small bright ball with a short streak behind it (one instanced mesh + one ribbon
 * buffer, sized to the pool, so nothing is allocated per frame). Each streak is a quad facing the camera, as wide on
 * screen at its head and its tail (BB_VISUALS.trailAngularWidth, audit REN-19), not a one-device-pixel line.
 */
export class BBRenderer {
  readonly object = new THREE.Group();
  private readonly balls: THREE.InstancedMesh;
  /** A soft warm glow round each ball (QualitySettings.bbGlow, FA8): camera-facing dots, added. Hidden while off. */
  private readonly glow: THREE.InstancedMesh;
  /** The glow's soft dot, drawn the first time the glow is turned on. */
  private glowDot: THREE.CanvasTexture | null = null;
  private glowOn = false;
  private readonly glowScale = new THREE.Vector3();
  private readonly glowPos = new THREE.Vector3();
  private readonly trails: THREE.Mesh;
  private readonly trailPositions: Float32Array;
  private readonly matrix = new THREE.Matrix4();
  /** Scratch for a streak's camera-facing side. */
  private readonly along = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  /** BBs drawn last frame: with none then and none now there is nothing to upload (REN-22). */
  private lastCount = 0;
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
    this.balls = new THREE.InstancedMesh(twoToneBall(), new THREE.MeshBasicMaterial({ vertexColors: true }), n);
    this.balls.count = 0;
    this.balls.frustumCulled = false;
    const G = BB_VISUALS.glow;
    const glowSize = BB_VISUALS.radius * 2 * G.scale * SOFT_EDGE;
    this.glow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(glowSize, glowSize),
      new THREE.MeshBasicMaterial({ color: G.color, transparent: true, opacity: G.opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
      n,
    );
    // A colour per instance (all white), so the glow shares the puffs' shader program rather than adding one.
    for (let i = 0; i < n; i++) this.glow.setColorAt(i, WHITE);
    this.glow.count = 0;
    this.glow.frustumCulled = false;
    this.glow.visible = false;

    this.trailPositions = new Float32Array(n * QUAD_VERTICES * 3);
    const colors = new Float32Array(n * QUAD_VERTICES * 3);
    const index = new Uint16Array(n * QUAD_INDICES);
    const head = new THREE.Color(BB_VISUALS.trailColor);
    for (let i = 0; i < n; i++) {
      // Bright at the BB (corners 0, 1), fading to black (invisible with additive blending) at the tail (2, 3).
      colors.set([head.r, head.g, head.b, head.r, head.g, head.b, 0, 0, 0, 0, 0, 0], i * QUAD_VERTICES * 3);
      const v = i * QUAD_VERTICES;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * QUAD_INDICES);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.setDrawRange(0, 0);
    this.trails = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: BB_VISUALS.trailOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // The quad faces the camera either way round, whichever way the BB flies.
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.trails.frustumCulled = false;
    this.object.add(this.balls, this.trails, this.glow);
  }

  /** The glow round each BB on or off (QualitySettings.bbGlow, FA8). */
  setGlow(on: boolean): void {
    if (on && !this.glowDot) {
      this.glowDot = softDotTexture();
      const material = this.glow.material as THREE.MeshBasicMaterial;
      material.map = this.glowDot;
      material.needsUpdate = true;
    }
    this.glowOn = on;
    this.glow.visible = on;
    if (!on) this.glow.count = 0;
  }

  /**
   * `alpha` interpolates between the last two simulation ticks; `camera` is the eye. `facing` (the camera's rotation)
   * turns the glow's dots to face it; without it there is no glow this frame.
   */
  update(alpha: number, camera: { x: number; y: number; z: number }, facing?: THREE.Quaternion): void {
    const glowing = this.glowOn && facing !== undefined;
    let count = 0;
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
      if (glowing) {
        this.matrix.compose(this.glowPos.set(x, y, z), facing, this.glowScale.setScalar(s));
        this.glow.setMatrixAt(count, this.matrix);
      }
      this.writeStreak(count * QUAD_VERTICES * 3, x, y, z, tx, ty, tz, camera);
      count++;
    }
    this.balls.count = count;
    this.glow.count = glowing ? count : 0;
    const geo = this.trails.geometry;
    geo.setDrawRange(0, count * QUAD_INDICES);
    // Nothing in flight now or last frame: the buffers already say so (REN-22).
    if (count > 0 || this.lastCount > 0) {
      this.balls.instanceMatrix.needsUpdate = true;
      if (glowing) this.glow.instanceMatrix.needsUpdate = true;
      (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    this.lastCount = count;
  }

  /**
   * One streak's quad at float offset `o`: the head (x, y, z) and tail (tx, ty, tz) each widened sideways, across the
   * line of sight, by their own distance × trailAngularWidth, so the ribbon is the same width on screen end to end.
   * A streak seen exactly end-on has no side: its quad is a line, drawn as nothing (the ball covers it).
   */
  private writeStreak(o: number, x: number, y: number, z: number, tx: number, ty: number, tz: number, eye: { x: number; y: number; z: number }): void {
    const tp = this.trailPositions;
    const halfAngle = BB_VISUALS.trailAngularWidth / 2;
    this.along.set(x - tx, y - ty, z - tz);
    this.toEye.set(eye.x - x, eye.y - y, eye.z - z);
    this.side.crossVectors(this.along, this.toEye);
    const len = this.side.length();
    if (len > 1e-9) this.side.multiplyScalar(1 / len);
    else this.side.set(0, 0, 0);
    const s = this.side;
    const headHalf = Math.hypot(x - eye.x, y - eye.y, z - eye.z) * halfAngle;
    const tailHalf = Math.hypot(tx - eye.x, ty - eye.y, tz - eye.z) * halfAngle;
    tp[o] = x + s.x * headHalf;
    tp[o + 1] = y + s.y * headHalf;
    tp[o + 2] = z + s.z * headHalf;
    tp[o + 3] = x - s.x * headHalf;
    tp[o + 4] = y - s.y * headHalf;
    tp[o + 5] = z - s.z * headHalf;
    tp[o + 6] = tx + s.x * tailHalf;
    tp[o + 7] = ty + s.y * tailHalf;
    tp[o + 8] = tz + s.z * tailHalf;
    tp[o + 9] = tx - s.x * tailHalf;
    tp[o + 10] = ty - s.y * tailHalf;
    tp[o + 11] = tz - s.z * tailHalf;
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
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
    this.glow.dispose();
    this.glowDot?.dispose();
    this.trails.geometry.dispose();
    (this.trails.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}

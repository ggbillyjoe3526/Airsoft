import * as THREE from 'three';
import { BB_VISUALS, RETRO } from '../config/render';
import type { BB, BBPool } from '../sim/ballistics';
import { length3 } from '../sim/vec';
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
 * screen at its head and its tail (BB_VISUALS.trailAngularWidth, audit REN-19), not a one-device-pixel line. Glowing
 * BBs (M33b, setGlowInDark) share both: a per-instance and per-vertex colour, a larger minimum size and a longer streak.
 */
export class BBRenderer {
  readonly object = new THREE.Group();
  private readonly balls: THREE.InstancedMesh;
  /** A soft warm glow round each ball (QualitySettings.bbGlow, FA8): camera-facing dots, added. Hidden while off. */
  private readonly glow: THREE.InstancedMesh;
  /** The glow's soft dot, drawn the first time the glow is turned on. */
  private glowDot: THREE.CanvasTexture | null = null;
  private glowOn = false;
  /** The glow dots' turn this frame, to face the camera (`facing` as a matrix, made once a frame). */
  private readonly facingBasis = new THREE.Matrix4();
  private readonly trails: THREE.Mesh;
  private readonly trailPositions: Float32Array;
  /**
   * The streak writeStreak draws: head x, y, z then tail x, y, z. Handed over in this buffer, not as six numbers, so the
   * call boxes nothing in any of V8's tiers (audit REN-10: the per-BB loop makes no garbage).
   */
  private readonly ends = new Float64Array(6);
  /** One retro pixel's width (radians of view) while the retro filter is on (M42), else 0. */
  private pixelAngle = 0;
  /** This frame's streak half-width (radians of view): BB_VISUALS.trailAngularWidth, or a retro pixel's if wider. */
  private trailHalfAngle = BB_VISUALS.trailAngularWidth / 2;
  /** BBs drawn last frame: with none then and none now there is nothing to upload (REN-22). */
  private lastCount = 0;
  /** Per pool slot: visual offset (muzzle minus true spawn point) for your own BBs, and which BB it belongs to. */
  private readonly offsets: Float32Array;
  private readonly offsetSerial: Float64Array;
  /** Per pool slot: seconds over which the muzzle offset blends away (never longer than the flight). */
  private readonly convergeTimes: Float32Array;
  /** Per pool slot: the serial of the glowing BB in it (setGlowInDark); a reused slot's new BB doesn't glow. */
  private readonly glowInDarkSerial: Float64Array;
  private readonly trailColors: Float32Array;
  private readonly glowInDarkColor = new THREE.Color(BB_VISUALS.glowInDark.color);
  private readonly trailHead = new THREE.Color(BB_VISUALS.trailColor);
  private readonly glowInDarkTrailHead = new THREE.Color(BB_VISUALS.glowInDark.trailColor);

  constructor(
    private readonly pool: BBPool,
    private readonly tickSeconds: number,
  ) {
    const n = pool.bbs.length;
    this.offsets = new Float32Array(n * 3);
    this.offsetSerial = new Float64Array(n);
    this.convergeTimes = new Float32Array(n);
    this.glowInDarkSerial = new Float64Array(n).fill(-1);
    // Two-tone vertex colours (FA8) times an instance colour: white, or green for a glowing BB (M33b).
    this.balls = new THREE.InstancedMesh(twoToneBall(), new THREE.MeshBasicMaterial({ vertexColors: true }), n);
    this.balls.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
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
    // Bright at the BB (corners 0, 1), fading to black (invisible with additive blending) at the tail (2, 3); the head's
    // colour is set per frame, as the BB drawn in a quad changes (white or glowing).
    this.trailColors = new Float32Array(n * QUAD_VERTICES * 3);
    const index = new Uint16Array(n * QUAD_INDICES);
    for (let i = 0; i < n; i++) {
      const v = i * QUAD_VERTICES;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * QUAD_INDICES);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3).setUsage(THREE.DynamicDrawUsage));
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
   * One retro pixel's width in radians of view (Renderer.retroPixelAngle, M42; 0 with the filter off): balls and streaks
   * are then never drawn narrower than RETRO.bbMinPixels and RETRO.trailMinPixels of them, so they don't fall between
   * the low-resolution view's samples.
   */
  setPixelAngle(angle: number): void {
    this.pixelAngle = angle;
  }

  /**
   * `alpha` interpolates between the last two simulation ticks; `camera` is the eye. `facing` (the camera's rotation)
   * turns the glow's dots to face it; without it there is no glow this frame.
   */
  update(alpha: number, camera: { x: number; y: number; z: number }, facing?: THREE.Quaternion): void {
    const glowing = this.glowOn && facing !== undefined;
    let count = 0;
    const bbs = this.pool.bbs;
    const tc = this.trailColors;
    // Never narrower than a couple of retro pixels while the retro filter is on (M42).
    const retroMin = (this.pixelAngle * RETRO.bbMinPixels) / 2;
    const minScale = Math.max(BB_VISUALS.minAngularRadius, retroMin) / BB_VISUALS.radius;
    const luminousMinScale = Math.max(BB_VISUALS.glowInDark.minAngularRadius, retroMin) / BB_VISUALS.radius;
    this.trailHalfAngle = Math.max(BB_VISUALS.trailAngularWidth, this.pixelAngle * RETRO.trailMinPixels) / 2;
    // Each instance's matrix is written straight into its buffer (no Matrix4 per BB, nothing boxed; REN-10). A ball's is
    // a uniform scale and a move, so only those six numbers are written: the rest keep the identity InstancedMesh
    // starts every instance with, as nothing else writes them. A glow dot's is the camera's turn, scaled, and a move.
    const ballMatrices = this.balls.instanceMatrix.array as Float32Array;
    const glowMatrices = this.glow.instanceMatrix.array as Float32Array;
    const turn = this.facingBasis.elements;
    if (glowing) this.facingBasis.makeRotationFromQuaternion(facing);
    const ends = this.ends;
    for (let i = 0; i < bbs.length; i++) {
      const bb = bbs[i]!;
      if (!bb.active) continue;
      const luminous = this.glowInDarkSerial[i] === bb.serial;
      const trail = luminous ? BB_VISUALS.glowInDark.trailSeconds : BB_VISUALS.trailSeconds;
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
      const dist = length3(x - camera.x, y - camera.y, z - camera.z);
      const s = Math.max(1, dist * (luminous ? luminousMinScale : minScale));
      const m = count * 16;
      ballMatrices[m] = ballMatrices[m + 5] = ballMatrices[m + 10] = s;
      ballMatrices[m + 12] = x;
      ballMatrices[m + 13] = y;
      ballMatrices[m + 14] = z;
      this.balls.setColorAt(count, luminous ? this.glowInDarkColor : WHITE);
      if (glowing) {
        for (let k = 0; k < 11; k++) glowMatrices[m + k] = turn[k]! * s; // the turn's 3×3, scaled; its zeros stay zero
        glowMatrices[m + 12] = x;
        glowMatrices[m + 13] = y;
        glowMatrices[m + 14] = z;
      }
      const o = count * QUAD_VERTICES * 3;
      const head = luminous ? this.glowInDarkTrailHead : this.trailHead;
      tc[o] = tc[o + 3] = head.r;
      tc[o + 1] = tc[o + 4] = head.g;
      tc[o + 2] = tc[o + 5] = head.b;
      ends[0] = x;
      ends[1] = y;
      ends[2] = z;
      ends[3] = tx;
      ends[4] = ty;
      ends[5] = tz;
      this.writeStreak(o, camera);
      count++;
    }
    this.balls.count = count;
    this.glow.count = glowing ? count : 0;
    const geo = this.trails.geometry;
    geo.setDrawRange(0, count * QUAD_INDICES);
    // Nothing in flight now or last frame: the buffers already say so (REN-22).
    if (count > 0 || this.lastCount > 0) {
      this.balls.instanceMatrix.needsUpdate = true;
      this.balls.instanceColor!.needsUpdate = true;
      if (glowing) this.glow.instanceMatrix.needsUpdate = true;
      (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    }
    this.lastCount = count;
  }

  /**
   * One streak's quad at float offset `o`: the head and tail (`ends`) each widened sideways, across the
   * line of sight, by their own distance × trailAngularWidth (or a retro pixel, M42), so the ribbon is the same width
   * on screen end to end.
   * A streak seen exactly end-on has no side: its quad is a line, drawn as nothing (the ball covers it).
   */
  private writeStreak(o: number, eye: { x: number; y: number; z: number }): void {
    const e = this.ends;
    const x = e[0]!;
    const y = e[1]!;
    const z = e[2]!;
    const tx = e[3]!;
    const ty = e[4]!;
    const tz = e[5]!;
    const tp = this.trailPositions;
    const halfAngle = this.trailHalfAngle;
    // The side: along the streak × towards the eye, normalised (by hand: no vector calls in the per-BB path).
    const ax = x - tx;
    const ay = y - ty;
    const az = z - tz;
    const ex = eye.x - x;
    const ey = eye.y - y;
    const ez = eye.z - z;
    let sx = ay * ez - az * ey;
    let sy = az * ex - ax * ez;
    let sz = ax * ey - ay * ex;
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const inv = len > 1e-9 ? 1 / len : 0;
    sx *= inv;
    sy *= inv;
    sz *= inv;
    const headHalf = length3(x - eye.x, y - eye.y, z - eye.z) * halfAngle;
    const tailHalf = length3(tx - eye.x, ty - eye.y, tz - eye.z) * halfAngle;
    tp[o] = x + sx * headHalf;
    tp[o + 1] = y + sy * headHalf;
    tp[o + 2] = z + sz * headHalf;
    tp[o + 3] = x - sx * headHalf;
    tp[o + 4] = y - sy * headHalf;
    tp[o + 5] = z - sz * headHalf;
    tp[o + 6] = tx + sx * tailHalf;
    tp[o + 7] = ty + sy * tailHalf;
    tp[o + 8] = tz + sz * tailHalf;
    tp[o + 9] = tx - sx * tailHalf;
    tp[o + 10] = ty - sy * tailHalf;
    tp[o + 11] = tz - sz * tailHalf;
  }

  /** Draws `bb` as a glowing (glow-in-the-dark) BB, or not, for the rest of its flight (M33b). */
  setGlowInDark(bb: BB, on: boolean): void {
    const i = this.pool.bbs.indexOf(bb);
    if (i >= 0) this.glowInDarkSerial[i] = on ? bb.serial : -1;
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

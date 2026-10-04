import * as THREE from 'three';
import { FIGURE_MODEL } from '../config/assets';
import { FIGURE } from '../config/characters';
import type { HitConfig } from '../config/hits';
import type { DetailLevel } from '../config/render';
import type { Character } from '../sim/character';
import { lerpAngle } from '../sim/vec';
import { buildFigure, createCalloutTexture, disposeFigure, type Figure, figureLeanRoll, setReceiveShadows } from './characterModels';
import { type FigureModel, fadeModelMaterials } from './externalModels';
import { useVertexFinish } from './figureFinish';

interface FigureState {
  figure: Figure;
  /** Per-figure copy of the shared material, so one figure can fade out on its own. */
  material: THREE.MeshStandardMaterial;
  /** Walk-cycle phase (radians), advanced by distance walked. */
  phase: number;
  lastX: number;
  lastZ: number;
  /** Seconds since this figure was last hit (flinch), and the BB's flight direction then (world x/z). */
  flinchAge: number;
  flinchX: number;
  flinchZ: number;
}

/**
 * Upper-body lean (radians about the figure's local X and Z) for a flinch of `amount` from a BB flying
 * along world (dirX, dirZ), for a figure turned by `yaw` (it faces -Z locally): the body is pushed the
 * way the BB was going. Writes into `out`.
 */
export function flinchLean(dirX: number, dirZ: number, yaw: number, amount: number, out: { x: number; z: number }): { x: number; z: number } {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const localX = dirX * cy - dirZ * sy;
  const localZ = dirX * sy + dirZ * cy;
  // +X rotation tips the top towards +Z (backwards); +Z rotation tips it towards -X.
  out.x = localZ * amount;
  out.z = -localX * amount;
  return out;
}

/** Flinch strength (0..1) `t` seconds after a hit: a quick snap, then easing back. */
export function flinchEnvelope(t: number): number {
  const F = FIGURE.flinch;
  if (t >= F.time) return 0;
  if (t < F.rise) return t / F.rise;
  const k = 1 - (t - F.rise) / (F.time - F.rise);
  return k * k;
}

/**
 * Sizes a figure's HIT! sign for a camera `distance` metres away (FA8): its own size up to FIGURE.callout.stableFrom,
 * growing with the distance beyond, so it is as big on screen at 30 m as at 6 m; it rises as it grows, so its bottom edge
 * stays above the head.
 */
export function placeCallout(callout: THREE.Object3D, distance: number): void {
  const C = FIGURE.callout;
  const k = Math.max(1, distance / C.stableFrom);
  const h = C.width * C.aspect;
  callout.scale.set(C.width * k, h * k, 1);
  callout.position.y = C.height + ((k - 1) * h) / 2;
}

/** True if `c`'s active replica is a pistol (the figure holds it out in both hands; BBs and gas leave its muzzle). */
export function holdsPistol(c: Character): boolean {
  return c.armament.replicas[c.armament.active]?.look.model === 'pistol';
}

/**
 * Draws every character as a third-person figure, interpolated between ticks: walk cycle, crouch,
 * aim pitch, and the hit-calling look (hand up, replica down, "HIT!" sign while calling).
 * Reads simulation state only.
 */
export class CharacterRenderer {
  readonly object = new THREE.Group();
  private readonly material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: FIGURE.roughness, metalness: 0 });
  private readonly calloutTexture = createCalloutTexture();
  private readonly calloutMaterial = new THREE.SpriteMaterial({ map: this.calloutTexture, transparent: true });
  private readonly figures: FigureState[] = [];
  private readonly lean = { x: 0, z: 0 };
  private receiveShadows = false;

  constructor(
    private readonly characters: readonly Character[],
    private readonly teamColors: readonly number[],
    private readonly hits: HitConfig,
    /** A figure model (M25a, render/externalModels.ts), or null for the built-in figures. The renderer doesn't own it. */
    private readonly model: FigureModel | null = null,
    /** Player detail (QualitySettings.figureDetail, FA8); setDetail changes it. */
    private detail: DetailLevel = 'low',
  ) {
    for (const c of characters) {
      const { figure, material } = this.build(c);
      this.figures.push({ figure, material, phase: 0, lastX: c.position.x, lastZ: c.position.z, flinchAge: FIGURE.flinch.time, flinchX: 0, flinchZ: 0 });
    }
  }

  /** Figures shaded by walls and containers, or lit as if in full sun (QualitySettings.figureShadows, REN-07). */
  setReceiveShadows(on: boolean): void {
    this.receiveShadows = on;
    setReceiveShadows(this.object, on);
  }

  /**
   * Player detail (QualitySettings.figureDetail, FA8): every figure is built again at the new level (a few milliseconds
   * for six), keeping its walk phase and flinch. Nothing happens if the level is unchanged.
   */
  setDetail(level: DetailLevel): void {
    if (level === this.detail) return;
    this.detail = level;
    for (let i = 0; i < this.characters.length; i++) {
      const s = this.figures[i]!;
      disposeFigure(s.figure);
      s.material.dispose();
      const { figure, material } = this.build(this.characters[i]!);
      s.figure = figure;
      s.material = material;
    }
    setReceiveShadows(this.object, this.receiveShadows);
  }

  /** One character's figure at the current detail, added to the scene, with its own copy of the material. */
  private build(c: Character): { figure: Figure; material: THREE.MeshStandardMaterial } {
    const high = this.detail === 'high';
    // The detailed figure reads each vertex's roughness and metalness (glossy goggles and shells, steel barrels).
    const material = high ? useVertexFinish(this.material.clone()) : this.material.clone();
    const figure = buildFigure(this.teamColors[c.team] ?? 0xffffff, material, this.calloutMaterial, c.id, this.model, FIGURE.detail[this.detail]);
    this.object.add(figure.root);
    return { figure, material };
  }

  /** Character `id` was hit by a BB flying along `direction`: its figure flinches. */
  flinch(id: number, direction: { x: number; z: number }): void {
    const i = this.characters.findIndex((c) => c.id === id);
    const s = this.figures[i];
    if (!s) return;
    const len = Math.hypot(direction.x, direction.z) || 1;
    s.flinchAge = 0;
    s.flinchX = direction.x / len;
    s.flinchZ = direction.z / len;
  }

  /**
   * `alpha` interpolates ticks; `dt` is the frame time; `hiddenId` is the character the camera is
   * inside (drawn in first person instead), or -1. `eye`: where the camera is, so a far HIT! sign keeps its size on screen.
   */
  update(alpha: number, dt: number, hiddenId: number, eye?: { x: number; y: number; z: number }): void {
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i]!;
      const s = this.figures[i]!;
      const f = s.figure;
      f.root.visible = c.id !== hiddenId;
      if (!f.root.visible) continue;

      const x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha;
      const y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha;
      const z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha;
      f.root.position.set(x, y, z);
      const yaw = lerpAngle(c.prevYaw, c.yaw, alpha);
      f.root.rotation.y = yaw;

      // Flinch: lean the upper body the way the BB was going, in the figure's own frame (it faces -Z).
      s.flinchAge += dt;
      const lean = flinchLean(s.flinchX, s.flinchZ, yaw, flinchEnvelope(s.flinchAge) * FIGURE.flinch.lean, this.lean);
      // Leaning (peeking): the upper body tilts about the hips, exactly as the hit volume does.
      const leaning = c.prevLean + (c.lean - c.prevLean) * alpha;
      f.upper.rotation.set(lean.x, 0, lean.z + figureLeanRoll(leaning, this.hits));

      // Walk cycle from distance actually covered (teleports into the dead zone don't count).
      const moved = Math.hypot(x - s.lastX, z - s.lastZ);
      s.lastX = x;
      s.lastZ = z;
      if (moved < FIGURE.maxStride) s.phase += moved * FIGURE.stridesPerMetre * Math.PI * 2;
      const walking = Math.hypot(c.velocity.x, c.velocity.z) > FIGURE.walkingSpeed;
      const swing = walking ? Math.sin(s.phase) * FIGURE.legSwing : 0;

      const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
      const hip = FIGURE.hipHeight - crouch * FIGURE.crouchDrop;
      f.upper.position.y = hip;
      f.legL.position.y = hip;
      f.legR.position.y = hip;
      const legScale = hip / FIGURE.hipHeight;
      f.legL.scale.y = legScale;
      f.legR.scale.y = legScale;
      f.legL.rotation.x = swing;
      f.legR.rotation.x = -swing;
      // A model drawn whole has no hips to bend: it sinks as far as the head does.
      if (f.whole) f.whole.scale.y = 1 - (crouch * FIGURE.crouchDrop) / FIGURE_MODEL.height;

      // In play: aiming. Calling / walking off: hand up. Out in the dead zone: replica pointed at the ground.
      const handUp = c.status === 'calling' || c.status === 'walkingOff' || c.status === 'leaving';
      f.aim.visible = !handUp;
      const pistol = holdsPistol(c);
      f.aimRifle.visible = !pistol;
      f.aimPistol.visible = pistol;
      f.aim.rotation.x = c.status === 'out' ? FIGURE.outAimPitch : c.prevPitch + (c.pitch - c.prevPitch) * alpha;
      f.hitPose.visible = handUp;
      f.callout.visible = c.status === 'calling';
      if (f.callout.visible && eye) placeCallout(f.callout, Math.hypot(x - eye.x, y + FIGURE.callout.height - eye.y, z - eye.z));

      // A walk-off that couldn't finish leaves the field: the figure fades out where it stands (the sim
      // then puts it in the dead zone) instead of visibly jumping there.
      const opacity = c.status === 'leaving' ? Math.min(1, Math.max(0, 1 - c.statusTime / this.hits.vanishTime)) : 1;
      if (opacity !== s.material.opacity) {
        const fading = opacity < 1;
        const changed = s.material.transparent !== fading;
        s.material.opacity = opacity;
        if (changed) {
          s.material.transparent = fading;
          s.material.needsUpdate = true;
        }
        fadeModelMaterials(f.modelMaterials, opacity, changed);
        if (changed) {
          // Shadow maps ignore opacity: a fading figure would leave a solid shadow behind.
          f.root.traverse((o) => {
            if (o instanceof THREE.Mesh) o.castShadow = !fading;
          });
        }
      }
    }
  }

  dispose(): void {
    for (const s of this.figures) {
      disposeFigure(s.figure);
      s.material.dispose();
    }
    this.material.dispose();
    this.calloutMaterial.dispose();
    this.calloutTexture.dispose();
    this.object.removeFromParent();
  }
}

import * as THREE from 'three';
import { FIGURE_MODEL } from '../../config/assets';
import { FIGURE } from '../../config/characters';
import { BAKED_LIGHT } from '../../config/bake';
import type { HitConfig } from '../../config/hits';
import type { OpticId } from '../../config/optics';
import type { DetailLevel } from '../../config/render';
import type { Character } from '../../sim/character';
import { legSwing } from '../../sim/hitbox';
import { length3, lerpAngle } from '../../sim/vec';
import { BARE_KIT, buildFigure, createCalloutTexture, disposeFigure, type Figure, type FigureKit, figureLeanRoll, figureLooks, setReceiveShadows } from './characterModels';
import { type FigureModel, fadeModelMaterials } from './externalModels';
import { useVertexFinish } from './figureFinish';
import { type FigureCrowd, figureDress, HUMAN_CROWD } from './figureMix';
import type { FigureRigs } from './figureRig';
import type { RiggedFigure, RiggedFrame } from './riggedFigure';
import type { ThrownMagazines } from './thrownMagazines';
import { NO_REPLICA_FILES, type ReplicaFiles } from '../replicas/replicaFiles';
import { type ProbeGrid, type ProbeSample, probeTint, sampleProbes } from '../light/probeGrid';

interface FigureState {
  /** The built-in figure, or null when it is drawn as a rigged one (BF1). */
  figure: Figure | null;
  /** The rigged figure (BF1, render/figures/riggedFigure.ts) it is drawn as, or null when the figure files couldn't be loaded. */
  rigged: RiggedFigure | null;
  /** Per-figure copy of the shared material, so one figure can fade out on its own. */
  material: THREE.MeshStandardMaterial;
  /** Seconds since this figure was last hit (flinch), and the BB's flight direction then (world x/z). */
  flinchAge: number;
  flinchX: number;
  flinchZ: number;
  /** Its rifle had a silencer fitted when it was built (shown on Player detail `high`). */
  silencer: boolean;
  /** Its rifle and its pistol had a weapon torch fitted when it was built (M33h; shown at every detail). */
  rifleTorch: boolean;
  pistolTorch: boolean;
  /** The optic on its rifle when it was built (BG1; shown at every detail), or null. */
  rifleOptic: OpticId | null;
  /** The glow it was last given from others' torch beams (M33h; setTorchLift), so an unchanged one isn't set again. */
  lift: number;
  /** The baked bounce light on it where it stands (G6; setBakedLight), added to the torch glow. */
  bounce: THREE.Color;
  /** The draw under way (or the next) comes out of the holster (M92): the slung pose, then the aim rising from low. */
  fromHolster: boolean;
  /** A rigged figure's replicas and fitted parts when it was built (riggedKit), and the loadout's entries they came from. */
  kit: string;
  kitSeen: unknown[];
}

/** Scratch for a fading rigged figure's materials (no allocation per frame). */
const fading: THREE.Material[] = [];

/** Scratch for the figures' baked light (no allocation per frame). */
const probeSample: ProbeSample = { r: 0, g: 0, b: 0, vis: 1 };
const probeShade = { r: 1, g: 1, b: 1 };
const glowScratch = new THREE.Color();

/** True if `c` carries a replica of the kind (`pistol` or not) with a weapon torch fitted (M33h). */
export function torchFitted(c: Character, pistol: boolean): boolean {
  const a = c.armament;
  for (let i = 0; i < a.replicas.length; i++) if ((a.replicas[i]!.look.model === 'pistol') === pistol && a.parts[i]?.light) return true;
  return false;
}

/**
 * What a rigged figure's replicas are built from (BF1): each replica and its fitted optic, grip, laser, barrel (BG1),
 * muzzle device, torch and magazine, which it shows at every detail. Called only when the loadout's entries changed
 * (fitParts and fitOptics between rounds).
 */
export function riggedKit(c: Character): string {
  const a = c.armament;
  return a.replicas
    .map((r, i) => {
      const p = a.parts[i];
      return `${r.id}/${a.optics[i] ?? ''}/${p?.grip ?? ''}/${p?.laser ?? ''}/${p?.barrel ?? ''}/${p?.muzzle ?? ''}/${p?.light ?? ''}/${p?.magazine ?? ''}`;
    })
    .join(' ');
}

/** True when `c`'s replicas, fitted parts or optics aren't the entries in `seen` (which then become them): no allocation. */
function kitChanged(c: Character, seen: unknown[]): boolean {
  const a = c.armament;
  const n = a.replicas.length;
  let changed = seen.length !== n * 3;
  for (let i = 0; i < n && !changed; i++) changed = seen[i * 3] !== a.replicas[i] || seen[i * 3 + 1] !== a.parts[i] || seen[i * 3 + 2] !== a.optics[i];
  if (!changed) return false;
  seen.length = n * 3;
  for (let i = 0; i < n; i++) {
    seen[i * 3] = a.replicas[i];
    seen[i * 3 + 1] = a.parts[i];
    seen[i * 3 + 2] = a.optics[i];
  }
  return true;
}

/** The optic fitted to `c`'s rifle (not a pistol), or null (BG1): its figure shows it. */
export function rifleOptic(c: Character): OpticId | null {
  const a = c.armament;
  for (let i = 0; i < a.replicas.length; i++) if (a.replicas[i]!.look.model !== 'pistol' && a.optics[i]) return a.optics[i]!;
  return null;
}

/** True if `c` carries a rifle (not a pistol) with a silencer fitted (M29b): the detailed figure shows it. */
export function rifleSilenced(c: Character): boolean {
  const a = c.armament;
  for (let i = 0; i < a.replicas.length; i++) if (a.replicas[i]!.look.model !== 'pistol' && a.parts[i]?.muzzle === 'silencer') return true;
  return false;
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
  /** The map's baked light the figures read as they move (G6), or null; and the torch beams' colour (setTorchLift). */
  private probes: ProbeGrid | null = null;
  private readonly torchColour = new THREE.Color();
  /** The empty magazines rigged figures throw away (BF1), with the rigs only. */
  private readonly thrown: ThrownMagazines | null;
  private readonly frame: RiggedFrame = { alpha: 0, dt: 0, eyeX: 0, eyeY: 0, eyeZ: 0, firstPerson: false, viewLow: -Math.PI / 2, leanX: 0, leanZ: 0, peek: 0, peekPivot: 0, cycle: null, castShadow: true };

  constructor(
    private readonly characters: readonly Character[],
    private readonly teamColors: readonly number[],
    private readonly hits: HitConfig,
    /** A figure model (M25a, render/figures/externalModels.ts), or null for the built-in figures. The renderer doesn't own it. */
    private readonly model: FigureModel | null = null,
    /** Player detail (QualitySettings.figureDetail, FA8); setDetail changes it. */
    private detail: DetailLevel = 'low',
    /** Which figures are robots this match and whether replicas are in Realistic colours (G7, Settings › Look). */
    private readonly crowd: FigureCrowd = HUMAN_CROWD,
    /** Replica models from files (M101, render/replicas/replicaFiles.ts), owned by the renderer: a pistol with one shows its shape. */
    private readonly files: ReplicaFiles = NO_REPLICA_FILES,
    /**
     * The rigged human and robot figures (BF1, render/figures/figureRig.ts), owned by the renderer (ModelFiles frees them), or
     * null: with them every player is drawn rigged (the player's own figure as their first-person body), ahead of the
     * figure model.
     */
    private readonly rigs: FigureRigs | null = null,
    /** The share of its colour the rigged figures' team paint glows at (TeamColours.paintGlow, AX1). */
    private readonly paintGlow = 0,
  ) {
    this.thrown = rigs?.thrownMagazines() ?? null;
    if (this.thrown) this.object.add(this.thrown.object);
    for (let i = 0; i < characters.length; i++) {
      const c = characters[i]!;
      const silencer = rifleSilenced(c);
      const rifleTorch = torchFitted(c, false);
      const pistolTorch = torchFitted(c, true);
      const optic = rifleOptic(c);
      const { figure, rigged, material } = this.build(i, { rifleSilencer: silencer, rifleTorch, pistolTorch, rifleOptic: optic });
      this.figures.push({ figure, rigged, material, flinchAge: FIGURE.flinch.time, flinchX: 0, flinchZ: 0, silencer, rifleTorch, pistolTorch, rifleOptic: optic, lift: 0, bounce: new THREE.Color(0, 0, 0), fromHolster: false, kit: riggedKit(c), kitSeen: [] });
      kitChanged(c, this.figures[i]!.kitSeen);
    }
  }

  /**
   * Where `c`'s replica muzzle is drawn on their rigged figure (BP4), into `out`; false for a built-in figure or no
   * replica in the hand (figureMuzzle places theirs).
   */
  riggedMuzzle(c: Character, out: THREE.Vector3): boolean {
    if (!this.rigs) return false;
    const i = this.characters.indexOf(c);
    return this.figures[i]?.rigged?.muzzleWorld(holdsPistol(c), out) ?? false;
  }

  /** A new round: the magazines thrown in the last one are cleared away with the field. */
  roundStarted(): void {
    this.thrown?.clear();
  }

  /** Character `id` fired: a rigged figure's trigger finger presses (BF1; the built-in figures don't show it). */
  fired(id: number): void {
    if (!this.rigs) return;
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i]!;
      if (c.id === id) return this.figures[i]?.rigged?.shot(holdsPistol(c));
    }
  }

  /** Figures shaded by walls and containers, or lit as if in full sun (QualitySettings.figureShadows, REN-07). */
  setReceiveShadows(on: boolean): void {
    this.receiveShadows = on;
    setReceiveShadows(this.object, on);
    for (const s of this.figures) s.rigged?.setReceiveShadows(on);
  }

  /**
   * Player detail (QualitySettings.figureDetail, FA8): every figure is built again at the new level (a few milliseconds
   * for six), keeping its flinch. Nothing happens if the level is unchanged.
   */
  setDetail(level: DetailLevel): void {
    if (level === this.detail) return;
    this.detail = level;
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i]!;
      this.rebuild(i, rifleSilenced(c), torchFitted(c, false), torchFitted(c, true), rifleOptic(c));
    }
    setReceiveShadows(this.object, this.receiveShadows);
    for (const s of this.figures) s.rigged?.setReceiveShadows(this.receiveShadows);
  }

  /**
   * Others' torch beams on the figures (M33h, render/light/torchBeams.ts `lit`, by character index): each glows `lit` of
   * `colour`, an emissive uniform (no new shader). Changed only where it changed.
   */
  setTorchLift(lit: Float32Array, colour: number): void {
    this.torchColour.setHex(colour);
    for (let i = 0; i < this.figures.length; i++) {
      const s = this.figures[i]!;
      const k = lit[i] ?? 0;
      if (Math.abs(k - s.lift) < 1e-3) continue;
      s.lift = k;
      this.glow(s);
    }
  }

  /**
   * The map's baked bounce light on the figures (G6, render/light/bakedLight.ts), or null for none: each frame a figure reads
   * the probes round its chest, dims under cover as the map's surfaces do and takes the bounce as a faint glow (its
   * material's colour and emissive: no new shader). The figure model's own materials (M25a) are left as they are.
   */
  setBakedLight(grid: ProbeGrid | null): void {
    this.probes = grid;
    if (grid) return;
    for (const s of this.figures) {
      s.material.color.setRGB(1, 1, 1);
      s.bounce.setRGB(0, 0, 0);
      this.glow(s);
    }
  }

  /** A figure's glow: the torch beams on it plus the bounce light (a rigged figure's own materials take it too). */
  private glow(s: FigureState): void {
    s.material.emissive.copy(this.torchColour).multiplyScalar(s.lift).add(s.bounce);
    s.rigged?.light(s.material.color.r, s.material.color.g, s.material.color.b, glowScratch.copy(s.material.emissive));
  }

  /** A figure standing at (x, y, z) under the baked light: its colour scaled, its bounce glow set. */
  private bakedLight(s: FigureState, grid: ProbeGrid, x: number, y: number, z: number): void {
    const F = BAKED_LIGHT.look.figure;
    sampleProbes(grid, x, y + F.height, z, probeSample);
    probeTint(probeSample, F.indirectShare, 0, probeShade);
    s.material.color.setRGB(probeShade.r, probeShade.g, probeShade.b);
    s.bounce.setRGB(probeSample.r * F.bounce, probeSample.g * F.bounce, probeSample.b * F.bounce);
    this.glow(s);
  }

  /** Figure `i` built again at the current detail with the parts it shows, keeping its walk and flinch. */
  private rebuild(i: number, silencer: boolean, rifleTorch: boolean, pistolTorch: boolean, optic: OpticId | null): void {
    const s = this.figures[i]!;
    if (s.figure) disposeFigure(s.figure);
    s.rigged?.dispose();
    s.material.dispose();
    const { figure, rigged, material } = this.build(i, { rifleSilencer: silencer, rifleTorch, pistolTorch, rifleOptic: optic });
    s.figure = figure;
    s.rigged = rigged;
    s.material = material;
    const c = this.characters[i]!;
    s.kit = riggedKit(c);
    kitChanged(c, s.kitSeen);
    s.silencer = silencer;
    s.rifleTorch = rifleTorch;
    s.pistolTorch = pistolTorch;
    s.rifleOptic = optic;
    s.lift = 0;
  }

  /**
   * Character `i`'s figure at the current detail, added to the scene, with its own copy of the material: a human or a
   * robot as the crowd says, its replicas in its team's colours.
   */
  private build(i: number, parts: FigureKit): { figure: Figure | null; rigged: RiggedFigure | null; material: THREE.MeshStandardMaterial } {
    const c = this.characters[i]!;
    const high = this.detail === 'high';
    // The detailed figure reads each vertex's roughness and metalness (glossy goggles and shells, steel barrels).
    const material = high ? useVertexFinish(this.material.clone()) : this.material.clone();
    // A silencer shows on the detailed figure only (as before M33h); a torch and an optic (BG1) at every detail.
    const kit: FigureKit = parts.rifleSilencer || parts.rifleTorch || parts.pistolTorch || parts.rifleOptic ? parts : BARE_KIT;
    const dress = figureDress(this.crowd, i, c.team, c.armament.replicas, this.files);
    const team = this.teamColors[c.team] ?? 0xffffff;
    if (this.rigs && this.thrown) {
      // The rigged figure: the replicas' own models in the fist, fitted parts and all.
      material.userData.authored = { opacity: 1, transparent: false };
      const look = figureLooks(c.id);
      const rigged = this.rigs.figure({
        rig: dress.robot ? this.rigs.robot : this.rigs.human,
        character: c,
        id: c.id,
        teamColour: team,
        paintGlow: this.paintGlow,
        replicaMaterial: material,
        rifleColours: dress.rifle,
        pistolColours: dress.pistol,
        files: this.files,
        detail: this.detail,
        pack: look.pack,
        radio: look.radio,
        thrown: this.thrown,
        calloutMaterial: this.calloutMaterial,
      });
      rigged.setReceiveShadows(this.receiveShadows);
      this.object.add(rigged.root);
      return { figure: null, rigged, material };
    }
    const figure = buildFigure(team, material, this.calloutMaterial, c.id, this.model, FIGURE.detail[this.detail], kit, dress);
    this.object.add(figure.root);
    return { figure, rigged: null, material };
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
   * `viewLow`: the angle of the bottom of the view below level; your own rigged body is drawn only looking down (BD1).
   */
  update(alpha: number, dt: number, hiddenId: number, eye?: { x: number; y: number; z: number }, viewLow = -Math.PI / 2): void {
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i]!;
      const s = this.figures[i]!;
      // Parts are fitted between rounds (fitParts): a figure whose replicas gained or lost a part it shows is rebuilt (a
      // silencer on the detailed figure only, a torch and an optic at every detail, M33h, BG1).
      const silencer = this.detail === 'high' ? rifleSilenced(c) : s.silencer;
      const rifleTorch = torchFitted(c, false);
      const pistolTorch = torchFitted(c, true);
      const optic = rifleOptic(c);
      if (silencer !== s.silencer || rifleTorch !== s.rifleTorch || pistolTorch !== s.pistolTorch || optic !== s.rifleOptic) {
        this.rebuild(i, silencer, rifleTorch, pistolTorch, optic);
        if (s.figure) setReceiveShadows(s.figure.root, this.receiveShadows);
      }
      if (s.rigged && kitChanged(c, s.kitSeen)) {
        const kit = riggedKit(c);
        if (kit !== s.kit) {
          s.kit = kit;
          this.rebuild(i, silencer, rifleTorch, pistolTorch, optic);
        }
      }
      if (s.rigged) {
        this.updateRigged(c, s, s.rigged, alpha, dt, hiddenId, eye, viewLow);
        continue;
      }
      const f = s.figure!;
      f.root.visible = c.id !== hiddenId;
      if (!f.root.visible) continue;

      const x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha;
      const y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha;
      const z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha;
      f.root.position.set(x, y, z);
      const yaw = lerpAngle(c.prevYaw, c.yaw, alpha);
      f.root.rotation.y = yaw;
      if (this.probes) this.bakedLight(s, this.probes, x, y, z);

      // Flinch: lean the upper body the way the BB was going, in the figure's own frame (it faces -Z).
      s.flinchAge += dt;
      const lean = flinchLean(s.flinchX, s.flinchZ, yaw, flinchEnvelope(s.flinchAge) * FIGURE.flinch.lean, this.lean);
      // Leaning (peeking): the upper body tilts about the hips, exactly as the hit volume does.
      const leaning = c.prevLean + (c.lean - c.prevLean) * alpha;
      f.upper.rotation.set(lean.x, 0, lean.z + figureLeanRoll(leaning, this.hits));

      // The simulation's walk cycle (M85): the legs swing exactly as their hit volumes do.
      const swing = legSwing(c.prevWalkCycle + (c.walkCycle - c.prevWalkCycle) * alpha, c, this.hits);

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

      // In play: aiming, or holstered (M92): the rifle slung, then out of the holster the aim rising from low over the
      // second part of the draw. Calling / walking off: hand up. Out in the dead zone: replica pointed at the ground.
      const handUp = c.status === 'calling' || c.status === 'walkingOff' || c.status === 'leaving';
      const arm = c.armament;
      if (arm.holstered) s.fromHolster = true;
      else if (arm.draw <= 0) s.fromHolster = false;
      const H = FIGURE.holster;
      const drawn = arm.holstered ? 0 : s.fromHolster && arm.drawTotal > 0 ? 1 - arm.draw / arm.drawTotal : 1;
      const slung = !handUp && drawn < H.swapAt;
      f.holsterPose.visible = slung;
      f.aim.visible = !handUp && !slung;
      const pistol = holdsPistol(c);
      f.aimRifle.visible = !pistol;
      f.aimPistol.visible = pistol;
      const pitch = c.prevPitch + (c.pitch - c.prevPitch) * alpha;
      const rise = THREE.MathUtils.smoothstep(drawn, H.swapAt, 1);
      f.aim.rotation.x = c.status === 'out' ? FIGURE.outAimPitch : H.drawPitch + (pitch - H.drawPitch) * rise;
      f.hitPose.visible = handUp;
      f.callout.visible = c.status === 'calling';
      if (f.callout.visible && eye) placeCallout(f.callout, length3(x - eye.x, y + FIGURE.callout.height - eye.y, z - eye.z));

      // A walk-off that couldn't finish leaves the field: the figure fades out where it stands (the sim
      // then puts it in the dead zone) instead of visibly jumping there.
      const opacity = this.opacity(c);
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

  /** A figure's opacity: one that leaves the field fades out where it stands. */
  private opacity(c: Character): number {
    return c.status === 'leaving' ? Math.min(1, Math.max(0, 1 - c.statusTime / this.hits.vanishTime)) : 1;
  }

  /**
   * A rigged figure's frame (BF1): placed, posed and faded as the built-in one is; your own (the camera's, `hiddenId`)
   * is drawn as your first-person body. The thrown magazines fly on with the first figure.
   */
  private updateRigged(c: Character, s: FigureState, r: RiggedFigure, alpha: number, dt: number, hiddenId: number, eye: { x: number; y: number; z: number } | undefined, viewLow: number): void {
    if (s === this.figures[0]) this.thrown?.update(dt);
    const x = c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha;
    const y = c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha;
    const z = c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha;
    if (this.probes) this.bakedLight(s, this.probes, x, y, z);
    s.flinchAge += dt;
    const yaw = lerpAngle(c.prevYaw, c.yaw, alpha);
    const lean = flinchLean(s.flinchX, s.flinchZ, yaw, flinchEnvelope(s.flinchAge) * FIGURE.flinch.lean, this.lean);
    const leaning = c.prevLean + (c.lean - c.prevLean) * alpha;
    const opacity = this.opacity(c);
    const f = this.frame;
    f.alpha = alpha;
    f.dt = dt;
    f.eyeX = eye ? eye.x : x;
    f.eyeY = eye ? eye.y : y + 1;
    f.eyeZ = eye ? eye.z : z;
    f.firstPerson = c.id === hiddenId;
    f.viewLow = viewLow;
    f.peek = figureLeanRoll(leaning, this.hits);
    f.leanX = lean.x;
    f.leanZ = lean.z + f.peek;
    f.peekPivot = this.hits.lean.pivotHeight - (c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha) * this.hits.crouchDrop;
    // With the figures' own legs in the hit volume (IM8), the legs step at the simulation's walk cycle.
    f.cycle = this.hits.figureLegs ? (c.prevWalkCycle + (c.walkCycle - c.prevWalkCycle) * alpha) / (Math.PI * 2) : null;
    // Shadow maps ignore opacity: a fading figure would leave a solid shadow behind.
    f.castShadow = opacity >= 1;
    r.update(c, f);
    r.callout.visible = c.status === 'calling' && !f.firstPerson;
    if (r.callout.visible && eye) placeCallout(r.callout, length3(x - eye.x, y + FIGURE.callout.height - eye.y, z - eye.z));
    if (opacity !== s.material.opacity) {
      const switched = s.material.transparent !== opacity < 1;
      fading.length = 0;
      fading.push(s.material);
      for (const m of r.materials) fading.push(m);
      fadeModelMaterials(fading, opacity, switched);
    }
  }

  dispose(): void {
    for (const s of this.figures) {
      if (s.figure) disposeFigure(s.figure);
      s.rigged?.dispose();
      s.material.dispose();
    }
    this.thrown?.dispose();
    this.material.dispose();
    this.calloutMaterial.dispose();
    this.calloutTexture.dispose();
    this.object.removeFromParent();
  }
}

import * as THREE from 'three';
import type { HitConfig } from '../config/hits';
import type { BodyConfig } from '../config/movement';
import { type LightingPreset, type QualitySettings, TORCH_BEAMS } from '../config/render';
import { TORCHES } from '../config/torches';
import type { SurfaceHit, WorldQuery } from '../sim/armament';
import { type Character, eyeHeight } from '../sim/character';
import { isInPlay } from '../sim/elimination';
import { hitTop } from '../sim/hitbox';
import { lightInHand, torchLit } from '../sim/torch';
import { lerpAngle, vec3 } from '../sim/vec';
import { withoutEnvironment } from './surfaceMaterials';

/**
 * Weapon torches drawn (M33h), on any map whose lighting preset has a `torch.beam` above 0 (the night); the day builds
 * nothing. Everyone's lit torch but your own is three instanced draws for the whole match, with no real light: a cone
 * fading along the beam, a glare at the lens that grows as it points at the camera (depth tested, so walls hide it: this
 * is what gives the holder away), and a lit disc where the beam lands (a ray cast per lit torch per frame, along the
 * level's own ray). Your own torch on Medium and High is one real spot light, made with the match and only turned up
 * and down, so no shader is ever rebuilt by a switch; it takes one of the night lights (`reserved`), so the scene's
 * real light count is the quality's, torch or not. On Low your own torch draws a glow ahead and its lit disc. A figure
 * inside someone's beam, where no real light reaches it, glows a little (`lit`, read by the figures). Unlit, unfogged
 * and off the environment map, as the light pools are (M33f). Allocation-free per frame.
 */

/** Whether any character carries a light on any replica: a match without one builds nothing for torches. */
export function carriesTorch(characters: readonly Character[]): boolean {
  return characters.some((c) => c.armament.parts.some((p) => !!p.light));
}

/** Whether the match's own torch is a real spot light at `quality`: a night preset, someone carries a torch, Medium or High. */
export function torchSpotWanted(preset: LightingPreset, quality: Pick<QualitySettings, 'poolLights'>, armed: boolean): boolean {
  return armed && preset.torch.beam > 0 && quality.poolLights > 0;
}

/** A unit cone along -Z, its tip at the origin and its open end a unit circle at z = -1, fading along its length. */
export function buildConeGeometry(segments: number = TORCH_BEAMS.coneSegments, fadeIn: number = TORCH_BEAMS.coneFadeIn): THREE.BufferGeometry {
  const rings = 6;
  const pos: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    // In over the first `fadeIn`, then out to nothing at the end.
    const k = Math.min(1, t / Math.max(1e-6, fadeIn)) * (1 - t) * (1 - t);
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * t, Math.sin(a) * t, -t);
      col.push(k, k, k);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * (segments + 1) + s;
      const b = a + segments + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

/** A unit disc facing +Z, bright in the middle and fading to nothing at its rim (a glare, a lit spot). */
export function buildSoftDisc(segments: number = TORCH_BEAMS.spotSegments): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const col: number[] = [1, 1, 1];
  const index: number[] = [];
  const rings = 3;
  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    const k = (1 - t * t) * (1 - t * t);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * t, Math.sin(a) * t, 0);
      col.push(k, k, k);
    }
  }
  for (let s = 0; s < segments; s++) index.push(0, 1 + s, 1 + ((s + 1) % segments));
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a0 = 1 + (r - 1) * segments + s;
      const a1 = 1 + (r - 1) * segments + ((s + 1) % segments);
      index.push(a0, a0 + segments, a1, a1, a0 + segments, a1 + segments);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}

/** An additive, unlit, unfogged material writing no depth, off the environment map (a light, not a surface). */
function lightMaterial(side: THREE.Side): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side });
  m.fog = false;
  return withoutEnvironment(m);
}

/** An instanced draw for up to `capacity` torches, drawing none until update fills it (no draw call at count 0). */
function instanced(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.count = 0;
  // Instances are spread over the field: the mesh's own bounds mean nothing.
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new THREE.Color(0));
  return mesh;
}

// Per-frame scratch.
const lens = new THREE.Vector3();
const dir = new THREE.Vector3();
const toCam = new THREE.Vector3();
const toFig = new THREE.Vector3();
const at = new THREE.Vector3();
const scale = new THREE.Vector3();
const quat = new THREE.Quaternion();
const matrix = new THREE.Matrix4();
const colour = new THREE.Color();
const FORWARD = new THREE.Vector3(0, 0, -1);
const FACING = new THREE.Vector3(0, 0, 1);
const rayFrom = vec3();
const rayDir = vec3();
const surface: SurfaceHit = { normal: vec3(), material: 'concrete' };
const normal = new THREE.Vector3();

export class TorchBeams {
  /** The beams' draws and the spot light: add to the scene once. Empty when the preset or the match has no torches. */
  readonly object = new THREE.Group();
  /** By character index: how much a figure glows from others' beams (0..1), where no real light reaches it. */
  readonly lit: Float32Array;
  /** Whether anything was built (a night preset, and someone carries a torch). */
  readonly active: boolean;
  private readonly cones: THREE.InstancedMesh | null = null;
  private readonly glare: THREE.InstancedMesh | null = null;
  private readonly spots: THREE.InstancedMesh | null = null;
  private spot: THREE.SpotLight | null = null;
  private readonly tint = new THREE.Color();

  constructor(
    private readonly characters: readonly Character[],
    private readonly preset: LightingPreset,
    quality: Pick<QualitySettings, 'poolLights'>,
    private readonly query: WorldQuery,
    private readonly body: BodyConfig,
    private readonly hits: HitConfig,
  ) {
    this.object.name = 'torch-beams';
    this.lit = new Float32Array(characters.length);
    this.active = preset.torch.beam > 0 && carriesTorch(characters);
    if (!this.active) return;
    const capacity = Math.max(1, characters.length);
    this.cones = instanced('torch-cones', buildConeGeometry(), lightMaterial(THREE.DoubleSide), capacity);
    const disc = buildSoftDisc();
    this.glare = instanced('torch-glare', disc, lightMaterial(THREE.FrontSide), capacity);
    // A disc lying on a surface is drawn over it, never into it.
    const spotMaterial = lightMaterial(THREE.FrontSide);
    spotMaterial.polygonOffset = true;
    spotMaterial.polygonOffsetFactor = -1;
    spotMaterial.polygonOffsetUnits = -4;
    this.spots = instanced('torch-spots', disc.clone(), spotMaterial, capacity);
    this.object.add(this.cones, this.glare, this.spots);
    this.setQuality(quality);
  }

  /** Night lights the torch takes from the light pools at the current quality: 1 with a real spot, else 0. */
  get reserved(): number {
    return this.spot ? 1 : 0;
  }

  /** The real spot light on your torch (Medium and High), or null. Exposed for tests and the e2e checks. */
  get spotLight(): THREE.SpotLight | null {
    return this.spot;
  }

  /** The night lights setting (QualitySettings.poolLights): your torch is a real spot light on any but 0 (Low). */
  setQuality(quality: Pick<QualitySettings, 'poolLights'>): void {
    const want = torchSpotWanted(this.preset, quality, this.active);
    if (want === (this.spot !== null)) return;
    if (this.spot) {
      this.object.remove(this.spot, this.spot.target);
      this.spot.dispose();
      this.spot = null;
      return;
    }
    // Every torch in the match is the same kind today: the first fitted one sets the spot's shape and colour.
    const light = TORCHES[this.firstLight()];
    const spot = new THREE.SpotLight(light.colour, 0, light.reach, THREE.MathUtils.degToRad(light.spillDeg / 2), 1 - light.beamDeg / light.spillDeg, TORCH_BEAMS.decay);
    spot.castShadow = false;
    spot.name = 'torch-spot';
    this.object.add(spot, spot.target);
    this.spot = spot;
  }

  private firstLight(): keyof typeof TORCHES {
    for (const c of this.characters) for (const p of c.armament.parts) if (p.light) return p.light;
    return 'weaponTorch';
  }

  /**
   * One frame: every lit torch placed between ticks (`alpha`), seen from `camera`. `viewer` is the character the view
   * belongs to (you, or the player you watch): the real spot follows their torch; `firstPerson`: the camera is their
   * eyes, so their beam leaves from the camera and no cone or glare is drawn (on Low, a soft glow ahead instead).
   */
  update(camera: THREE.Camera, viewer: Character | null, firstPerson: boolean, alpha: number): void {
    this.lit.fill(0);
    if (!this.active) return;
    const T = this.preset.torch;
    const cones = this.cones!;
    const glare = this.glare!;
    const spots = this.spots!;
    let nCones = 0;
    let nGlare = 0;
    let nSpots = 0;
    let spotOn = false;
    const cosGlare = Math.cos(THREE.MathUtils.degToRad(TORCH_BEAMS.glareFromDeg));
    for (let i = 0; i < this.characters.length; i++) {
      const c = this.characters[i]!;
      if (!torchLit(c)) continue;
      const light = TORCHES[lightInHand(c)!];
      const own = c === viewer;
      const eyesOf = own && firstPerson;
      this.pose(c, eyesOf ? camera : null, alpha);
      const tanSpill = Math.tan(THREE.MathUtils.degToRad(light.spillDeg / 2));
      // Where the beam lands (the level's own ray, from the lens).
      rayFrom.x = lens.x;
      rayFrom.y = lens.y;
      rayFrom.z = lens.z;
      rayDir.x = dir.x;
      rayDir.y = dir.y;
      rayDir.z = dir.z;
      const d = this.query.raycastSurface ? this.query.raycastSurface(rayFrom, rayDir, light.reach, surface) : this.query.raycastStatic(rayFrom, rayDir, light.reach);
      const real = own && this.spot !== null;
      if (real) {
        const s = this.spot!;
        s.position.copy(lens);
        s.target.position.copy(lens).add(dir);
        s.target.updateMatrixWorld();
        s.intensity = T.spot;
        spotOn = true;
      }
      colour.setHex(light.colour);
      if (!eyesOf) {
        // The cone, to what it lands on or its share of the reach.
        const length = d >= 0 ? Math.min(d, light.reach * TORCH_BEAMS.coneShare) : light.reach * TORCH_BEAMS.coneShare;
        quat.setFromUnitVectors(FORWARD, dir);
        scale.set(tanSpill * length, tanSpill * length, length);
        cones.setMatrixAt(nCones, matrix.compose(lens, quat, scale));
        cones.setColorAt(nCones++, this.tint.copy(colour).multiplyScalar(T.beam));
        // The glare: brighter and bigger the more the torch points at the camera.
        toCam.copy(camera.position).sub(lens).normalize();
        const k = Math.max(0, (toCam.dot(dir) - cosGlare) / (1 - cosGlare));
        if (k > 0) {
          const size = TORCH_BEAMS.glareSize * (1 + (TORCH_BEAMS.glareGrow - 1) * k * k);
          glare.setMatrixAt(nGlare, matrix.compose(lens, camera.quaternion, scale.set(size, size, size)));
          glare.setColorAt(nGlare++, this.tint.copy(colour).multiplyScalar(T.glare * k));
        }
      } else if (!real) {
        // Your own beam on Low (no real spot), seen from behind the lens: a soft glow in the haze ahead, the beam's width
        // there, so a beam that lands on nothing still shows.
        const ahead = d >= 0 ? Math.min(d, TORCH_BEAMS.hazeAt) : TORCH_BEAMS.hazeAt;
        const size = tanSpill * ahead;
        at.copy(lens).addScaledVector(dir, ahead);
        glare.setMatrixAt(nGlare, matrix.compose(at, camera.quaternion, scale.set(size, size, size)));
        glare.setColorAt(nGlare++, this.tint.copy(colour).multiplyScalar(T.beam * TORCH_BEAMS.hazeGain));
      }
      // The lit disc where it lands: not under your own real spot, which lights the surface itself.
      if (d >= 0 && !real) {
        if (this.query.raycastSurface) normal.set(surface.normal.x, surface.normal.y, surface.normal.z);
        else normal.copy(dir).negate();
        at.copy(lens).addScaledVector(dir, d).addScaledVector(normal, TORCH_BEAMS.spotLift);
        const r = Math.max(TORCH_BEAMS.spotMinSize / 2, d * tanSpill);
        quat.setFromUnitVectors(FACING, normal);
        spots.setMatrixAt(nSpots, matrix.compose(at, quat, scale.set(r, r, r)));
        const fall = 1 - d / light.reach;
        spots.setColorAt(nSpots++, this.tint.copy(colour).multiplyScalar(T.hitSpot * fall * fall));
      }
      // Figures in this beam glow a little, where no real light reaches them.
      if (!real) this.lightFigures(c, tanSpill, light.reach, d);
    }
    if (this.spot && !spotOn) this.spot.intensity = 0;
    this.finish(cones, nCones);
    this.finish(glare, nGlare);
    this.finish(spots, nSpots);
  }

  /** Where `c`'s torch is and points (into `lens` and `dir`): from `eyes` (the camera) when they are the view's. */
  private pose(c: Character, eyes: THREE.Camera | null, alpha: number): void {
    if (eyes) {
      eyes.getWorldDirection(dir);
      lens.copy(eyes.position);
    } else {
      const yaw = lerpAngle(c.prevYaw, c.yaw, alpha);
      const pitch = c.prevPitch + (c.pitch - c.prevPitch) * alpha;
      const cp = Math.cos(pitch);
      dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
      const crouch = c.prevCrouchAmount + (c.crouchAmount - c.prevCrouchAmount) * alpha;
      lens.set(
        c.prevPosition.x + (c.position.x - c.prevPosition.x) * alpha,
        c.prevPosition.y + (c.position.y - c.prevPosition.y) * alpha + eyeHeight(crouch, this.body),
        c.prevPosition.z + (c.position.z - c.prevPosition.z) * alpha,
      );
    }
    lens.addScaledVector(dir, TORCH_BEAMS.lensForward);
    lens.y -= TORCH_BEAMS.lensDown;
  }

  /** Raises `lit` for each figure inside the beam of `holder` (cone, reach, short of where the beam lands). */
  private lightFigures(holder: Character, tanSpill: number, reach: number, landed: number): void {
    const cosSpill = Math.cos(Math.atan(tanSpill));
    const end = landed >= 0 ? landed : reach;
    const lift = this.preset.torch.figureLift;
    for (let j = 0; j < this.characters.length; j++) {
      const f = this.characters[j]!;
      if (f === holder || !isInPlay(f)) continue;
      toFig.set(f.position.x - lens.x, f.position.y + hitTop(f.crouchAmount, this.hits) / 2 - lens.y, f.position.z - lens.z);
      const dist = toFig.length();
      if (dist > end || dist < 1e-6) continue;
      if (toFig.dot(dir) / dist < cosSpill) continue;
      this.lit[j] = Math.max(this.lit[j]!, lift * (1 - dist / reach));
    }
  }

  private finish(mesh: THREE.InstancedMesh, n: number): void {
    mesh.count = n;
    if (n === 0) return;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const mesh of [this.cones, this.glare, this.spots]) {
      if (!mesh) continue;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    }
    this.spot?.dispose();
    this.spot = null;
  }
}

import type * as THREE from 'three';
import type { ShaderWear } from '../config/weathering';
import { carryNodePatch, type PatchUniforms, type SurfaceRecipe } from './nodePatch';

/**
 * The map surfaces' shader additions (G6), carried per material as its node patch (render/nodePatch.ts; drawn by
 * render/webgpu/surfaceNodes.ts on top of Three's own Lambert or Standard model):
 *
 * - **Weathering** (QualitySettings.weathering, the concept's kit.ts): world-space dirt patches, dirt creeping up the
 *   lowest half metre of every wall, streaks running down from the tops and rust on steel. In world space, so it never
 *   repeats with the texture. Its strengths (config/weathering.ts) are uniforms, so every weathered surface shares
 *   one program (a match start compiles at most a few).
 * - **Baked bounce light** (QualitySettings.bakedLight `pixel`, render/bakedLight.ts): after Three's light sum, the
 *   sky fill is scaled by how much of the sky the nearest probes see, and the light bounced off nearby props is added,
 *   one 3D texture read per pixel.
 *
 * Neither changes a vertex, so shadows, collision and what a bot sees are as before. A material with neither carries
 * no patch: Three's own Lambert (Low's).
 */

/** The baked light's uniforms, shared by every surface material of one map build (render/bakedLight.ts makes them). */
export interface ProbeUniforms {
  bakeTex: THREE.IUniform<THREE.Texture | null>;
  bakeMin: THREE.IUniform<THREE.Vector3>;
  bakeSize: THREE.IUniform<THREE.Vector3>;
  /** The texture's RGB times this is the bounce light (the file's encoding scale). */
  bakeScale: THREE.IUniform<number>;
  /** How far the sky fill follows the probes' sky visibility (0 none, 1 fully). */
  bakeOcclusion: THREE.IUniform<number>;
  /** How strong the bounce light is. */
  bakeBounce: THREE.IUniform<number>;
  /** Metres off the surface, along its normal, the probes are read (so a wall doesn't read the probes inside it). */
  bakeLift: THREE.IUniform<number>;
}

/** What a surface material adds to Three's own. */
export interface SurfacePatch {
  /** Weathering on this surface, or null for none. */
  wear: ShaderWear | null;
  /** The map's baked light, read per pixel, or null for none. */
  probes: ProbeUniforms | null;
}

/** The set dressing's junk on a surface patch (render/dressingMeshes.ts): its glow, and the neon signs' flicker channels. */
export interface JunkGlow {
  /** The neon flicker's three channel levels (G9), or null for glow strips that never flicker. */
  flicker: THREE.IUniform<THREE.Vector3> | null;
}

/** The weathering a patch draws, or null for none (a surface weathered at 0 is not weathered). */
function wearOf(p: SurfacePatch): ShaderWear | null {
  return p.wear && (p.wear.grime > 0 || p.wear.rust > 0) ? p.wear : null;
}

/** Whether a patch adds anything to Three's own surface. */
export function patchesShader(p: SurfacePatch): boolean {
  return p.probes !== null || wearOf(p) !== null;
}

/**
 * The recipe and uniforms of a surface patch (and `junk`'s glow on it): the probes' uniforms by reference, the
 * weathering's as the surface's own values. Pure: the tests read what it gives.
 */
export function surfaceNodePatch(p: SurfacePatch, junk: JunkGlow | null = null): { recipe: SurfaceRecipe; uniforms: PatchUniforms } {
  const wear = wearOf(p);
  const uniforms: Record<string, THREE.IUniform> = {};
  if (wear) {
    uniforms.wearGrime = { value: wear.grime };
    uniforms.wearRust = { value: wear.rust };
  }
  if (p.probes) Object.assign(uniforms, p.probes);
  if (junk?.flicker) uniforms.neonFlicker = junk.flicker;
  const recipe: SurfaceRecipe = { wear: wear !== null, probes: p.probes !== null, junk: junk ? (junk.flicker ? 'neon' : 'glow') : null, skyHost: false };
  return { recipe, uniforms };
}

/** Gives a map surface material its patch (and `junk`'s glow on it). Returns the material. */
export function patchSurfaceMaterial<T extends THREE.Material>(material: T, p: SurfacePatch, junk: JunkGlow | null = null): T {
  const { recipe, uniforms } = surfaceNodePatch(p, junk);
  return carryNodePatch(material, { kind: 'surface', recipe }, uniforms);
}

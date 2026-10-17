import type * as THREE from 'three';

/**
 * The node patch a world material carries (WebGPU overhaul W6b): what it draws beyond Three's own node material of its
 * type, and the uniforms that drawing reads. It is set where the material is made: the map surfaces and what rides on
 * them (render/light/surfaceShader.ts: the set dressing's junk and puddles, the sky host), the night sky's stars, the
 * fixtures' flames and embers, the smoke and steam, the torches' soft beam, the fireflies, the dust motes, the figures'
 * per-vertex finish and your sleeves' camo. The node renderer reads it as it builds the material's program and makes
 * the node material that draws it (render/webgpu/worldTwins.ts); the sized points draw as sprites
 * (render/webgpu/pointSprites.ts). Until W6b each was a GLSL patch (`onBeforeCompile`) that the node renderer
 * recognised by its program key (the beam, M91, by its key alone).
 *
 * The material stays a plain Three material, so what sets its colour, maps, opacity or relief works as before. Its
 * program key names its patch, and every material with that key shares one node program: so a patch's numbers are
 * uniforms, read per drawn object from the material it carries (render/webgpu/twinUniforms.ts), never baked into the
 * program.
 */

/** What a surface patch draws: the map surfaces' additions (render/light/surfaceShader.ts) and what rides on them. */
export interface SurfaceRecipe {
  /** World-space weathering (`wearGrime`, `wearRust`). */
  readonly wear: boolean;
  /** The baked light read per pixel (the `bake*` uniforms). */
  readonly probes: boolean;
  /** The junk mesh's glow (`glow` attribute), and the neon flicker channels (`flick`, `neonFlicker`) when `neon`. */
  readonly junk: 'glow' | 'neon' | null;
  /** The tree ring as host of the sky's lights and plane (`skyPart`, `skyPlane`, `skyPlaneUp`). */
  readonly skyHost: boolean;
}

/** The points drawn as sprites on the node path, each with its own extra (render/webgpu/effectNodes.ts spriteTwin). */
export type PointKind = 'stars' | 'embers' | 'fireflies' | 'motes';

/**
 * The patches that need no recipe: the sized points (above), the fires' flames and lantern panes (sway and flicker on
 * the fixtures' clock, `fxTime`), the smoke and steam puffs (each instance's `puffAlpha`), the torches' soft beam (M91:
 * fading where the cone is seen edge on and near the eyes), the detailed figure's
 * per-vertex roughness, metalness and camo (render/figures/figureFinish.ts) and your sleeves' camo all over
 * (render/figures/figureCamo.ts).
 */
export type PlainPatchKind = PointKind | 'flames' | 'smoke' | 'torch-beam' | 'figure-finish' | 'sleeve-camo';

/** What a world material draws beyond Three's own. */
export type NodePatch = { readonly kind: 'surface'; readonly recipe: SurfaceRecipe } | { readonly kind: PlainPatchKind };

/** A patch's uniforms by name: the objects the code that owns them writes (the baked light's grid, the fixtures' clock). */
export type PatchUniforms = Readonly<Record<string, THREE.IUniform>>;

/** A material's patch and its uniforms. */
export interface CarriedPatch {
  readonly patch: NodePatch;
  readonly uniforms: PatchUniforms;
}

const NONE: PatchUniforms = Object.freeze({});
const carried = new WeakMap<THREE.Material, CarriedPatch>();

/**
 * The program key of `patch`: one node program per kind, and per surface recipe (a surface's own strengths are its
 * uniforms, so every weathered surface shares one).
 */
export function patchKey(patch: NodePatch): string {
  if (patch.kind !== 'surface') return patch.kind;
  const r = patch.recipe;
  const junk = r.junk === 'neon' ? ':dressing-junk-neon' : r.junk === 'glow' ? ':dressing-junk' : '';
  return `surface:${r.wear ? 'wear' : 'none'}:${r.probes ? 'probes' : 'none'}${junk}${r.skyHost ? ':sky-host' : ''}`;
}

/** Gives `material` its node patch (`uniforms` by reference: the owner keeps writing them) and the patch's program key. */
export function carryNodePatch<M extends THREE.Material>(material: M, patch: NodePatch, uniforms: PatchUniforms = NONE): M {
  const key = patchKey(patch);
  carried.set(material, { patch, uniforms });
  material.customProgramCacheKey = () => key;
  return material;
}

/** The patch `material` carries, or null for one Three's node library draws as it is. */
export function nodePatchOf(material: THREE.Material): CarriedPatch | null {
  return carried.get(material) ?? null;
}

/** The uniforms of the patch `material` carries (none for a material without one). */
export function patchUniforms(material: THREE.Material): PatchUniforms {
  return carried.get(material)?.uniforms ?? NONE;
}

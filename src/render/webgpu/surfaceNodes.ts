import * as THREE from 'three';
import { type LightingModel, MeshLambertNodeMaterial, MeshStandardNodeMaterial, type Node, type NodeBuilder, type NodeMaterial } from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  diffuseColor,
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  materialEmissive,
  materialRoughness,
  max,
  min,
  mix,
  normalize,
  normalWorldGeometry,
  positionLocal,
  positionWorld,
  select,
  smoothstep,
  step,
  varying,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl';
import { WEATHERING } from '../../config/weathering';
import { everyDraw, objectFloat, objectTexture3D, objectValue } from './twinUniforms';

/**
 * The node twins of the map surfaces' shader patch (render/surfaceShader.ts, G6) and of what rides on it: the set
 * dressing's junk mesh with its glow strips and neon flicker (render/dressingMeshes.ts, G8/G9), the puddles, and the
 * tree ring hosting the skyline's lights and the passing plane (render/skyHost.ts). WebGPU overhaul W2.
 *
 * The same terms as the GLSL, in the same places of Three's own Lambert or Standard model: the weathering after the
 * texture and vertex colour (and on a Standard surface, the roughness it adds), the baked light after the light sum
 * (the sky fill dimmed by the probes' sky visibility, the bounce added), the junk's glow as emitted light, the sky host's
 * guests unlit and the plane moved and unfogged. Every number is the same config's (rounded as the GLSL writes it), and
 * every uniform is the patch's own object (render/webgpu/twinUniforms.ts). Relief (normal or bump maps), Low's
 * per-vertex baked light (in the vertex colours) and the rest of the plain material carry over as Three's node library
 * copies them.
 */

/** What a world material's program key says its patch draws (render/surfaceShader.ts surfacePatchKey and the suffixes). */
export interface SurfaceRecipe {
  /** World-space weathering (`wearGrime`, `wearRust`). */
  wear: boolean;
  /** The baked light read per pixel (the `bake*` uniforms). */
  probes: boolean;
  /** The junk mesh's glow (`glow` attribute), and the neon flicker channels (`flick`, `neonFlicker`) when `neon`. */
  junk: 'glow' | 'neon' | null;
  /** The tree ring as host of the sky's lights and plane (`skyPart`, `skyPlane`, `skyPlaneUp`). */
  skyHost: boolean;
}

/**
 * Reads a world material's program key: a surface patch (`surface:<env>:<wear>:<probes>`) and the suffixes the junk,
 * the puddles and the sky host add (`:dressing-junk`, `:dressing-junk-neon`, `:puddles`, `:sky-host`). Null for a key
 * that needs no twin (a plain surface off the environment: Three's node library draws it as it is) or isn't a surface's.
 */
export function surfaceRecipe(key: string): SurfaceRecipe | null {
  const parts = key.split(':');
  const surface = parts[0] === 'surface';
  const recipe: SurfaceRecipe = {
    wear: surface && parts[2] === 'wear',
    probes: surface && parts[3] === 'probes',
    junk: parts.includes('dressing-junk-neon') ? 'neon' : parts.includes('dressing-junk') ? 'glow' : null,
    skyHost: parts.includes('sky-host'),
  };
  if (!surface && parts[0] !== 'without-environment') return null;
  return recipe.wear || recipe.probes || recipe.junk || recipe.skyHost ? recipe : null;
}

/** A number as the GLSL writes it (`toFixed(3)`), so both programs use the same constant. */
const r3 = (x: number): number => Number(x.toFixed(3));
const N = WEATHERING.noise;
const M = WEATHERING.mix;

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's node types don't follow its own swizzles and helpers. */
type AnyNode = any;

/** The concept's cheap 3D hash, value noise and three-octave sum (surfaceShader.ts wH, wN, wF). */
const wH = Fn(([q]: [AnyNode]) => {
  const p: AnyNode = fract(q.mul(0.3183099).add(0.1)).mul(17.0).toVar();
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
}).setLayout({ name: 'wH', type: 'float', inputs: [{ name: 'q', type: 'vec3' }] });

const wN = Fn(([p]: [AnyNode]) => {
  const i: AnyNode = floor(p).toVar();
  const f0 = fract(p);
  const f: AnyNode = f0.mul(f0).mul(float(3.0).sub(f0.mul(2.0))).toVar();
  const h = (x: number, y: number, z: number): AnyNode => wH(i.add(vec3(x, y, z)));
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
    f.z,
  );
}).setLayout({ name: 'wN', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

const wF = Fn(([p]: [AnyNode]) => wN(p).mul(0.5714).add(wN(p.mul(2.03)).mul(0.2857)).add(wN(p.mul(4.01)).mul(0.1429))).setLayout({
  name: 'wF',
  type: 'float',
  inputs: [{ name: 'p', type: 'vec3' }],
});

/** A 1×1×1 grid the baked-light read holds until it reads an object's (never drawn with: a surface with probes has its map's). */
export function emptyGrid(): THREE.Data3DTexture {
  const t = new THREE.Data3DTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, 1);
  t.needsUpdate = true;
  return t;
}

/**
 * One build's nodes for a surface twin: made in the material's setup (one per node program), its uniforms read per
 * drawn object. `grid` stands in for the baked-light texture until an object's is read.
 */
export class SurfaceNodes {
  /** The weathering's grime (0..1) once the diffuse colour is set up, for the roughness. */
  private wearG: AnyNode = null;

  constructor(
    private readonly recipe: SurfaceRecipe,
    private readonly grid: THREE.Data3DTexture,
  ) {}

  /** The sky host's plane: moved by its matrix and collapsed while it is down (skyHost.ts's begin_vertex line). */
  position(base: AnyNode): AnyNode {
    if (!this.recipe.skyHost) return base;
    const part = attribute('skyPart', 'float');
    const plane = objectValue('skyPlane', new THREE.Matrix4());
    const up = objectFloat('skyPlaneUp');
    return select(part.greaterThan(1.5), plane.mul(vec4(base.mul(up), 1.0)).xyz, base);
  }

  /** After the colour and vertex colours: the weathering (WEAR_GLSL), leaving the grime for the roughness. */
  diffuse(): void {
    if (!this.recipe.wear) return;
    const grime = objectFloat('wearGrime');
    const rust = objectFloat('wearRust');
    const wp: AnyNode = positionWorld;
    const vert = float(1.0).sub(abs(normalize(normalWorldGeometry).y)).toVar();
    const big = wF(wp.mul(r3(N.patchScale))).toVar();
    const fine = wN(wp.mul(r3(N.fineScale))).toVar();
    const patchy = smoothstep(0.5, 0.82, big.mul(0.85).add(fine.mul(0.2)));
    const creep = float(1.0).sub(smoothstep(0.0, fine.mul(r3(N.creepVary)).add(r3(N.creep)), wp.y)).mul(vert).toVar();
    const across = r3(N.streakAcross);
    const streakAt = vec3(wp.x.add(wp.z).mul(across), wp.y.mul(r3(N.streakAlong)), wp.z.sub(wp.x).mul(across));
    const streak = smoothstep(0.58, 0.95, wN(streakAt)).mul(vert).mul(big.mul(0.6).add(0.4)).toVar();
    const wearG = clamp(patchy.mul(r3(M.patches)).add(creep.mul(r3(M.creep))).add(streak.mul(r3(M.streaks))), 0.0, 1.0).mul(grime).toVar();
    const rgb = diffuseColor.rgb;
    const lum = dot(rgb, vec3(0.3, 0.59, 0.11));
    const dirt = mix(rgb, vec3(lum), r3(M.grey)).mul(vec3(...M.dirt.map(r3)));
    rgb.assign(mix(rgb, dirt, wearG));
    If(rust.greaterThan(0.0), () => {
      const bloom = smoothstep(0.6, 0.78, wF(wp.mul(r3(N.rustScale)).add(7.3)).add(fine.mul(0.08))).mul(creep.mul(0.6).add(0.35).add(streak.mul(0.9)));
      const rs = clamp(bloom, 0.0, 1.0).mul(rust).toVar();
      rgb.assign(mix(rgb, vec3(...M.rust.map(r3)).mul(fine.mul(0.6).add(0.7)), rs.mul(r3(M.rustStrength))));
      wearG.assign(max(wearG, rs));
    });
    this.wearG = wearG;
  }

  /** A Standard surface's roughness with the grime's (`roughnessFactor = mix(roughnessFactor, 1.0, wearG × roughen)`). */
  roughness(): AnyNode | null {
    return this.wearG ? mix(materialRoughness, 1.0, this.wearG.mul(r3(M.roughen))) : null;
  }

  /** The junk's glow (strips and neon tubes) as light of their own colour, on the material's emissive. */
  emissive(): AnyNode | null {
    const junk = this.recipe.junk;
    if (!junk) return null;
    let level: AnyNode = float(1.0);
    if (junk === 'neon') {
      const flick = attribute('flick', 'float');
      const channels: AnyNode = objectValue('neonFlicker', new THREE.Vector3(1, 1, 1));
      level = select(flick.lessThan(0.5), 1.0, select(flick.lessThan(1.5), channels.x, select(flick.lessThan(2.5), channels.y, channels.z)));
    }
    const glow = varying(attribute('glow', 'float').mul(level));
    return materialEmissive.add(vertexColor().rgb.mul(glow));
  }

  /**
   * The lighting model with the baked light after its indirect light (PROBE_GLSL): the sky fill (and on a Standard
   * surface the sky's reflection) scaled by the probes' sky visibility, and the bounce light added. The bounce takes the
   * full base colour on Lambert and Standard alike: the GLSL reads `material.diffuseColor`, which Three (since r18x) keeps
   * as the base colour, the metal's share taken off only in `material.diffuseContribution`.
   */
  lightingModel<T extends LightingModel>(model: T): T {
    if (!this.recipe.probes) return model;
    const indirect = model.indirect.bind(model);
    model.indirect = (builder: NodeBuilder): void => {
      indirect(builder);
      const lift = objectFloat('bakeLift');
      const bakeMin = objectValue('bakeMin', new THREE.Vector3());
      const bakeSize = objectValue('bakeSize', new THREE.Vector3(1, 1, 1));
      const p: AnyNode = positionWorld.add(normalize(normalWorldGeometry).mul(lift)).sub(bakeMin).div(bakeSize).toVar();
      const inside = step(0.0, min(min(p.x, p.y), p.z)).mul(step(max(max(p.x, p.y), p.z), 1.0)).toVar();
      const bake: AnyNode = objectTexture3D('bakeTex', this.grid, p).toVar();
      const vis = mix(1.0, mix(1.0, bake.a, objectFloat('bakeOcclusion')), inside).toVar();
      const albedo: AnyNode = diffuseColor.rgb;
      const reflected = (builder.context as unknown as { reflectedLight: { indirectDiffuse: AnyNode; indirectSpecular: AnyNode } }).reflectedLight;
      const bounce = albedo.mul(1 / Math.PI).mul(bake.rgb).mul(objectFloat('bakeScale')).mul(objectFloat('bakeBounce')).mul(inside);
      reflected.indirectDiffuse.assign(reflected.indirectDiffuse.mul(vis).add(bounce));
      reflected.indirectSpecular.mulAssign(vis);
    };
    return model;
  }

  /** The sky host's lights and plane unlit: their own colour, as the MeshBasicMaterial each was (no emitted light added). */
  lighting(lit: AnyNode): AnyNode {
    if (!this.recipe.skyHost) return lit;
    return select(varying(attribute('skyPart', 'float')).greaterThan(0.5), diffuseColor.rgb, lit);
  }

  /** The sky host's plane is drawn unfogged (`fogged`: the fogged colour, `unfogged`: before the fog). */
  fog(unfogged: AnyNode, fogged: AnyNode): AnyNode {
    if (!this.recipe.skyHost || fogged === unfogged) return fogged;
    return select(varying(attribute('skyPart', 'float')).greaterThan(1.5), unfogged, fogged);
  }

  /** The same for the haze added after the tone mapping (W4, render/webgpu/post/nodeOutput.ts): none on the plane. */
  lateFogShare(share: AnyNode): AnyNode {
    if (!this.recipe.skyHost) return share;
    return select(varying(attribute('skyPart', 'float')).greaterThan(1.5), 0, share);
  }
}

/** What both twin classes give their setup: the nodes, made with the material (setSurface). */
interface SurfaceTwin {
  surface: SurfaceNodes;
}

/** A Lambert surface's twin (the map's painted surfaces, the junk, the tree ring). */
export class SurfaceLambertTwin extends MeshLambertNodeMaterial implements SurfaceTwin {
  surface!: SurfaceNodes;

  /** Its uniforms are the drawn object's, set on every draw (twinUniforms.ts everyDraw). */
  override setupObserver(builder: NodeBuilder): ReturnType<NodeMaterial['setupObserver']> {
    return everyDraw(super.setupObserver(builder));
  }

  override setupPosition(builder: NodeBuilder): Node {
    const moved = this.surface.position(positionLocal);
    if (moved !== positionLocal) this.positionNode = moved;
    return super.setupPosition(builder);
  }

  override setupDiffuseColor(builder: NodeBuilder): void {
    super.setupDiffuseColor(builder);
    this.surface.diffuse();
    (this as AnyNode).emissiveNode = this.surface.emissive();
  }

  override setupLightingModel(): ReturnType<MeshLambertNodeMaterial['setupLightingModel']> {
    return this.surface.lightingModel(super.setupLightingModel());
  }

  override setupLighting(builder: NodeBuilder): Node {
    return this.surface.lighting(super.setupLighting(builder));
  }

  override setupFog(builder: NodeBuilder, output: Node): Node {
    return this.surface.fog(output, super.setupFog(builder, output));
  }

  lateFogShare(share: AnyNode): AnyNode {
    return this.surface.lateFogShare(share);
  }
}

/** A Standard surface's twin (steel under the environment, the puddles). */
export class SurfaceStandardTwin extends MeshStandardNodeMaterial implements SurfaceTwin {
  surface!: SurfaceNodes;

  /** Its uniforms are the drawn object's, set on every draw (twinUniforms.ts everyDraw). */
  override setupObserver(builder: NodeBuilder): ReturnType<NodeMaterial['setupObserver']> {
    return everyDraw(super.setupObserver(builder));
  }

  override setupDiffuseColor(builder: NodeBuilder): void {
    super.setupDiffuseColor(builder);
    this.surface.diffuse();
    (this as AnyNode).emissiveNode = this.surface.emissive();
  }

  override setupVariants(builder: NodeBuilder): void {
    const rough = this.surface.roughness();
    if (rough) this.roughnessNode = rough;
    super.setupVariants(builder);
  }

  override setupLightingModel(): ReturnType<MeshStandardNodeMaterial['setupLightingModel']> {
    return this.surface.lightingModel(super.setupLightingModel());
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import * as THREE from 'three';
import type { NodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { generateMagicSquareNoise } from 'three/examples/jsm/shaders/GTAOShader.js';
import { generatePdSamplePointInitializer } from 'three/examples/jsm/shaders/PoissonDenoiseShader.js';
import { POST } from '../../../config/post';
import type { AmbientOcclusionScale } from '../../../config/render';
import { denoiseNoise } from '../../post/ambientOcclusionPass';
import { drawCleared, MULTIPLY, type PostFrame, type PostPass, scaled } from '../../post/postPass';
import { type AnyNode, at, depthAt, fullScreen, type NodeRenderer, type NodeTarget, quad, slot, viewAt, vUv } from './nodeKit';

/**
 * Ambient occlusion on the node path (W4): render/post/ambientOcclusionPass.ts in TSL. Three/webgpu 0.186's own
 * `GTAONode` is a later GTAO (a different horizon search with per-pixel jitter), and its `DenoiseNode` reads normals
 * from a buffer, so neither draws today's shade: this ports what WebGL draws, Three's `GTAOShader` (normals rebuilt
 * from the depth, 16 samples: 3 directions of 6 steps) and `PoissonDenoiseShader`, with the same noise textures, the
 * same targets (8-bit, cleared white, at the quality's scale) and the same multiply onto the picture.
 */

const { abs, acos, clamp, cos, cross, Discard, dot, float, Fn, If, int, ivec2, mat3, max, mix, normalize, PI, pow, sin, sqrt, texture, textureSize, uniform, vec2, vec3, vec4 } = TSL as AnyNode;

const C = POST.ao;
/** GTAOShader's DIRECTIONS and STEPS for C.samples (fewer than 30 samples: 3 directions). */
const DIRECTIONS = C.samples < 30 ? 3 : 5;
const STEPS = Math.ceil(C.samples / DIRECTIONS);

/** PoissonDenoiseShader's sample disk (its SAMPLE_VECTORS), read back from the same generator. */
export function denoiseDisk(samples: number, rings: number, radiusExponent: number): THREE.Vector3[] {
  const glsl = generatePdSamplePointInitializer(samples, rings, radiusExponent);
  return [...glsl.matchAll(/vec3\(([^,]+), ([^,]+), ([^)]+)\)/g)].map((m) => new THREE.Vector3(Number(m[1]), Number(m[2]), Number(m[3])));
}

/** The depth at GL coordinates and the shaders' depth-rebuilt normal (`computeNormalFromDepth`), for one depth slot. */
function depthReads(depth: AnyNode, inverseProjection: AnyNode) {
  const getDepth = (u: AnyNode): AnyNode => depthAt(depth, u);
  const size = vec2(textureSize(depth, 0));
  // texelFetch at GL's integer coordinates (rows from the bottom): the node renderer's rows run from the top.
  const fetch = (p: AnyNode): AnyNode => depth.load(ivec2(p.x, int(size.y).sub(p.y).sub(1)));
  const normalAt = (u: AnyNode): AnyNode => {
    const p = ivec2(u.mul(size)).toVar();
    const c0 = fetch(p).toVar();
    const l2 = fetch(p.sub(ivec2(2, 0)));
    const l1 = fetch(p.sub(ivec2(1, 0))).toVar();
    const r1 = fetch(p.add(ivec2(1, 0))).toVar();
    const r2 = fetch(p.add(ivec2(2, 0)));
    const b2 = fetch(p.sub(ivec2(0, 2)));
    const b1 = fetch(p.sub(ivec2(0, 1))).toVar();
    const t1 = fetch(p.add(ivec2(0, 1))).toVar();
    const t2 = fetch(p.add(ivec2(0, 2)));
    const dl = abs(l1.mul(2).sub(l2).sub(c0));
    const dr = abs(r1.mul(2).sub(r2).sub(c0));
    const db = abs(b1.mul(2).sub(b2).sub(c0));
    const dt = abs(t1.mul(2).sub(t2).sub(c0));
    const ce = viewAt(inverseProjection, u, c0).toVar();
    const dx = vec2(float(1).div(size.x), 0);
    const dy = vec2(0, float(1).div(size.y));
    const dpdx = dl.lessThan(dr).select(ce.sub(viewAt(inverseProjection, u.sub(dx), l1)), viewAt(inverseProjection, u.add(dx), r1).sub(ce));
    const dpdy = db.lessThan(dt).select(ce.sub(viewAt(inverseProjection, u.sub(dy), b1)), viewAt(inverseProjection, u.add(dy), t1).sub(ce));
    return normalize(cross(dpdx, dpdy));
  };
  return { getDepth, normalAt };
}

export class NodeAmbientOcclusionPass implements PostPass<NodeRenderer, NodeTarget> {
  readonly id = 'ao' as const;
  readonly inPlace = true;
  private readonly ao: NodeTarget;
  private readonly denoised: NodeTarget;
  private readonly gtaoNoise: THREE.DataTexture;
  private readonly denoiseNoise: THREE.DataTexture;
  private readonly gtao: NodeMaterial;
  private readonly denoise: NodeMaterial;
  private readonly blend: NodeMaterial;
  private readonly depth = slot();
  private readonly quad = quad();
  private readonly keep = new THREE.Color();
  private readonly u = {
    resolution: uniform(new THREE.Vector2()),
    projection: uniform(new THREE.Matrix4()),
    inverseProjection: uniform(new THREE.Matrix4()),
  };

  constructor(
    private readonly scale: AmbientOcclusionScale,
    width: number,
    height: number,
  ) {
    this.ao = new THREE.RenderTarget(1, 1, { depthBuffer: false });
    this.denoised = this.ao.clone();
    this.gtaoNoise = generateMagicSquareNoise();
    this.denoiseNoise = denoiseNoise(C.noiseSize, C.noiseSeed);
    this.gtao = fullScreen(this.gtaoShade());
    this.denoise = fullScreen(this.denoiseShade());
    const shade = texture(this.denoised.texture);
    this.blend = fullScreen(vec4(vec3(mix(1, at(shade, vUv).r, C.intensity)), 1), MULTIPLY);
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    const w = scaled(width, this.scale);
    const h = scaled(height, this.scale);
    this.ao.setSize(w, h);
    this.denoised.setSize(w, h);
    this.u.resolution.value.set(w, h);
  }

  render(gl: NodeRenderer, frame: PostFrame, read: NodeTarget): boolean {
    const depth = frame.depth;
    if (!depth) return false;
    const cam = frame.camera;
    this.depth.value = depth;
    this.u.projection.value.copy(cam.projectionMatrix);
    this.u.inverseProjection.value.copy(cam.projectionMatrixInverse);
    this.quad.material = this.gtao;
    // Cleared to white: the sky and anything else the shader discards stay unshaded.
    drawCleared(gl, this.quad, this.ao, 0xffffff, this.keep);
    this.quad.material = this.denoise;
    drawCleared(gl, this.quad, this.denoised, 0xffffff, this.keep);
    this.quad.material = this.blend;
    gl.setRenderTarget(read);
    this.quad.render(gl);
    return false;
  }

  dispose(): void {
    this.ao.dispose();
    this.denoised.dispose();
    this.gtao.dispose();
    this.denoise.dispose();
    this.blend.dispose();
    this.gtaoNoise.dispose();
    this.denoiseNoise.dispose();
  }

  /** GTAOShader's fragment (NORMAL_VECTOR_TYPE 0, perspective, no screen-space radius or clip box). */
  private gtaoShade(): AnyNode {
    const { resolution, projection, inverseProjection } = this.u;
    const { getDepth, normalAt } = depthReads(this.depth, inverseProjection);
    const noise = texture(this.gtaoNoise);
    return Fn(() => {
      const depth = getDepth(vUv).toVar();
      If(depth.greaterThanEqual(1), () => Discard());
      const viewPos = viewAt(inverseProjection, vUv, depth).toVar();
      const viewNormal = normalAt(vUv).toVar();
      // A data texture's rows run as GL's on both back ends: read at GL's coordinates as they are.
      const noiseTexel = noise.sample(vUv.mul(resolution).div(vec2(textureSize(noise, 0)))).level(0).toVar();
      const randomVec = noiseTexel.xyz.mul(2).sub(1);
      const tangent = normalize(vec3(randomVec.xy, 0)).toVar();
      const bitangent = vec3(tangent.y.negate(), tangent.x, 0);
      const kernel = mat3(tangent, bitangent, vec3(0, 0, 1));
      const viewDir = normalize(viewPos.negate()).toVar();
      const ao = float(0).toVar();
      const reach = float(C.radius).mul(noiseTexel.w.mul(0.5).add(0.5)).toVar();
      for (let i = 0; i < DIRECTIONS; i++) {
        const angle = (i / DIRECTIONS) * Math.PI;
        const sampleDir = normalize(kernel.mul(vec3(Math.cos(angle), Math.sin(angle), 0))).toVar();
        const sliceBitangent = normalize(cross(sampleDir, viewDir)).toVar();
        const sliceTangent = cross(sliceBitangent, viewDir);
        const normalInSlice = normalize(viewNormal.sub(sliceBitangent.mul(dot(viewNormal, sliceBitangent)))).toVar();
        const toNormal = cross(normalInSlice, sliceBitangent).toVar();
        const cosH = vec2(dot(viewDir, toNormal), dot(viewDir, toNormal.negate())).toVar();
        for (let j = 0; j < STEPS; j++) {
          const offset = sampleDir.mul(reach).mul(Math.pow((j + 1) / STEPS, C.distanceExponent)).toVar();
          const falloff = 1 + (2 / (j + 2) - 1) * C.distanceFallOff;
          for (const [sign, h] of [[1, 'x'], [-1, 'y']] as const) {
            const sampleView = viewPos.add(offset.mul(sign));
            const clip = projection.mul(vec4(sampleView, 1)).toVar();
            const sampleUv = clip.xy.div(clip.w).mul(0.5).add(0.5).toVar();
            const delta = viewAt(inverseProjection, sampleUv, getDepth(sampleUv)).sub(viewPos).toVar();
            If(abs(delta.z).lessThan(C.thickness), () => {
              const c = cosH[h];
              c.addAssign(max(0, dot(viewDir, normalize(delta)).sub(c).mul(falloff)));
            });
          }
        }
        const sinH = sqrt(float(1).sub(cosH.mul(cosH)));
        const nx = dot(normalInSlice, sliceTangent);
        const ny = dot(normalInSlice, viewDir);
        const nxb = acos(cosH.y).sub(acos(cosH.x)).add(sinH.x.mul(cosH.x)).sub(sinH.y.mul(cosH.y)).mul(0.5);
        const nyb = float(2).sub(cosH.x.mul(cosH.x)).sub(cosH.y.mul(cosH.y)).mul(0.5);
        ao.addAssign(nx.mul(nxb).add(ny.mul(nyb)));
      }
      return vec4(vec3(pow(clamp(ao.div(DIRECTIONS), 0, 1), C.scale)), 1);
    })();
  }

  /** PoissonDenoiseShader's fragment (normals from the depth, luminance weights, `index` 0: the noise's red). */
  private denoiseShade(): AnyNode {
    const { resolution, inverseProjection } = this.u;
    const { getDepth, normalAt } = depthReads(this.depth, inverseProjection);
    const d = C.denoise;
    const disk = denoiseDisk(d.samples, d.rings, d.radiusExponent);
    const shade = texture(this.ao.texture);
    const noise = texture(this.denoiseNoise);
    const luminance = (c: AnyNode): AnyNode => dot(vec3(0.2125, 0.7154, 0.0721), c);
    return Fn(() => {
      const depth = getDepth(vUv).toVar();
      const viewNormal = normalAt(vUv).toVar();
      If(depth.equal(1).or(dot(viewNormal, viewNormal).equal(0)), () => Discard());
      const center = at(shade, vUv).rgb.toVar();
      const viewPos = viewAt(inverseProjection, vUv, depth).toVar();
      const turn = noise.sample(vUv.mul(resolution).div(vec2(textureSize(noise, 0)))).level(0).r.mul(PI.mul(2)).toVar();
      const nx = sin(turn);
      const ny = cos(turn);
      // GLSL's mat2(nx, -ny, nx, ny) (column-major) times v.
      const rotate = (v: AnyNode): AnyNode => vec2(nx.mul(v.x).add(nx.mul(v.y)), ny.negate().mul(v.x).add(ny.mul(v.y)));
      const total = float(1).toVar();
      const sum = center.toVar();
      for (const s of disk) {
        const offset = rotate(vec2(s.x, s.y).mul(1 + s.z * (d.radius - 1)).div(resolution));
        const sampleUv = vUv.add(offset).toVar();
        const neighbour = at(shade, sampleUv).rgb.toVar();
        const sampleDepth = getDepth(sampleUv);
        const sampleNormal = normalAt(sampleUv);
        const viewSample = viewAt(inverseProjection, sampleUv, sampleDepth);
        const normalSim = pow(max(dot(viewNormal, sampleNormal), 0), d.normalPhi);
        const lumaSim = max(float(1).sub(abs(luminance(neighbour).sub(luminance(center))).div(d.lumaPhi)), 0);
        const depthSim = max(float(1).sub(abs(dot(viewPos.sub(viewSample), viewNormal)).div(d.depthPhi)), 0);
        const w = lumaSim.mul(depthSim).mul(normalSim).toVar();
        sum.addAssign(neighbour.mul(w));
        total.addAssign(w);
      }
      return vec4(total.greaterThan(0).select(sum.div(total), sum), 1);
    })();
  }
}

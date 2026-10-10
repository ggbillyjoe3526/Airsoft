import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { generateMagicSquareNoise, GTAOShader } from 'three/examples/jsm/shaders/GTAOShader.js';
import { generatePdSamplePointInitializer, PoissonDenoiseShader } from 'three/examples/jsm/shaders/PoissonDenoiseShader.js';
import { POST } from '../../config/post';
import type { AmbientOcclusionScale } from '../../config/render';
import { createRng, rngNext } from '../../sim/rng';
import { drawCleared, fullScreenMaterial, MULTIPLY, type PostFrame, type PostPass, scaled } from './postPass';

/**
 * Ambient occlusion (G5, QualitySettings.ambientOcclusion): Three.js's GTAO and Poisson denoise shaders over the scene's
 * own depth, at half or full resolution, the normals rebuilt from the depth so the scene is drawn once (Three's GTAOPass
 * draws it a second time for its normals, and can't be given a depth alone). The result multiplies the picture in place.
 */
export class AmbientOcclusionPass implements PostPass {
  readonly id = 'ao' as const;
  readonly inPlace = true;
  private readonly ao: THREE.WebGLRenderTarget;
  private readonly denoised: THREE.WebGLRenderTarget;
  private readonly gtao: THREE.ShaderMaterial;
  private readonly denoise: THREE.ShaderMaterial;
  private readonly blend: THREE.ShaderMaterial;
  private readonly gtaoNoise: THREE.DataTexture;
  private readonly denoiseNoise: THREE.DataTexture;
  private readonly quad = new FullScreenQuad();
  private readonly keep = new THREE.Color();

  constructor(
    private readonly scale: AmbientOcclusionScale,
    width: number,
    height: number,
  ) {
    const c = POST.ao;
    // AO is one channel in 0..1: eight bits are plenty.
    this.ao = new THREE.WebGLRenderTarget(scaled(width, scale), scaled(height, scale), { depthBuffer: false });
    this.denoised = this.ao.clone();
    this.gtaoNoise = generateMagicSquareNoise();
    this.denoiseNoise = denoiseNoise(c.noiseSize, c.noiseSeed);
    this.gtao = new THREE.ShaderMaterial({
      defines: { ...GTAOShader.defines, NORMAL_VECTOR_TYPE: 0, SAMPLES: c.samples },
      uniforms: THREE.UniformsUtils.clone(GTAOShader.uniforms),
      vertexShader: GTAOShader.vertexShader,
      fragmentShader: GTAOShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const u = this.gtao.uniforms;
    u.tNoise!.value = this.gtaoNoise;
    u.radius!.value = c.radius;
    u.distanceExponent!.value = c.distanceExponent;
    u.thickness!.value = c.thickness;
    u.scale!.value = c.scale;
    u.distanceFallOff!.value = c.distanceFallOff;
    const d = c.denoise;
    this.denoise = new THREE.ShaderMaterial({
      defines: { ...PoissonDenoiseShader.defines, NORMAL_VECTOR_TYPE: 0, SAMPLES: d.samples, SAMPLE_VECTORS: generatePdSamplePointInitializer(d.samples, d.rings, d.radiusExponent) },
      uniforms: THREE.UniformsUtils.clone(PoissonDenoiseShader.uniforms),
      vertexShader: PoissonDenoiseShader.vertexShader,
      fragmentShader: PoissonDenoiseShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const p = this.denoise.uniforms;
    p.tDiffuse!.value = this.ao.texture;
    p.tNoise!.value = this.denoiseNoise;
    p.lumaPhi!.value = d.lumaPhi;
    p.depthPhi!.value = d.depthPhi;
    p.normalPhi!.value = d.normalPhi;
    p.radius!.value = d.radius;
    this.blend = fullScreenMaterial(
      /* glsl */ `
      uniform sampler2D tAo;
      uniform float intensity;
      varying vec2 vUv;
      void main() { gl_FragColor = vec4(vec3(mix(1.0, texture2D(tAo, vUv).r, intensity)), 1.0); }`,
      { tAo: { value: this.denoised.texture }, intensity: { value: c.intensity } },
      MULTIPLY,
    );
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    const w = scaled(width, this.scale);
    const h = scaled(height, this.scale);
    this.ao.setSize(w, h);
    this.denoised.setSize(w, h);
    this.gtao.uniforms.resolution!.value.set(w, h);
    this.denoise.uniforms.resolution!.value.set(w, h);
  }

  render(gl: THREE.WebGLRenderer, frame: PostFrame, read: THREE.WebGLRenderTarget): boolean {
    const depth = frame.depth;
    if (!depth) return false;
    const cam = frame.camera;
    const u = this.gtao.uniforms;
    u.tDepth!.value = depth;
    u.cameraNear!.value = cam.near;
    u.cameraFar!.value = cam.far;
    u.cameraProjectionMatrix!.value.copy(cam.projectionMatrix);
    u.cameraProjectionMatrixInverse!.value.copy(cam.projectionMatrixInverse);
    u.cameraWorldMatrix!.value.copy(cam.matrixWorld);
    this.quad.material = this.gtao;
    // Cleared to white: the sky and anything else the shader discards stay unshaded.
    drawCleared(gl, this.quad, this.ao, 0xffffff, this.keep);
    const p = this.denoise.uniforms;
    p.tDepth!.value = depth;
    p.cameraProjectionMatrixInverse!.value.copy(cam.projectionMatrixInverse);
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
    this.quad.dispose();
  }
}

/** The denoise's rotation noise: four random bytes a texel from a fixed seed (Three's GTAOPass uses simplex noise). */
export function denoiseNoise(size: number, seed: number): THREE.DataTexture {
  const rng = createRng(seed);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rngNext(rng) * 256);
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

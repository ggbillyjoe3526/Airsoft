import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { POST } from '../../config/post';
import { ADDITIVE, colourTarget, drawCleared, fullScreenMaterial, type PostFrame, type PostPass, scaled } from './postPass';

const C = POST.lightShafts;

/** Where the key light falls on screen this frame, or null while it is behind the view or well off the edge. */
export interface SunOnScreen {
  /** Texture coordinates (0..1 on screen; beyond while off the edge). */
  u: number;
  v: number;
  /** 1 on screen, fading to 0 at POST.lightShafts.margin screen-heights off the edge. */
  fade: number;
}

/**
 * The sun's place on screen for `camera` (G5): its direction taken into view space, then projected. Fills `out` and
 * returns it, or null when the sun is behind the camera or past the margin. Allocation-free (`scratch` is the caller's).
 */
export function sunOnScreen(camera: THREE.PerspectiveCamera, sun: THREE.Vector3, scratch: THREE.Vector3, out: SunOnScreen): SunOnScreen | null {
  const v = scratch.copy(sun).transformDirection(camera.matrixWorldInverse);
  if (v.z >= 0) return null;
  v.applyMatrix4(camera.projectionMatrix);
  const marginY = 2 * C.margin;
  const marginX = marginY / camera.aspect;
  const offX = Math.max(0, Math.abs(v.x) - 1) / marginX;
  const offY = Math.max(0, Math.abs(v.y) - 1) / marginY;
  const off = Math.max(offX, offY);
  if (off >= 1) return null;
  out.u = v.x * 0.5 + 0.5;
  out.v = v.y * 0.5 + 0.5;
  out.fade = 1 - off;
  return out;
}

/**
 * Light shafts (G5, QualitySettings.lightShafts): screen-space beams from the sun or the moon at reduced resolution. The
 * sky's own pixels round the key light (found by the depth, so nothing is drawn again) are blurred towards it, so
 * whatever stands in front of it cuts dark gaps in the glow, and the result is added back. A stand-in for volumetric fog
 * (the design record: per-pixel fog at full resolution costs too much). Skipped while the light is behind you or far off
 * screen, so it costs nothing most of the time by day.
 */
export class LightShaftsPass implements PostPass {
  readonly id = 'lightShafts' as const;
  private readonly mask: THREE.WebGLRenderTarget;
  private readonly rays: THREE.WebGLRenderTarget;
  private readonly maskMaterial: THREE.ShaderMaterial;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly addMaterial: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private readonly keep = new THREE.Color();
  private readonly scratch = new THREE.Vector3();
  private readonly onScreen: SunOnScreen = { u: 0, v: 0, fade: 0 };

  constructor(width: number, height: number, type: THREE.TextureDataType) {
    this.mask = colourTarget(width, height, type, C.resolution);
    this.rays = colourTarget(width, height, type, C.resolution);
    this.maskMaterial = fullScreenMaterial(
      /* glsl */ `
      #include <packing>
      uniform sampler2D tColour;
      uniform highp sampler2D tDepth;
      uniform vec2 sun;
      uniform float aspect, radius, near, far, skyFrom;
      varying vec2 vUv;
      void main() {
        float viewZ = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, near, far);
        float d = length((vUv - sun) * vec2(aspect, 1.0)) / radius;
        float w = viewZ > skyFrom ? pow(max(0.0, 1.0 - d), 2.0) : 0.0;
        gl_FragColor = vec4(texture2D(tColour, vUv).rgb * w, 1.0);
      }`,
      { tColour: { value: null }, tDepth: { value: null }, sun: { value: new THREE.Vector2() }, aspect: { value: 1 }, radius: { value: C.sunRadius }, near: { value: 0 }, far: { value: 0 }, skyFrom: { value: C.skyFrom } },
    );
    this.blurMaterial = fullScreenMaterial(
      /* glsl */ `
      uniform sampler2D tMask;
      uniform vec2 sun;
      uniform float decay, span;
      varying vec2 vUv;
      void main() {
        vec2 step = (vUv - sun) * span / float(SAMPLES);
        vec2 uv = vUv;
        float weight = 1.0;
        vec3 sum = vec3(0.0);
        for (int i = 0; i < SAMPLES; i++) {
          uv -= step;
          sum += texture2D(tMask, clamp(uv, 0.0, 1.0)).rgb * weight;
          weight *= decay;
        }
        gl_FragColor = vec4(sum / float(SAMPLES), 1.0);
      }`,
      { tMask: { value: this.mask.texture }, sun: { value: new THREE.Vector2() }, decay: { value: C.decay }, span: { value: C.length } },
      { defines: { SAMPLES: C.samples } },
    );
    this.addMaterial = fullScreenMaterial(
      /* glsl */ `
      uniform sampler2D tRays;
      uniform float strength;
      varying vec2 vUv;
      void main() { gl_FragColor = vec4(texture2D(tRays, vUv).rgb * strength, 1.0); }`,
      { tRays: { value: this.rays.texture }, strength: { value: 0 } },
      ADDITIVE,
    );
  }

  setSize(width: number, height: number): void {
    this.mask.setSize(scaled(width, C.resolution), scaled(height, C.resolution));
    this.rays.setSize(scaled(width, C.resolution), scaled(height, C.resolution));
  }

  render(gl: THREE.WebGLRenderer, frame: PostFrame, read: THREE.WebGLRenderTarget): boolean {
    const cam = frame.camera;
    const sun = frame.depth ? sunOnScreen(cam, frame.sun, this.scratch, this.onScreen) : null;
    if (!sun) return false;
    const m = this.maskMaterial.uniforms;
    m.tColour!.value = read.texture;
    m.tDepth!.value = frame.depth;
    m.sun!.value.set(sun.u, sun.v);
    m.aspect!.value = cam.aspect;
    m.near!.value = cam.near;
    m.far!.value = cam.far;
    this.quad.material = this.maskMaterial;
    drawCleared(gl, this.quad, this.mask, 0x000000, this.keep);
    this.blurMaterial.uniforms.sun!.value.set(sun.u, sun.v);
    this.quad.material = this.blurMaterial;
    drawCleared(gl, this.quad, this.rays, 0x000000, this.keep);
    this.addMaterial.uniforms.strength!.value = (frame.night ? C.strength.night : C.strength.day) * sun.fade;
    this.quad.material = this.addMaterial;
    gl.setRenderTarget(read);
    this.quad.render(gl);
    return false;
  }

  dispose(): void {
    this.mask.dispose();
    this.rays.dispose();
    this.maskMaterial.dispose();
    this.blurMaterial.dispose();
    this.addMaterial.dispose();
    this.quad.dispose();
  }
}

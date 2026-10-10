import * as THREE from 'three';
import type { RetroLook } from '../config/render';
import { retroTargetSize, type RetroView } from './retroFilter';

/*
 * WebGL's retro filter (M42), in a chunk of its own (W4): a Dev look, loaded the first time it is turned on, so the
 * main chunk keeps only what the Renderer needs to ask for it (render/retroFilter.ts).
 */

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Samples the low-resolution view at the retro pixel under this fragment (no smoothing: one texel per block of
 * `uPixel` device pixels), tone maps it and encodes it for the screen as Three.js would, then crushes each channel to
 * `uLevels` shades with the 4×4 Bayer threshold of that retro pixel, so the dither is as chunky as the pixels.
 */
const FRAGMENT = /* glsl */ `
uniform sampler2D tView;
uniform vec2 uViewSize;
uniform float uPixel;
uniform float uLevels;
varying vec2 vUv;

float bayer2(vec2 c) { return 2.0 * abs(c.x - c.y) + c.y; }
float bayer4(vec2 p) {
  vec2 c = mod(p, 4.0);
  return (4.0 * bayer2(mod(c, 2.0)) + bayer2(floor(c / 2.0)) + 0.5) / 16.0;
}

void main() {
  vec2 texel = floor(gl_FragCoord.xy / uPixel);
  vec3 c = texture2D(tView, (texel + 0.5) / uViewSize).rgb;
  #ifdef TONE_MAPPING
  c = toneMapping(c);
  #endif
  c = clamp(linearToOutputTexel(vec4(c, 1.0)).rgb, 0.0, 1.0);
  float steps = uLevels - 1.0;
  c = min(vec3(steps), floor(c * steps + bayer4(texel))) / steps;
  gl_FragColor = vec4(c, 1.0);
}
`;

/**
 * The retro pixel filter (M42): the frame is drawn into a small render target (a texel per retro pixel, nearest
 * filtering, half float so bright light keeps its range until the pass tone maps it), then one full-screen triangle
 * pair shows it on the canvas through the colour-crushing shader. Owns its target, material and geometry; Renderer
 * makes one while the filter is on and disposes of it when it goes off, on a context swap and with itself.
 */
export class RetroFilter implements RetroView {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private look: RetroLook;

  /** `halfFloat`: the context can draw into half-float targets (an 8-bit target clips light above white otherwise). */
  constructor(look: RetroLook, halfFloat: boolean) {
    this.look = { ...look };
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tView: { value: this.target.texture },
        uViewSize: { value: new THREE.Vector2(1, 1) },
        uPixel: { value: look.pixelSize },
        uLevels: { value: look.levels },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** A new pixel size or colour count; the target's size follows on the next `resize`. */
  setLook(look: RetroLook): void {
    this.look.pixelSize = look.pixelSize;
    this.look.levels = look.levels;
    this.material.uniforms.uLevels!.value = look.levels;
  }

  /** The page's size in CSS pixels and the canvas's pixel ratio: the target is sized to the retro pixels covering it. */
  resize(width: number, height: number, pixelRatio: number): void {
    const size = retroTargetSize(width, height, this.look.pixelSize);
    this.target.setSize(size.width, size.height);
    (this.material.uniforms.uViewSize!.value as THREE.Vector2).set(size.width, size.height);
    this.material.uniforms.uPixel!.value = this.look.pixelSize * pixelRatio;
  }

  /** What the frame's passes draw into until `present`. */
  get renderTarget(): THREE.WebGLRenderTarget {
    return this.target;
  }

  /** Shows the low-resolution frame on the canvas through the colour-crushing pass. */
  present(gl: THREE.WebGLRenderer): void {
    gl.setRenderTarget(null);
    gl.autoClear = true;
    gl.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}

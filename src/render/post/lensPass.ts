import type * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { POST } from '../../config/post';
import { fullScreenMaterial, type PostFrame, type PostPass } from './postPass';

/**
 * The lens finish (G5, QualitySettings.lensFinish), on the tone-mapped picture: a trace of colour fringing that grows
 * towards the corners (none in the middle, where you aim) and a fine film grain, strongest in the mid-tones, new each
 * frame. Last in the chain, so the temporal blend never smears the grain. From the concept's grade shader, without its
 * colour grade (the look stays the same on every preset).
 */
export class LensPass implements PostPass {
  readonly id = 'lens' as const;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor() {
    this.material = fullScreenMaterial(
      /* glsl */ `
      uniform sampler2D tColour;
      uniform float grain, fringe, seed;
      varying vec2 vUv;
      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      void main() {
        vec2 d = (vUv - 0.5) * dot(vUv - 0.5, vUv - 0.5) * fringe;
        vec3 c = vec3(texture2D(tColour, vUv - d).r, texture2D(tColour, vUv).g, texture2D(tColour, vUv + d).b);
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c += (hash12(gl_FragCoord.xy + seed) - 0.5) * grain * (1.0 - abs(l - 0.5) * 1.4);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
      { tColour: { value: null }, grain: { value: POST.lens.grain }, fringe: { value: POST.lens.fringe }, seed: { value: 0 } },
    );
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(): void {}

  render(gl: THREE.WebGLRenderer, frame: PostFrame, read: THREE.WebGLRenderTarget, write: THREE.WebGLRenderTarget | null): boolean {
    const u = this.material.uniforms;
    u.tColour!.value = read.texture;
    // A fresh grain each frame (a whole-pixel offset into the hash, kept small so float precision holds).
    u.seed!.value = (frame.index % POST.lens.grainCycle) * POST.lens.grainStride;
    gl.setRenderTarget(write);
    this.quad.render(gl);
    return true;
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}

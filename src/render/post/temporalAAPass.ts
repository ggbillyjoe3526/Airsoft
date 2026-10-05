import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { POST } from '../../config/post';
import { colourTarget, fullScreenMaterial, type PostFrame, type PostPass } from './postPass';

/** The `index`-th value (from 1) of the Halton sequence in `base`: low-discrepancy sub-pixel offsets in 0..1. */
export function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}

/** The jitter sequence: `count` (x, y) offsets in pixels, each in -0.5..0.5 (Halton 2 and 3, from the first). */
export function jitterSequence(count: number): Float32Array {
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    out[i * 2] = halton(i + 1, 2) - 0.5;
    out[i * 2 + 1] = halton(i + 1, 3) - 0.5;
  }
  return out;
}

/**
 * Moves `camera`'s projection by a sub-pixel offset (`dx`, `dy` pixels of a `width` × `height` drawing buffer): the
 * temporal blend's jitter. PostStack puts the projection back after the chain (the HUD, the overlay and every later
 * reader see the plain one).
 */
export function jitterProjection(camera: THREE.PerspectiveCamera, dx: number, dy: number, width: number, height: number): void {
  const e = camera.projectionMatrix.elements;
  e[8] += (dx * 2) / width;
  e[9] += (dy * 2) / height;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

/**
 * Temporal antialiasing (G5, QualitySettings.temporalAA). The scene is drawn with a jittered projection; each pixel's
 * place last frame is found from this frame's depth and the previous view-projection (the camera's motion; a moving
 * player has no motion vector, so their history is clipped to this frame's colours round the pixel, which leaves no
 * ghost), and the reprojected history is blended in. The blend writes the new history; a light sharpen draws it out.
 * The first-person replica is drawn after the whole chain (Renderer.render), so it is never blended or smeared.
 */
export class TemporalAAPass implements PostPass {
  readonly id = 'taa' as const;
  private readonly history: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private current = 0;
  /** No history yet (a new stack, a resize, a restored context): the next frame starts it from itself. */
  private valid = false;
  private readonly previousViewProjection = new THREE.Matrix4();
  private readonly resolve: THREE.ShaderMaterial;
  private readonly sharpen: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();

  constructor(width: number, height: number, type: THREE.TextureDataType) {
    this.history = [colourTarget(width, height, type), colourTarget(width, height, type)];
    this.resolve = fullScreenMaterial(
      /* glsl */ `
      uniform sampler2D tColour, tHistory;
      uniform highp sampler2D tDepth;
      uniform mat4 inverseViewProjection, previousViewProjection;
      uniform vec2 texel;
      uniform float history, hasHistory;
      varying vec2 vUv;
      vec3 toYCoCg(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
      vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
      // Bright pixels weigh less, so a lone highlight doesn't flicker through the blend.
      float weightOf(vec3 c) { return 1.0 / (1.0 + c.x); }
      void main() {
        vec3 centre = toYCoCg(texture2D(tColour, vUv).rgb);
        vec3 lo = centre, hi = centre;
        float depth = texture2D(tDepth, vUv).x;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            if (x == 0 && y == 0) continue;
            vec2 uv = vUv + vec2(float(x), float(y)) * texel;
            vec3 c = toYCoCg(texture2D(tColour, uv).rgb);
            lo = min(lo, c);
            hi = max(hi, c);
            // The nearest depth round the pixel: edges reproject with the thing in front.
            depth = min(depth, texture2D(tDepth, uv).x);
          }
        }
        vec4 world = inverseViewProjection * vec4(vec3(vUv, depth) * 2.0 - 1.0, 1.0);
        vec4 previous = previousViewProjection * vec4(world.xyz / world.w, 1.0);
        vec2 then = previous.xy / previous.w * 0.5 + 0.5;
        bool inside = hasHistory > 0.5 && all(greaterThanEqual(then, vec2(0.0))) && all(lessThanEqual(then, vec2(1.0)));
        if (!inside) { gl_FragColor = vec4(fromYCoCg(centre), 1.0); return; }
        vec3 past = clamp(toYCoCg(texture2D(tHistory, then).rgb), lo, hi);
        float wc = (1.0 - history) * weightOf(centre);
        float wp = history * weightOf(past);
        gl_FragColor = vec4(max(fromYCoCg((centre * wc + past * wp) / (wc + wp)), 0.0), 1.0);
      }`,
      {
        tColour: { value: null },
        tHistory: { value: null },
        tDepth: { value: null },
        inverseViewProjection: { value: new THREE.Matrix4() },
        previousViewProjection: { value: this.previousViewProjection },
        texel: { value: new THREE.Vector2() },
        history: { value: POST.taa.history },
        hasHistory: { value: 0 },
      },
    );
    this.sharpen = fullScreenMaterial(
      /* glsl */ `
      uniform sampler2D tColour;
      uniform vec2 texel;
      uniform float amount;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D(tColour, vUv).rgb;
        vec3 n = texture2D(tColour, vUv + vec2(0.0, texel.y)).rgb + texture2D(tColour, vUv - vec2(0.0, texel.y)).rgb
          + texture2D(tColour, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tColour, vUv - vec2(texel.x, 0.0)).rgb;
        gl_FragColor = vec4(max(c + (c * 4.0 - n) * amount, 0.0), 1.0);
      }`,
      { tColour: { value: null }, texel: { value: new THREE.Vector2() }, amount: { value: POST.taa.sharpen } },
    );
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    for (const t of this.history) t.setSize(width, height);
    this.resolve.uniforms.texel!.value.set(1 / width, 1 / height);
    this.sharpen.uniforms.texel!.value.set(1 / width, 1 / height);
    this.reset();
  }

  reset(): void {
    this.valid = false;
  }

  render(gl: THREE.WebGLRenderer, frame: PostFrame, read: THREE.WebGLRenderTarget, write: THREE.WebGLRenderTarget | null): boolean {
    if (!frame.depth) return false;
    const past = this.history[this.current]!;
    const next = this.history[1 - this.current]!;
    const r = this.resolve.uniforms;
    r.tColour!.value = read.texture;
    r.tHistory!.value = past.texture;
    r.tDepth!.value = frame.depth;
    r.inverseViewProjection!.value.copy(frame.inverseViewProjection);
    r.hasHistory!.value = this.valid ? 1 : 0;
    this.quad.material = this.resolve;
    gl.setRenderTarget(next);
    this.quad.render(gl);
    this.sharpen.uniforms.tColour!.value = next.texture;
    this.quad.material = this.sharpen;
    gl.setRenderTarget(write);
    this.quad.render(gl);
    this.previousViewProjection.copy(frame.viewProjection);
    this.current = 1 - this.current;
    this.valid = true;
    return true;
  }

  dispose(): void {
    for (const t of this.history) t.dispose();
    this.resolve.dispose();
    this.sharpen.dispose();
    this.quad.dispose();
  }
}

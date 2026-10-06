import * as THREE from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { POST } from '../../config/post';
import { AmbientOcclusionPass } from './ambientOcclusionPass';
import { LensPass } from './lensPass';
import { LightShaftsPass } from './lightShaftsPass';
import type { PostFrame, PostPass } from './postPass';
import { type PostPassId, planNeedsDepth, type PostQuality, postPlan, sceneSamples } from './postPlan';
import { ReflectionPass } from './reflectionPass';
import { jitterProjection, jitterSequence, TemporalAAPass } from './temporalAAPass';

/** What the stack is made for: the quality's post fields, and whether the context draws into half floats. */
export interface PostSetup {
  quality: PostQuality;
  /** EXT_color_buffer_half_float or _float: the picture keeps its brightness past 1 until tone mapping (else 8 bits). */
  halfFloat: boolean;
}

/** One of Three's own passes (bloom, output) in the stack's terms. */
class ThreePass implements PostPass {
  constructor(
    readonly id: PostPassId,
    private readonly pass: Pass,
  ) {}

  render(gl: THREE.WebGLRenderer, _frame: PostFrame, read: THREE.WebGLRenderTarget, write: THREE.WebGLRenderTarget | null): boolean {
    this.pass.renderToScreen = write === null;
    // Three's passes draw onto the screen themselves when renderToScreen; `write` is otherwise their target.
    this.pass.render(gl, write as THREE.WebGLRenderTarget, read, 0, false);
    return this.pass.needsSwap || write === null;
  }

  setSize(width: number, height: number): void {
    this.pass.setSize(width, height);
  }

  dispose(): void {
    this.pass.dispose();
  }
}

/** Three's bloom, also freeing its bright-pass material (its own dispose leaves that one, r186). */
class Bloom extends UnrealBloomPass {
  override dispose(): void {
    super.dispose();
    this.materialHighPassFilter.dispose();
  }
}

/**
 * Three's bloom with its bright-pass on the brightest channel instead of luminance (POST.bloom: saturated neon glows,
 * the sunlit scene doesn't), fading in over POST.bloom.softness.
 */
export function brightestChannelBloom(width: number, height: number): UnrealBloomPass {
  const b = POST.bloom;
  const pass = new Bloom(new THREE.Vector2(width, height), b.strength, b.radius, b.threshold);
  const highPass = pass.materialHighPassFilter;
  highPass.fragmentShader = highPass.fragmentShader.replace('luminance( texel.xyz )', 'max( texel.r, max( texel.g, texel.b ) )');
  (pass.highPassUniforms as Record<string, THREE.IUniform>).smoothWidth!.value = b.softness;
  return pass;
}

/**
 * The post stack (G5): the scene drawn into a target of its own (with a depth texture when a pass reads it), then the
 * plan's passes in order (render/post/postPlan.ts), the last onto the screen. Made by the Renderer for a quality, and
 * disposed whole on a quality change, a lost context and the antialiasing context swap; Low has none.
 */
export class PostStack {
  readonly plan: readonly PostPassId[];
  /** The scene draws here (the warm-up compiles for it: an off-screen target takes no tone mapping in the shaders). */
  readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly passes: PostPass[] = [];
  /** The two targets the chain alternates between after the scene's (made when a pass first draws out to one). */
  private readonly pingPong: [THREE.WebGLRenderTarget | null, THREE.WebGLRenderTarget | null] = [null, null];
  private readonly type: THREE.TextureDataType;
  private readonly reflection: ReflectionPass | null = null;
  private readonly jitter: Float32Array | null;
  private width: number;
  private height: number;
  private readonly frame: PostFrame;
  private readonly plainProjection = new THREE.Matrix4();

  constructor(setup: PostSetup, width: number, height: number) {
    this.width = width;
    this.height = height;
    this.plan = postPlan(setup.quality);
    this.type = setup.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const depth = planNeedsDepth(this.plan) ? new THREE.DepthTexture(width, height) : null;
    this.sceneTarget = new THREE.WebGLRenderTarget(width, height, { type: this.type, samples: sceneSamples(setup.quality), ...(depth ? { depthTexture: depth } : {}) });
    this.frame = {
      camera: new THREE.PerspectiveCamera(),
      depth,
      viewProjection: new THREE.Matrix4(),
      inverseViewProjection: new THREE.Matrix4(),
      jitter: new THREE.Vector2(),
      sun: new THREE.Vector3(0, 1, 0),
      night: false,
      index: 0,
    };
    for (const id of this.plan) {
      const pass = this.makePass(id, setup.quality, width, height);
      if (pass instanceof ReflectionPass) this.reflection = pass;
      this.passes.push(pass);
    }
    this.jitter = this.plan.includes('taa') ? jitterSequence(POST.taa.jitterSamples) : null;
  }

  /** The reflective meshes in the scene (render/post/reflectionPass.ts findReflective); ignored without reflections. */
  setReflectiveSurfaces(surfaces: readonly { mesh: THREE.Mesh; strength: number }[]): void {
    this.reflection?.setSurfaces(surfaces);
  }

  /** Whether the plan has reflections (the renderer looks for reflective meshes only then). */
  get wantsReflective(): boolean {
    return this.reflection !== null;
  }

  /** The key light (towards it, world space) and whether it is night: the light shafts follow them. */
  setLight(sun: THREE.Vector3, night: boolean): void {
    this.frame.sun.copy(sun).normalize();
    this.frame.night = night;
  }

  /** The drawing buffer's size in pixels (the window times the pixel ratio and the render scale). */
  setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.sceneTarget.setSize(width, height);
    for (const t of this.pingPong) t?.setSize(width, height);
    for (const p of this.passes) p.setSize(width, height);
  }

  /** Forgets the frames before (the temporal history): a restored context or a cut. */
  reset(): void {
    for (const p of this.passes) p.reset?.();
  }

  /**
   * Draws `scene` from `camera` through the chain onto the screen. The camera's projection is jittered for the scene and
   * the passes when the temporal blend is on, and put back before this returns.
   */
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const f = this.frame;
    f.camera = camera;
    camera.updateMatrixWorld();
    f.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    f.inverseViewProjection.copy(f.viewProjection).invert();
    const jitter = this.jitter;
    if (jitter) {
      this.plainProjection.copy(camera.projectionMatrix);
      const k = (f.index % (jitter.length / 2)) * 2;
      jitterProjection(camera, jitter[k]!, jitter[k + 1]!, this.width, this.height);
      f.jitter.set(jitter[k]! / this.width, jitter[k + 1]! / this.height);
    }
    gl.setRenderTarget(this.sceneTarget);
    const autoClear = gl.autoClear;
    gl.autoClear = true;
    gl.render(scene, camera);
    // The passes blend onto what is there or cover every pixel: nothing is cleared for them unless they ask.
    gl.autoClear = false;
    let read = this.sceneTarget;
    for (let i = 0; i < this.passes.length; i++) {
      const last = i === this.passes.length - 1;
      const write = last ? null : this.target(read === this.pingPong[0] ? 1 : 0);
      if (this.passes[i]!.render(gl, f, read, write) && write) read = write;
    }
    if (jitter) {
      camera.projectionMatrix.copy(this.plainProjection);
      camera.projectionMatrixInverse.copy(this.plainProjection).invert();
    }
    gl.autoClear = autoClear;
    gl.setRenderTarget(null);
    f.index++;
  }

  dispose(): void {
    for (const p of this.passes) p.dispose();
    this.passes.length = 0;
    this.sceneTarget.depthTexture?.dispose();
    this.sceneTarget.dispose();
    for (let i = 0; i < 2; i++) {
      this.pingPong[i]?.dispose();
      this.pingPong[i] = null;
    }
  }

  /** Ping-pong target `i`, made the first time it is drawn into. */
  private target(i: 0 | 1): THREE.WebGLRenderTarget {
    return (this.pingPong[i] ??= new THREE.WebGLRenderTarget(this.width, this.height, { type: this.type, depthBuffer: false }));
  }

  private makePass(id: PostPassId, q: PostQuality, width: number, height: number): PostPass {
    switch (id) {
      case 'ao':
        return new AmbientOcclusionPass(q.ambientOcclusion, width, height);
      case 'reflections':
        return new ReflectionPass(width, height);
      case 'lightShafts':
        return new LightShaftsPass(width, height, this.type);
      case 'taa':
        return new TemporalAAPass(width, height, this.type);
      case 'bloom':
        return new ThreePass(id, brightestChannelBloom(width, height));
      case 'output':
        return new ThreePass(id, new OutputPass());
      case 'lens':
        return new LensPass();
    }
  }
}

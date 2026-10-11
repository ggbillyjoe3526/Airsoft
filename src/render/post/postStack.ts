import * as THREE from 'three';
import { POST } from '../../config/post';
import { jitterProjection, jitterSequence } from './postHelpers';
import type { PostFrame, PostPass, PostRenderer } from './postPass';
import { type PostPassId, planNeedsDepth, type PostQuality, postPlan, sceneSamples } from './postPlan';

/** What the stack is made for: the quality's post fields, and whether the renderer draws into half floats. */
export interface PostSetup {
  quality: PostQuality;
  /** The picture keeps its brightness past 1 until tone mapping (else 8 bits). The node renderer always can. */
  halfFloat: boolean;
}

/** The reflective meshes a stack's reflections follow (render/webgpu/post/nodeReflections.ts setSurfaces). */
interface Reflective {
  setSurfaces(surfaces: readonly { mesh: THREE.Mesh; strength: number }[]): void;
}

/**
 * The post stack's chain (G5), whatever draws it: the scene drawn into a target of its own (with a depth texture when a
 * pass reads it), then the plan's passes in order (render/post/postPlan.ts), the last onto the screen. The passes are
 * render/webgpu/post/nodePostStack.ts's (W4; WebGL's GLSL passes went in W6). Made by the Renderer for a quality, and
 * disposed whole on a quality change, a map change and a lost device; Low has none.
 */
export abstract class PostChain<G extends PostRenderer<T>, T extends THREE.RenderTarget> {
  readonly plan: readonly PostPassId[];
  /** The scene draws here (the warm-up compiles for it: an off-screen target takes no tone mapping in the shaders). */
  readonly sceneTarget: T;
  protected readonly passes: PostPass<G, T>[] = [];
  /** The two targets the chain alternates between after the scene's (made when a pass first draws out to one). */
  private readonly pingPong: [T | null, T | null] = [null, null];
  protected readonly type: THREE.TextureDataType;
  private readonly reflection: Reflective | null = null;
  private readonly jitter: Float32Array | null;
  protected width: number;
  protected height: number;
  private readonly frame: PostFrame;
  private readonly plainProjection = new THREE.Matrix4();
  /** Where the camera was last frame (null before the first): a jump past POST.taa.cutDistance is a cut (BP2). */
  private lastCamera: THREE.Vector3 | null = null;

  constructor(setup: PostSetup, width: number, height: number) {
    this.width = width;
    this.height = height;
    this.plan = postPlan(setup.quality);
    this.type = setup.halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const depth = planNeedsDepth(this.plan) ? new THREE.DepthTexture(width, height) : null;
    this.sceneTarget = this.makeTarget(width, height, { type: this.type, samples: sceneSamples(setup.quality), ...(depth ? { depthTexture: depth } : {}) });
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
      if (id === 'reflections') this.reflection = pass as unknown as Reflective;
      this.passes.push(pass);
    }
    this.jitter = this.plan.includes('taa') ? jitterSequence(POST.taa.jitterSamples) : null;
  }

  /** A colour target of the renderer's kind (called from the constructor: it may read no field of a subclass). */
  protected abstract makeTarget(width: number, height: number, options: THREE.RenderTargetOptions): T;

  /** Pass `id` of the renderer's kind (called from the constructor, as makeTarget). */
  protected abstract makePass(id: PostPassId, q: PostQuality, width: number, height: number): PostPass<G, T>;

  /** Draws the resolved picture in `from` into ping-pong target 0 and returns that target. */
  protected abstract copyOut(gl: G, from: T): T;

  /** The reflective meshes in the scene (render/post/postHelpers.ts findReflective); ignored without reflections. */
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
  render(gl: G, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const f = this.frame;
    f.camera = camera;
    camera.updateMatrixWorld();
    // A cut (a new round's spawn, the next player watched) starts the temporal history afresh (BP2).
    if (!this.lastCamera) this.lastCamera = camera.position.clone();
    else if (this.lastCamera.distanceToSquared(camera.position) > POST.taa.cutDistance ** 2) this.reset();
    this.lastCamera.copy(camera.position);
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
      const pass = this.passes[i]!;
      if (pass.inPlace) {
        // Never blended onto the multisampled scene target: Three throws its samples away after each resolve
        // (invalidateFramebuffer), and where a driver honours that the blend lands on nothing (BP2). Copied out first.
        if (read === this.sceneTarget && read.samples > 0) read = this.copyOut(gl, read);
        pass.render(gl, f, read, null);
        continue;
      }
      const last = i === this.passes.length - 1;
      const write = last ? null : this.target(read === this.pingPong[0] ? 1 : 0);
      if (pass.render(gl, f, read, write) && write) read = write;
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
  protected target(i: 0 | 1): T {
    return (this.pingPong[i] ??= this.makeTarget(this.width, this.height, { type: this.type, depthBuffer: false }));
  }
}

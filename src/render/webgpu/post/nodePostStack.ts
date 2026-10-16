import * as THREE from 'three';
import type { NodeMaterial } from 'three/webgpu';
import type { PostPass } from '../../post/postPass';
import type { PostPassId, PostQuality } from '../../post/postPlan';
import { PostChain, type PostSetup } from '../../post/postStack';
import { NodeAmbientOcclusionPass } from './nodeAmbientOcclusion';
import { NodeBloomPass } from './nodeBloom';
import { type Finishing, type FinishingPass, NodeLensPass, NodeOutputPass } from './nodeFinish';
import { at, fullScreen, type NodeRenderer, type NodeTarget, CompileGate, quad, slot, vUv } from './nodeKit';
import { NodeLightShaftsPass } from './nodeLightShafts';
import { type DirectOutput, directTarget } from './nodeOutput';
import { NodeReflectionPass } from './nodeReflections';
import { NodeTemporalAAPass } from './nodeTemporalAA';

/** The held replica's scene and camera, drawn over the frame. */
export interface Overlay {
  scene: THREE.Scene;
  camera: THREE.Camera;
}

/** What the node backend draws a frame with: the post stack or the retro filter (render/webgpu/post/nodeRetro.ts). */
export interface NodeFrameDrawer {
  draw(gl: NodeRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: Overlay): void;
  /** Compiles the pipelines the frame will draw `scene` (and the overlay) with, ahead of it (not waited for). */
  compile(gl: NodeRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: Overlay): Promise<void>;
}

/**
 * The post stack on the node path (WebGPU overhaul W4): render/post/postStack.ts's chain (the same plan, targets, jitter
 * and order: PostChain) with each pass ported to TSL (render/webgpu/post/), so Medium, High and Ultra draw the same
 * picture with the same draws as on WebGL.
 *
 * Two differences from WebGL's frame, both to keep the draws equal: the renderer is told to leave the screen as the last
 * pass draws it (no tone mapping, the working colour space), or it would draw the chain's picture into a buffer of its
 * own and tone-map that in one more draw; and the held replica, which WebGL draws onto the canvas after the stack,
 * draws into a target of its own first (tone-mapped and encoded as it draws, nodeOutput.ts) which the last pass lays
 * on, because on a WebGPU device a full-screen draw onto the canvas skips the multisampled buffer a later draw would
 * resolve over it.
 */
export class NodePostStack extends PostChain<NodeRenderer, NodeTarget> implements NodeFrameDrawer {
  /** Copies the resolved multisampled scene out before an in-place pass (made the first time it is needed, BP2). */
  private copy: { material: NodeMaterial; colour: ReturnType<typeof slot> } | null = null;
  private readonly copyQuad = quad();
  /** The held replica's target (made the first frame one is drawn), and how the last pass finishes. */
  private overlayTarget: NodeTarget | null = null;
  /** The held replica's target holds a replica (drawn into since it was last cleared). */
  private overlayHeld = false;
  private readonly finishing: Finishing = { overlay: null, toneMapping: THREE.NoToneMapping };
  private readonly keep = new THREE.Color();
  constructor(
    setup: PostSetup,
    width: number,
    height: number,
    private readonly output: DirectOutput,
    /** The renderer's compiles under way, which dispose waits for (CompileGate). */
    private readonly compiles = new CompileGate(),
  ) {
    super(setup, width, height);
  }

  /** The stack's passes in order (tests). */
  get passList(): readonly PostPass<NodeRenderer, NodeTarget>[] {
    return this.passes;
  }

  /** The held replica's target, once made (tests). */
  get overlayBuffer(): NodeTarget | null {
    return this.overlayTarget;
  }

  draw(gl: NodeRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: Overlay): void {
    const mapping = gl.toneMapping;
    const colourSpace = gl.outputColorSpace;
    // The node renderer sets a camera's projection for its clip space on its first draw: before the jitter goes on.
    if (camera.coordinateSystem !== gl.coordinateSystem) {
      camera.coordinateSystem = gl.coordinateSystem;
      camera.updateProjectionMatrix();
    }
    const f = this.finishing;
    f.toneMapping = mapping;
    f.overlay = this.overlayTarget;
    if (overlay) {
      f.overlay = this.overlayFor(gl);
      this.output.drawInto(gl, f.overlay, overlay, mapping, this.keep);
      this.overlayHeld = true;
    } else if (this.overlayHeld) {
      // No replica (spectating): its target is cleared once and still laid on, so the last pass keeps the one material
      // it was built with rather than building the one without mid-match (BP3).
      this.clearOverlay(gl);
    }
    for (let i = 0; i < this.passes.length; i++) {
      const pass = this.passes[i]!;
      if (pass instanceof NodeOutputPass) pass.toneMapping = mapping;
      if (pass instanceof NodeOutputPass || pass instanceof NodeLensPass) pass.finishing = i === this.passes.length - 1 ? f : null;
    }
    gl.toneMapping = THREE.NoToneMapping;
    gl.outputColorSpace = THREE.ColorManagement.workingColorSpace;
    try {
      this.render(gl, scene, camera);
    } finally {
      gl.toneMapping = mapping;
      gl.outputColorSpace = colourSpace;
    }
  }

  compile(gl: NodeRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: Overlay): Promise<void> {
    gl.setRenderTarget(this.sceneTarget);
    const world = gl.compileAsync(scene, camera);
    gl.setRenderTarget(null);
    // The held replica is drawn into its target once, now, rather than compiled: Three builds a compile's draws after
    // an await, by when the renderer's own context is back, so they were all built again for the output hook on the
    // first frame (BP3). A real draw builds them under the hook, as each frame draws them.
    if (overlay) {
      this.output.drawInto(gl, this.overlayFor(gl), overlay, gl.toneMapping, this.keep);
      this.overlayHeld = true;
      gl.setRenderTarget(null);
    }
    const passes = this.compilePasses(gl, scene, camera);
    return this.compiles.track(Promise.all([world, passes]).then(() => undefined));
  }

  /**
   * Compiles the passes' pipelines ahead of the first frame (KI1; the BP3 review found about 20 built in it): the
   * frame's own `draw` runs once over the renderer with each draw turned into a compile, so every pass's quads compile
   * into the targets they draw into, under the state the frame sets; the world (compiled above) isn't drawn again, and
   * nothing reaches the screen. The temporal history that run leaves is forgotten. A compile builds its draws after an
   * await, by when the renderer's own output state is back, so the last pass's draw onto the canvas may still build on
   * the first frame; the reflections' mask waits for the reflective meshes, found on the first frame.
   */
  private compilePasses(gl: NodeRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void> {
    const pending: Promise<void>[] = [];
    const compileInstead = (object: THREE.Object3D, view: THREE.Camera): void => {
      if (object !== scene) pending.push(gl.compileAsync(object, view));
    };
    const compiling = new Proxy(gl, {
      get(target, key) {
        if (key === 'render') return compileInstead;
        const value: unknown = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set: (target, key, value) => Reflect.set(target, key, value),
    });
    this.draw(compiling, scene, camera);
    this.reset();
    return Promise.all(pending).then(() => undefined);
  }

  override setSize(width: number, height: number): void {
    super.setSize(width, height);
    this.overlayTarget?.setSize(this.width, this.height);
    // A resized target's contents are not to be trusted: cleared on the next frame without a replica.
    if (this.overlayTarget) this.overlayHeld = true;
  }

  /** Frees the targets and materials, once no compile is under way on the renderer (CompileGate). */
  override dispose(): void {
    this.compiles.afterCompiles(() => this.free());
  }

  private free(): void {
    super.dispose();
    this.copy?.material.dispose();
    this.copy = null;
    this.overlayTarget?.dispose();
    this.overlayTarget = null;
  }

  protected makeTarget(width: number, height: number, options: THREE.RenderTargetOptions): NodeTarget {
    return new THREE.RenderTarget(width, height, options);
  }

  protected copyOut(gl: NodeRenderer, from: NodeTarget): NodeTarget {
    if (!this.copy) {
      const colour = slot();
      this.copy = { material: fullScreen(at(colour, vUv)), colour };
    }
    const to = this.target(0);
    this.copy.colour.value = from.texture;
    this.copyQuad.material = this.copy.material;
    gl.setRenderTarget(to);
    this.copyQuad.render(gl);
    return to;
  }

  protected makePass(id: PostPassId, q: PostQuality, width: number, height: number): PostPass<NodeRenderer, NodeTarget> | FinishingPass {
    switch (id) {
      case 'ao':
        return new NodeAmbientOcclusionPass(q.ambientOcclusion, width, height);
      case 'reflections':
        return new NodeReflectionPass(width, height);
      case 'lightShafts':
        return new NodeLightShaftsPass(width, height, this.type);
      case 'taa':
        return new NodeTemporalAAPass(width, height, this.type);
      case 'bloom':
        return new NodeBloomPass(width, height);
      case 'output':
        return new NodeOutputPass();
      case 'lens':
        return new NodeLensPass();
    }
  }

  /** Empties the held replica's target (a frame without one). */
  private clearOverlay(gl: NodeRenderer): void {
    gl.getClearColor(this.keep);
    const alpha = gl.getClearAlpha();
    gl.setRenderTarget(this.overlayTarget);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.setClearColor(this.keep, alpha);
    this.overlayHeld = false;
  }

  /** The held replica's target: 8-bit as the canvas, multisampled as the canvas, with a depth buffer of its own. */
  private overlayFor(gl: NodeRenderer): NodeTarget {
    return (this.overlayTarget ??= directTarget(new THREE.RenderTarget(this.width, this.height, { samples: gl.samples, depthBuffer: true })));
  }
}

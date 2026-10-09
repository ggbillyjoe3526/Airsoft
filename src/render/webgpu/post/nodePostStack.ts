import * as THREE from 'three';
import type { NodeMaterial } from 'three/webgpu';
import type { PostPass } from '../../post/postPass';
import type { PostPassId, PostQuality } from '../../post/postPlan';
import { PostChain, type PostSetup } from '../../post/postStack';
import { NodeAmbientOcclusionPass } from './nodeAmbientOcclusion';
import { NodeBloomPass } from './nodeBloom';
import { type Finishing, type FinishingPass, NodeLensPass, NodeOutputPass } from './nodeFinish';
import { at, fullScreen, type NodeRenderer, type NodeTarget, quad, slot, vUv } from './nodeKit';
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
  private readonly finishing: Finishing = { overlay: null, toneMapping: THREE.NoToneMapping };
  private readonly keep = new THREE.Color();

  constructor(
    setup: PostSetup,
    width: number,
    height: number,
    private readonly output: DirectOutput,
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
    f.overlay = null;
    if (overlay) {
      f.overlay = this.overlayFor(gl);
      this.output.drawInto(gl, f.overlay, overlay, mapping, this.keep);
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
    if (!overlay) return world;
    const held = this.output.compileInto(gl, this.overlayFor(gl), overlay, gl.toneMapping);
    return Promise.all([world, held]).then(() => undefined);
  }

  override setSize(width: number, height: number): void {
    super.setSize(width, height);
    this.overlayTarget?.setSize(this.width, this.height);
  }

  override dispose(): void {
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

  /** The held replica's target: 8-bit as the canvas, multisampled as the canvas, with a depth buffer of its own. */
  private overlayFor(gl: NodeRenderer): NodeTarget {
    return (this.overlayTarget ??= directTarget(new THREE.RenderTarget(this.width, this.height, { samples: gl.samples, depthBuffer: true })));
  }
}

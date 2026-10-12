import * as THREE from 'three';
import { Fn, mix, output, rangeFogFactor, renderGroup, uniform, vec4 } from 'three/tsl';
import { type AnyNode, displayOf, type NodeRenderer, type NodeTarget } from './nodeKit';

/**
 * The node path's output step where WebGL has none of its own (WebGPU overhaul W4): every material tone-mapped and
 * encoded for the screen as it draws, as WebGL does when it draws straight to the canvas. Without it the node renderer
 * draws into a linear buffer of its own and tone-maps that in one more full-screen draw.
 *
 * - **Low** (no post stack): the world and the held replica draw straight onto the canvas, as on WebGL: no extra draw,
 *   and the haze goes on after the tone mapping (WebGL's `fog_fragment` follows `colorspace_fragment`), so fogged
 *   distance shades as WebGL's does, and see-through effects blend in the screen's colours as WebGL's do.
 * - **Medium and up**: the held replica draws this way into a target of its own (`overlayTarget`), which the stack's
 *   last pass lays over the picture: the replica as WebGL draws it onto the canvas after the stack, without a draw of
 *   its own for clearing the depth or tone-mapping it.
 *
 * Three/webgpu 0.186's `DirectRenderPipeline` does the first; it fogs before the tone mapping, un-premultiplies each
 * fragment and draws the background colour as a sphere, so this is its closest equivalent with WebGL's order: a
 * renderer context whose `getOutput` hook tone-maps and encodes each fragment, then mixes in the haze.
 *
 * While Low's frame is the direct draw, the hook stays the renderer's context and the late haze the scene's fog node
 * between frames too (`standDown` takes them off when a stack or the retro filter draws). A warm-up compile builds
 * each draw after an await, and Three keys a draw on the context: with the hook put back after each frame, the
 * compile built every draw but the first for the wrong context and the first frame built them all again (BP3).
 */

/**
 * A material that keeps some of its fragments out of the late haze (the sky host's plane, which its node patch draws
 * unfogged): given the haze's share, it returns the share it takes.
 */
export interface HoldsLateFog {
  lateFogShare(share: AnyNode): AnyNode;
}

/** The targets the output hook tone-maps into (directTarget). */
const directTargets = new WeakSet<NodeTarget>();

/** Marks a target the output hook tone-maps into (the held replica's, on the stack's presets). */
export function directTarget(target: NodeTarget): NodeTarget {
  directTargets.add(target);
  return target;
}

type SceneWithFogNode = THREE.Scene & { fogNode?: AnyNode };

export class DirectOutput {
  private context: AnyNode = null;
  private builtFor: THREE.ToneMapping | null = null;
  private base: AnyNode = null;
  /** The late fog node of each Fog the scene has had (the Renderer keeps one and changes it in place). */
  private readonly lateFogs = new WeakMap<THREE.Fog, AnyNode>();
  /** The background colour encoded for the screen, as WebGL clears with it. */
  private readonly background = new THREE.Color();
  /** What `enter` changed for the frame, for `leave` to put back. */
  private readonly kept: { mapping: THREE.ToneMapping; colourSpace: string; background: THREE.Scene['background'] } = {
    mapping: THREE.NoToneMapping,
    colourSpace: THREE.SRGBColorSpace,
    background: null,
  };
  /** The output hook is the renderer's context (Low's frame is the direct draw), and the scene given the late haze. */
  private installed = false;
  private fogged: SceneWithFogNode | null = null;

  /**
   * Draws `scene` (then `overlay` over it, after clearing the depth) straight onto the canvas with each material's
   * output tone-mapped and encoded (Low's frame).
   */
  drawScreen(renderer: NodeRenderer, scene: THREE.Scene, camera: THREE.Camera, overlay?: { scene: THREE.Scene; camera: THREE.Camera }): void {
    this.enter(renderer, scene);
    try {
      renderer.setRenderTarget(null);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      if (overlay) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(overlay.scene, overlay.camera);
      }
    } finally {
      this.leave(renderer, scene);
    }
  }

  /** Draws `overlay` into `target` (a directTarget), cleared to nothing first, tone-mapped and encoded as it draws. */
  drawInto(renderer: NodeRenderer, target: NodeTarget, overlay: { scene: THREE.Scene; camera: THREE.Camera }, mapping: THREE.ToneMapping, keep: THREE.Color): void {
    renderer.getClearColor(keep);
    const alpha = renderer.getClearAlpha();
    const context = renderer.contextNode;
    renderer.contextNode = this.contextFor(renderer, mapping);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.render(overlay.scene, overlay.camera);
    renderer.contextNode = context;
    renderer.setClearColor(keep, alpha);
  }

  /** Compiles `scene` (and the overlay) for drawScreen ahead of their first frame (not waited for). */
  compile(renderer: NodeRenderer, scene: THREE.Scene, camera: THREE.Camera, overlay?: { scene: THREE.Scene; camera: THREE.Camera }): Promise<void> {
    let world: Promise<void> = Promise.resolve();
    let held: Promise<void> = Promise.resolve();
    // compileAsync makes every pipeline's program at once, under the state set here; only the pipelines are awaited.
    this.enter(renderer, scene);
    try {
      renderer.setRenderTarget(null);
      world = renderer.compileAsync(scene, camera);
      if (overlay) held = renderer.compileAsync(overlay.scene, overlay.camera);
    } finally {
      this.leave(renderer, scene);
    }
    return Promise.all([world, held]).then(() => undefined);
  }

  /**
   * A stack or the retro filter draws the frame: the renderer's own context back, and the scene's own fog (each a
   * no-op while the direct draw is not in use). Every frame, so the call costs a check.
   */
  standDown(renderer: NodeRenderer): void {
    if (this.installed) {
      renderer.contextNode = this.base;
      this.installed = false;
    }
    this.unfog();
  }

  /** Lets go of the hooks; the scene keeps no late haze (it may outlive this renderer: a lost device's replacement). */
  dispose(): void {
    this.unfog();
    this.installed = false;
    this.context = null;
    this.base = null;
    this.builtFor = null;
  }

  /**
   * Sets the canvas to take each material's own output (no tone-mapping buffer, the late haze, the background encoded),
   * keeping what it changes for `leave` (fields, not a closure: nothing allocated a frame). The hook and the haze stay
   * on after it (standDown).
   */
  private enter(renderer: NodeRenderer, scene: THREE.Scene): void {
    const kept = this.kept;
    kept.mapping = renderer.toneMapping;
    kept.colourSpace = renderer.outputColorSpace;
    kept.background = scene.background;
    if (this.fogged !== scene) this.unfog();
    if (scene.fog instanceof THREE.Fog) {
      const fog = scene.fog;
      const late = this.lateFog(fog);
      late.near.value = fog.near;
      late.far.value = fog.far;
      // WebGL hands an unlit colour drawn to the screen over encoded for it (getUnlitUniformColorSpace): the haze too.
      late.colour.value.copy(fog.color).convertLinearToSRGB();
      (scene as SceneWithFogNode).fogNode = late;
      this.fogged = scene;
    } else this.unfog();
    // WebGL clears with the background colour encoded for the screen; the node renderer clears with what it is given.
    if (kept.background instanceof THREE.Color) scene.background = this.background.copy(kept.background).convertLinearToSRGB();
    renderer.contextNode = this.contextFor(renderer, kept.mapping);
    this.installed = true;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.ColorManagement.workingColorSpace;
  }

  /** Puts back what `enter` changed for the frame (not the hook nor the haze: standDown). */
  private leave(renderer: NodeRenderer, scene: THREE.Scene): void {
    const kept = this.kept;
    renderer.toneMapping = kept.mapping;
    renderer.outputColorSpace = kept.colourSpace;
    scene.background = kept.background;
    kept.background = null;
  }

  /** The scene given the late haze has its own fog again. */
  private unfog(): void {
    if (this.fogged) this.fogged.fogNode = null;
    this.fogged = null;
  }

  /** The renderer context whose output hook tone-maps with `mapping` (made again when the tone mapping changes). */
  private contextFor(renderer: NodeRenderer, mapping: THREE.ToneMapping): AnyNode {
    if (this.context && this.builtFor === mapping) return this.context;
    if (!this.context) this.base = renderer.contextNode;
    this.builtFor = mapping;
    this.context = this.base.context({
      getOutput: (out: AnyNode, builder: AnyNode) => {
        const target = builder.renderer.getRenderTarget();
        // Only what reaches the screen (or the held replica's target): never a shadow map or another off-screen pass.
        if (target !== null && !directTargets.has(target)) return out;
        let rgb = displayOf(out.rgb, mapping);
        const fog = builder.fogNode;
        const material = builder.material as (THREE.Material & { fog?: boolean } & Partial<HoldsLateFog>) | null;
        if (material?.fog === true && fog?.lateFog === true) {
          // The range fog's share, as WebGL's fog_fragment works it out, mixed in after the tone mapping as there.
          let share = rangeFogFactor(fog.near, fog.far);
          if (material.lateFogShare) share = material.lateFogShare(share);
          rgb = mix(rgb, fog.colour, share);
        }
        return vec4(rgb, out.a);
      },
    });
    return this.context;
  }

  /**
   * The scene's haze for drawScreen: no haze in the material (its colour goes out as lit), and what the output hook
   * needs to add it after the tone mapping: the fog's near, far and colour (encoded for the screen), set by `enter` each
   * frame. Uniforms of the render group, as Three's own fog's: a `reference` to the fog keeps the value it was built
   * with in the output hook (0.186).
   */
  private lateFog(fog: THREE.Fog): AnyNode {
    let node = this.lateFogs.get(fog);
    if (!node) {
      node = Fn(() => output)();
      node.lateFog = true;
      node.near = uniform(fog.near).setGroup(renderGroup);
      node.far = uniform(fog.far).setGroup(renderGroup);
      node.colour = uniform(new THREE.Color()).setGroup(renderGroup);
      this.lateFogs.set(fog, node);
    }
    return node;
  }
}

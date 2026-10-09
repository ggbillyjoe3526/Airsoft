import * as THREE from 'three';
import type { NodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { POST } from '../../../config/post';
import type { PostFrame, PostPass } from '../../post/postPass';
import { type AnyNode, at, displayOf, fullScreen, type NodeRenderer, type NodeTarget, quad, slot, vUv } from './nodeKit';

const { abs, clamp, dot, float, fract, Fn, screenCoordinate, screenSize, texture, uniform, vec2, vec3, vec4 } = TSL as AnyNode;

/**
 * What the stack tells the pass that draws onto the screen (output, or the lens finish on Ultra): the held replica's
 * target to lay over the picture (null without one this frame), and the renderer's tone mapping.
 */
export interface Finishing {
  overlay: NodeTarget | null;
  toneMapping: THREE.ToneMapping;
}

/** A pass that can be last: it lays the held replica over what it draws when told to. */
export interface FinishingPass extends PostPass<NodeRenderer, NodeTarget> {
  finishing: Finishing | null;
}

/**
 * `rgb` with the held replica laid over it: the replica's target holds its colours as WebGL draws them onto the canvas
 * (tone-mapped, encoded and blended there, render/webgpu/post/nodeOutput.ts drawInto) over nothing, so this is the
 * same picture as WebGL's replica drawn over the finished frame (blending with "over", opaque where it is solid).
 */
function overlaid(rgb: AnyNode, overlay: NodeTarget): AnyNode {
  const o = at(texture(overlay.texture), vUv);
  return rgb.mul(float(1).sub(o.a)).add(o.rgb);
}

/**
 * The materials of a last pass for each tone mapping and overlay target it has been drawn with (made the first time:
 * a settings change, not per frame).
 */
class FinishMaterials {
  private readonly made = new Map<string, NodeMaterial>();
  /** The last one asked for: a frame like the last finds it without a lookup (nothing allocated a frame). */
  private last: { mapping: THREE.ToneMapping; overlay: NodeTarget | null; material: NodeMaterial } | null = null;

  constructor(private readonly make: (mapping: THREE.ToneMapping, overlay: NodeTarget | null) => NodeMaterial) {}

  get(mapping: THREE.ToneMapping, overlay: NodeTarget | null): NodeMaterial {
    const last = this.last;
    if (last && last.mapping === mapping && last.overlay === overlay) return last.material;
    const key = overlay ? `${mapping}:${overlay.texture.id}` : `${mapping}`;
    let m = this.made.get(key);
    if (!m) this.made.set(key, (m = this.make(mapping, overlay)));
    this.last = { mapping, overlay, material: m };
    return m;
  }

  dispose(): void {
    for (const m of this.made.values()) m.dispose();
    this.made.clear();
    this.last = null;
  }
}

/**
 * The output step on the node path (W4): Three's OutputPass in TSL, the picture tone-mapped with the renderer's
 * mapping and exposure and encoded for the screen, in one draw (the renderer itself is told to leave the screen as
 * drawn: render/webgpu/post/nodePostStack.ts). Last on Medium and High, where it also lays the held replica on.
 */
export class NodeOutputPass implements FinishingPass {
  readonly id = 'output' as const;
  readonly inPlace = false;
  finishing: Finishing | null = null;
  /** Tone mapping when not last (Ultra, before the lens finish), set by the stack each frame. */
  toneMapping: THREE.ToneMapping = THREE.NeutralToneMapping;
  private readonly colour = slot();
  private readonly quad = quad();
  private readonly materials = new FinishMaterials((mapping, overlay) => {
    const rgb = displayOf(at(this.colour, vUv).rgb, mapping);
    return fullScreen(vec4(overlay ? overlaid(rgb, overlay) : rgb, 1));
  });

  setSize(): void {}

  render(gl: NodeRenderer, _frame: PostFrame, read: NodeTarget, write: NodeTarget | null): boolean {
    const f = this.finishing;
    this.colour.value = read.texture;
    this.quad.material = this.materials.get(f ? f.toneMapping : this.toneMapping, f?.overlay ?? null);
    gl.setRenderTarget(write);
    this.quad.render(gl);
    return true;
  }

  dispose(): void {
    this.materials.dispose();
  }
}

/** The lens finish's grain hash (render/post/lensPass.ts `hash12`, Dave Hoskins' hash without sine). */
const hash12 = (p: AnyNode): AnyNode => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
};

/**
 * The lens finish on the node path (W4): render/post/lensPass.ts in TSL, the same fringe and the same grain at the same
 * pixels (GL's `gl_FragCoord`, rows from the bottom, so the pattern lands where WebGL's does). Last on Ultra, where it
 * also lays the held replica on.
 */
export class NodeLensPass implements FinishingPass {
  readonly id = 'lens' as const;
  readonly inPlace = false;
  finishing: Finishing | null = null;
  private readonly colour = slot();
  private readonly seed = uniform(0);
  private readonly quad = quad();
  private readonly materials = new FinishMaterials((_mapping, overlay) => {
    const colour = this.colour;
    const seed = this.seed;
    const rgb = Fn(() => {
      const fromCentre = vUv.sub(0.5);
      const d = fromCentre.mul(dot(fromCentre, fromCentre)).mul(POST.lens.fringe).toVar();
      const c = vec3(at(colour, vUv.sub(d)).r, at(colour, vUv).g, at(colour, vUv.add(d)).b).toVar();
      const l = dot(c, vec3(0.299, 0.587, 0.114));
      const fragCoord = vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y));
      c.addAssign(hash12(fragCoord.add(seed)).sub(0.5).mul(POST.lens.grain).mul(float(1).sub(abs(l.sub(0.5)).mul(1.4))));
      return clamp(c, 0, 1);
    })();
    return fullScreen(vec4(overlay ? overlaid(rgb, overlay) : rgb, 1));
  });

  setSize(): void {}

  render(gl: NodeRenderer, frame: PostFrame, read: NodeTarget, write: NodeTarget | null): boolean {
    this.colour.value = read.texture;
    // A fresh grain each frame (a whole-pixel offset into the hash, kept small so float precision holds).
    this.seed.value = (frame.index % POST.lens.grainCycle) * POST.lens.grainStride;
    const f = this.finishing;
    // The lens finish works on the finished picture: the tone mapping is not its business.
    this.quad.material = this.materials.get(THREE.NoToneMapping, f?.overlay ?? null);
    gl.setRenderTarget(write);
    this.quad.render(gl);
    return true;
  }

  dispose(): void {
    this.materials.dispose();
  }
}

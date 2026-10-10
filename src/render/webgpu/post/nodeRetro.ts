import * as THREE from 'three';
import type { NodeMaterial } from 'three/webgpu';
import { tsl } from './tsl';
import type { RetroLook } from '../../../config/render';
import { retroTargetSize, type RetroView } from '../../retroFilter';
import { type AnyNode, at, displayOf, fullScreen, type NodeRenderer, type NodeTarget, CompileGate, quad } from './nodeKit';
import type { NodeFrameDrawer, Overlay } from './nodePostStack';

const { abs, clamp, floor, Fn, min, mod, screenCoordinate, screenSize, texture, uniform, vec2, vec3, vec4 } = tsl;

const bayer2 = (c: AnyNode): AnyNode => abs(c.x.sub(c.y)).mul(2).add(c.y);
/** The 4×4 ordered-dither threshold of retro pixel `p` (render/retroFilter.ts bayerThreshold). */
const bayer4 = (p: AnyNode): AnyNode => {
  const c = mod(p, 4).toVar();
  return bayer2(mod(c, 2)).mul(4).add(bayer2(floor(c.div(2)))).add(0.5).div(16);
};

/**
 * The retro pixel filter on the node path (W4): render/retroFilter.ts's, drawn the same way. The frame (world, then the
 * held replica after clearing the depth) goes into the same small half-float target, a texel per retro pixel, then one
 * full-screen draw shows it on the canvas: each retro pixel's texel tone-mapped, encoded and crushed to the look's
 * levels with the same 4×4 Bayer threshold, at the same pixels (GL's `gl_FragCoord`, rows from the bottom).
 */
export class NodeRetroFilter implements RetroView, NodeFrameDrawer {
  private readonly target: NodeTarget;
  private look: RetroLook;
  private readonly quad = quad();
  /** One present material per tone mapping it has been drawn with (a settings change makes the next). */
  private readonly present = new Map<THREE.ToneMapping, NodeMaterial>();
  private readonly u = { viewSize: uniform(new THREE.Vector2(1, 1)), pixel: uniform(1), levels: uniform(2) };
  constructor(
    look: RetroLook,
    /** The renderer's compiles under way, which dispose waits for (CompileGate). */
    private readonly compiles = new CompileGate(),
  ) {
    this.look = { ...look };
    this.target = new THREE.RenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
    this.u.pixel.value = look.pixelSize;
    this.u.levels.value = look.levels;
  }

  /** A new pixel size or colour count; the target's size follows on the next `resize`. */
  setLook(look: RetroLook): void {
    this.look.pixelSize = look.pixelSize;
    this.look.levels = look.levels;
    this.u.levels.value = look.levels;
  }

  /** The page's size in CSS pixels and the canvas's pixel ratio: the target is sized to the retro pixels covering it. */
  resize(width: number, height: number, pixelRatio: number): void {
    const size = retroTargetSize(width, height, this.look.pixelSize);
    this.target.setSize(size.width, size.height);
    this.u.viewSize.value.set(size.width, size.height);
    this.u.pixel.value = this.look.pixelSize * pixelRatio;
  }

  /** What the frame draws into before the present (tests). */
  get renderTarget(): NodeTarget {
    return this.target;
  }

  draw(gl: NodeRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: Overlay): void {
    gl.setRenderTarget(this.target);
    gl.autoClear = true;
    gl.render(scene, camera);
    if (overlay) {
      gl.autoClear = false;
      gl.clearDepth();
      gl.render(overlay.scene, overlay.camera);
    }
    // The present writes the screen's colours itself: the renderer leaves them as drawn (no tone-mapping buffer).
    const mapping = gl.toneMapping;
    const colourSpace = gl.outputColorSpace;
    this.quad.material = this.materialFor(mapping);
    gl.toneMapping = THREE.NoToneMapping;
    gl.outputColorSpace = THREE.ColorManagement.workingColorSpace;
    gl.setRenderTarget(null);
    gl.autoClear = true;
    this.quad.render(gl);
    gl.toneMapping = mapping;
    gl.outputColorSpace = colourSpace;
  }

  compile(gl: NodeRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlay?: Overlay): Promise<void> {
    gl.setRenderTarget(this.target);
    const world = gl.compileAsync(scene, camera);
    const held = overlay ? gl.compileAsync(overlay.scene, overlay.camera) : Promise.resolve();
    gl.setRenderTarget(null);
    return this.compiles.track(Promise.all([world, held]).then(() => undefined));
  }

  /** Frees the target and materials, once no compile is under way on the renderer (CompileGate). */
  dispose(): void {
    this.compiles.afterCompiles(() => this.free());
  }

  private free(): void {
    this.target.dispose();
    for (const m of this.present.values()) m.dispose();
    this.present.clear();
  }

  private materialFor(mapping: THREE.ToneMapping): NodeMaterial {
    let m = this.present.get(mapping);
    if (m) return m;
    const { viewSize, pixel, levels } = this.u;
    const view = texture(this.target.texture);
    m = fullScreen(
      Fn(() => {
        const fragCoord = vec2(screenCoordinate.x, screenSize.y.sub(screenCoordinate.y));
        const texel = floor(fragCoord.div(pixel)).toVar();
        const c = clamp(displayOf(at(view, texel.add(0.5).div(viewSize)).rgb, mapping), 0, 1).toVar();
        const steps = levels.sub(1).toVar();
        return vec4(min(vec3(steps), floor(c.mul(steps).add(bayer4(texel)))).div(steps), 1);
      })(),
    );
    this.present.set(mapping, m);
    return m;
  }
}

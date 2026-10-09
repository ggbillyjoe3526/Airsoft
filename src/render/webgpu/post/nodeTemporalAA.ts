import * as THREE from 'three';
import type { NodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { POST } from '../../../config/post';
import type { PostFrame, PostPass } from '../../post/postPass';
import { type AnyNode, at, depthAt, clipAt, colourTarget, fullScreen, type NodeRenderer, type NodeTarget, quad, slot, vUv } from './nodeKit';

const { clamp, dot, float, Fn, max, min, uniform, vec2, vec3, vec4 } = TSL as AnyNode;

const toYCoCg = (c: AnyNode): AnyNode => vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25)));
const fromYCoCg = (c: AnyNode): AnyNode => vec3(c.x.add(c.y).sub(c.z), c.x.add(c.z), c.x.sub(c.y).sub(c.z));
/** Bright pixels weigh less, so a lone highlight doesn't flicker through the blend. */
const weightOf = (c: AnyNode): AnyNode => float(1).div(float(1).add(c.x));

/**
 * Temporal antialiasing on the node path (W4): render/post/temporalAAPass.ts in TSL, the same resolve (this frame's
 * 3×3 colour box in YCoCg clipping the history, reprojected through the nearest depth and last frame's view) into the
 * same pair of history targets, then the same sharpen out. Three's `TRAANode` reads velocity from a second render
 * target (MRT) and blends differently, so this ports WebGL's; the stack jitters the projection for both alike.
 */
export class NodeTemporalAAPass implements PostPass<NodeRenderer, NodeTarget> {
  readonly id = 'taa' as const;
  readonly inPlace = false;
  private readonly history: [NodeTarget, NodeTarget];
  private current = 0;
  /** No history yet (a new stack, a resize, a restored device): the next frame starts it from itself. */
  private valid = false;
  private readonly resolve: NodeMaterial;
  private readonly sharpen: NodeMaterial;
  private readonly colour = slot();
  private readonly past = slot();
  private readonly depth = slot();
  private readonly resolved = slot();
  private readonly quad = quad();
  private readonly u = {
    inverseViewProjection: uniform(new THREE.Matrix4()),
    previousViewProjection: uniform(new THREE.Matrix4()),
    texel: uniform(new THREE.Vector2()),
    jitter: uniform(new THREE.Vector2()),
    previousJitter: uniform(new THREE.Vector2()),
    hasHistory: uniform(0),
  };

  constructor(width: number, height: number, type: THREE.TextureDataType) {
    this.history = [colourTarget(width, height, type), colourTarget(width, height, type)];
    const { inverseViewProjection, previousViewProjection, texel, jitter, previousJitter, hasHistory } = this.u;
    const colour = this.colour;
    const sceneDepth = (u: AnyNode): AnyNode => depthAt(this.depth, u);
    this.resolve = fullScreen(
      Fn(() => {
        const centre = toYCoCg(at(colour, vUv).rgb).toVar();
        const lo = centre.toVar();
        const hi = centre.toVar();
        const depth = sceneDepth(vUv).toVar();
        for (let y = -1; y <= 1; y++) {
          for (let x = -1; x <= 1; x++) {
            if (x === 0 && y === 0) continue;
            const uv = vUv.add(vec2(x, y).mul(texel)).toVar();
            const c = toYCoCg(at(colour, uv).rgb).toVar();
            lo.assign(min(lo, c));
            hi.assign(max(hi, c));
            // The nearest depth round the pixel: edges reproject with the thing in front.
            depth.assign(min(depth, sceneDepth(uv)));
          }
        }
        // Without this frame's jitter to find the point, with last frame's to find it in the history (drawn jittered).
        const world = inverseViewProjection.mul(clipAt(vUv.sub(jitter), depth)).toVar();
        const previous = previousViewProjection.mul(vec4(world.xyz.div(world.w), 1)).toVar();
        const then = previous.xy.div(previous.w).mul(0.5).add(0.5).add(previousJitter).toVar();
        const inside = hasHistory.greaterThan(0.5).and(then.x.greaterThanEqual(0)).and(then.y.greaterThanEqual(0)).and(then.x.lessThanEqual(1)).and(then.y.lessThanEqual(1));
        const past = clamp(toYCoCg(at(this.past, then).rgb), lo, hi).toVar();
        const wc = float(1 - POST.taa.history).mul(weightOf(centre)).toVar();
        const wp = float(POST.taa.history).mul(weightOf(past)).toVar();
        const blended = max(fromYCoCg(centre.mul(wc).add(past.mul(wp)).div(wc.add(wp))), 0);
        return vec4(inside.select(blended, fromYCoCg(centre)), 1);
      })(),
    );
    const resolved = this.resolved;
    this.sharpen = fullScreen(
      Fn(() => {
        const c = at(resolved, vUv).rgb.toVar();
        const dy = vec2(0, texel.y);
        const dx = vec2(texel.x, 0);
        const n = at(resolved, vUv.add(dy)).rgb.add(at(resolved, vUv.sub(dy)).rgb).add(at(resolved, vUv.add(dx)).rgb).add(at(resolved, vUv.sub(dx)).rgb);
        return vec4(max(c.add(c.mul(4).sub(n).mul(POST.taa.sharpen)), 0), 1);
      })(),
    );
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    for (const t of this.history) t.setSize(width, height);
    this.u.texel.value.set(1 / width, 1 / height);
    this.reset();
  }

  reset(): void {
    this.valid = false;
  }

  render(gl: NodeRenderer, frame: PostFrame, read: NodeTarget, write: NodeTarget | null): boolean {
    if (!frame.depth) return false;
    const past = this.history[this.current]!;
    const next = this.history[1 - this.current]!;
    const u = this.u;
    this.colour.value = read.texture;
    this.past.value = past.texture;
    this.depth.value = frame.depth;
    u.inverseViewProjection.value.copy(frame.inverseViewProjection);
    u.jitter.value.copy(frame.jitter);
    u.hasHistory.value = this.valid ? 1 : 0;
    this.quad.material = this.resolve;
    gl.setRenderTarget(next);
    this.quad.render(gl);
    this.resolved.value = next.texture;
    this.quad.material = this.sharpen;
    gl.setRenderTarget(write);
    this.quad.render(gl);
    u.previousViewProjection.value.copy(frame.viewProjection);
    u.previousJitter.value.copy(frame.jitter);
    this.current = 1 - this.current;
    this.valid = true;
    return true;
  }

  dispose(): void {
    for (const t of this.history) t.dispose();
    this.resolve.dispose();
    this.sharpen.dispose();
  }
}

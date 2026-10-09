import * as THREE from 'three';
import type { NodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { POST } from '../../../config/post';
import type { PostFrame, PostPass } from '../../post/postPass';
import { type AnyNode, at, fullScreen, type NodeRenderer, type NodeTarget, quad, slot, vUv } from './nodeKit';

const { float, Fn, max, mix, smoothstep, texture, uniform, vec2, vec3, vec4 } = TSL as AnyNode;

const B = POST.bloom;
/** UnrealBloomPass's mips, their blur kernels' radii and their weights in the composite. */
const MIPS = 5;
const KERNELS = [6, 10, 14, 18, 22];
const FACTORS = [1.0, 0.8, 0.6, 0.4, 0.2];

/**
 * UnrealBloomPass's separable blur of `radius` taps (r186): the centre weight, then each pair of neighbouring taps
 * merged into one bilinear read at `offsets[i]` texels with `weights[i]`.
 */
export function bloomKernel(radius: number): { centre: number; offsets: number[]; weights: number[] } {
  const sigma = radius / 3;
  const c: number[] = [];
  for (let i = 0; i < radius; i++) c.push((0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma);
  const offsets: number[] = [];
  const weights: number[] = [];
  for (let i = 1; i < radius; i += 2) {
    const wa = c[i]!;
    const wb = i + 1 < radius ? c[i + 1]! : 0;
    offsets.push((i * wa + (i + 1) * wb) / (wa + wb));
    weights.push(wa + wb);
  }
  return { centre: c[0]!, offsets, weights };
}

/** The sizes of UnrealBloomPass's mips for a `width` × `height` buffer: half, then halved again, rounded each time. */
export function bloomMipSizes(width: number, height: number): { width: number; height: number }[] {
  const out: { width: number; height: number }[] = [];
  let w = Math.round(width / 2);
  let h = Math.round(height / 2);
  for (let i = 0; i < MIPS; i++) {
    out.push({ width: w, height: h });
    w = Math.round(w / 2);
    h = Math.round(h / 2);
  }
  return out;
}

const halfFloatTarget = (): NodeTarget => new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

/**
 * Bloom on the node path (W4): the game's bloom (Three's UnrealBloomPass with its bright pass on the brightest channel,
 * render/post/postStack.ts brightestChannelBloom) in TSL, with the same draws: the bright pass at half size, five mips
 * each blurred across then down with the same kernels, the composite, and the additive blend back onto the picture.
 * Three/webgpu 0.186's `BloomNode` is a different bloom (a 3× weaker composite, luminance bright pass, its own sizes),
 * so this ports WebGL's.
 */
export class NodeBloomPass implements PostPass<NodeRenderer, NodeTarget> {
  readonly id = 'bloom' as const;
  readonly inPlace = true;
  private readonly bright = halfFloatTarget();
  private readonly horizontal: NodeTarget[] = [];
  private readonly vertical: NodeTarget[] = [];
  private readonly invSize: AnyNode[] = [];
  private readonly highPass: NodeMaterial;
  /** Per mip, the blur across and the blur down (each reads a fixed target: no texture changes hands per frame). */
  private readonly blurs: [NodeMaterial, NodeMaterial][] = [];
  private readonly composite: NodeMaterial;
  private readonly blend: NodeMaterial;
  private readonly colour = slot();
  private readonly quad = quad();

  constructor(width: number, height: number) {
    for (let i = 0; i < MIPS; i++) {
      this.horizontal.push(halfFloatTarget());
      this.vertical.push(halfFloatTarget());
      this.invSize.push(uniform(new THREE.Vector2()));
    }
    const texel = at(this.colour, vUv);
    const v = max(texel.r, max(texel.g, texel.b));
    this.highPass = fullScreen(mix(vec4(0), texel, smoothstep(B.threshold, B.threshold + B.softness, v)));
    for (let i = 0; i < MIPS; i++) {
      const input = i === 0 ? this.bright : this.vertical[i - 1]!;
      this.blurs.push([this.blur(input, KERNELS[i]!, i, vec2(1, 0)), this.blur(this.horizontal[i]!, KERNELS[i]!, i, vec2(0, 1))]);
    }
    let sum: AnyNode = vec3(0);
    for (let i = 0; i < MIPS; i++) {
      const factor = mix(float(FACTORS[i]!), float(1.2 - FACTORS[i]!), B.radius);
      sum = sum.add(at(texture(this.vertical[i]!.texture), vUv).rgb.mul(factor));
    }
    // 3.0 as UnrealBloomPass (its "backwards compatibility with previous alpha-based intensity").
    this.composite = fullScreen(
      Fn(() => {
        const bloom = sum.mul(3 * B.strength).toVar();
        return vec4(bloom, max(bloom.r, max(bloom.g, bloom.b)));
      })(),
    );
    // Added as UnrealBloomPass adds it (one and one): alpha 1, so the node material's premultiply leaves the colour be.
    this.blend = fullScreen(vec4(at(texture(this.horizontal[0]!.texture), vUv).rgb, 1), { blending: THREE.AdditiveBlending, premultipliedAlpha: true, transparent: true });
    this.setSize(width, height);
  }

  setSize(width: number, height: number): void {
    const sizes = bloomMipSizes(width, height);
    this.bright.setSize(sizes[0]!.width, sizes[0]!.height);
    for (let i = 0; i < MIPS; i++) {
      const s = sizes[i]!;
      this.horizontal[i]!.setSize(s.width, s.height);
      this.vertical[i]!.setSize(s.width, s.height);
      this.invSize[i]!.value.set(1 / s.width, 1 / s.height);
    }
  }

  render(gl: NodeRenderer, _frame: PostFrame, read: NodeTarget): boolean {
    this.colour.value = read.texture;
    this.draw(gl, this.highPass, this.bright);
    for (let i = 0; i < MIPS; i++) {
      this.draw(gl, this.blurs[i]![0], this.horizontal[i]!);
      this.draw(gl, this.blurs[i]![1], this.vertical[i]!);
    }
    this.draw(gl, this.composite, this.horizontal[0]!);
    this.draw(gl, this.blend, read);
    return false;
  }

  dispose(): void {
    this.bright.dispose();
    for (const t of [...this.horizontal, ...this.vertical]) t.dispose();
    this.highPass.dispose();
    for (const [h, v] of this.blurs) {
      h.dispose();
      v.dispose();
    }
    this.composite.dispose();
    this.blend.dispose();
  }

  /** Every draw covers its whole target (or blends onto it): nothing is cleared first. */
  private draw(gl: NodeRenderer, material: NodeMaterial, target: NodeTarget): void {
    this.quad.material = material;
    gl.setRenderTarget(target);
    this.quad.render(gl);
  }

  private blur(input: NodeTarget, radius: number, mip: number, direction: AnyNode): NodeMaterial {
    const k = bloomKernel(radius);
    const tex = texture(input.texture);
    let sum: AnyNode = at(tex, vUv).rgb.mul(k.centre);
    for (let i = 0; i < k.offsets.length; i++) {
      const offset = direction.mul(this.invSize[mip]).mul(k.offsets[i]!);
      sum = sum.add(at(tex, vUv.add(offset)).rgb.add(at(tex, vUv.sub(offset)).rgb).mul(k.weights[i]!));
    }
    return fullScreen(vec4(sum, 1));
  }
}

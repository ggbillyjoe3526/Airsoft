import * as THREE from 'three';
import type { NodeMaterial } from 'three/webgpu';
import { tsl } from './tsl';
import { POST } from '../../../config/post';
import { type SunOnScreen, sunOnScreen } from '../../post/lightShaftsPass';
import { ADDITIVE, drawCleared, type PostFrame, type PostPass, scaled } from '../../post/postPass';
import { at, depthAt, colourTarget, fullScreen, type NodeRenderer, type NodeTarget, quad, slot, vUv } from './nodeKit';

const { clamp, float, Fn, length, Loop, max, perspectiveDepthToViewZ, pow, texture, uniform, vec2, vec3, vec4 } = tsl;

const C = POST.lightShafts;

/**
 * Light shafts on the node path (W4): render/post/lightShaftsPass.ts in TSL, the same three draws (the sky round the
 * sun or moon masked by the depth, blurred towards it at half resolution, added back) at the same strengths. Three's
 * `GodraysNode` traces shadow maps through a volume instead (a different look and price), so this ports WebGL's.
 */
export class NodeLightShaftsPass implements PostPass<NodeRenderer, NodeTarget> {
  readonly id = 'lightShafts' as const;
  readonly inPlace = true;
  private readonly mask: NodeTarget;
  private readonly rays: NodeTarget;
  private readonly maskMaterial: NodeMaterial;
  private readonly blurMaterial: NodeMaterial;
  private readonly addMaterial: NodeMaterial;
  private readonly colour = slot();
  private readonly depth = slot();
  private readonly quad = quad();
  private readonly keep = new THREE.Color();
  private readonly scratch = new THREE.Vector3();
  private readonly onScreen: SunOnScreen = { u: 0, v: 0, fade: 0 };
  private readonly u = { sun: uniform(new THREE.Vector2()), aspect: uniform(1), near: uniform(0), far: uniform(0), strength: uniform(0) };

  constructor(width: number, height: number, type: THREE.TextureDataType) {
    this.mask = colourTarget(width, height, type, C.resolution);
    this.rays = colourTarget(width, height, type, C.resolution);
    const { sun, aspect, near, far, strength } = this.u;
    this.maskMaterial = fullScreen(
      Fn(() => {
        const viewZ = perspectiveDepthToViewZ(depthAt(this.depth, vUv), near, far).negate();
        const d = length(vUv.sub(sun).mul(vec2(aspect, 1))).div(C.sunRadius);
        const w = viewZ.greaterThan(C.skyFrom).select(pow(max(float(0), float(1).sub(d)), 2), 0);
        return vec4(at(this.colour, vUv).rgb.mul(w), 1);
      })(),
    );
    const mask = texture(this.mask.texture);
    this.blurMaterial = fullScreen(
      Fn(() => {
        const step = vUv.sub(sun).mul(C.length / C.samples).toVar();
        const uv = vUv.toVar();
        const weight = float(1).toVar();
        const sum = vec3(0).toVar();
        Loop(C.samples, () => {
          uv.subAssign(step);
          sum.addAssign(at(mask, clamp(uv, 0, 1)).rgb.mul(weight));
          weight.mulAssign(C.decay);
        });
        return vec4(sum.div(C.samples), 1);
      })(),
    );
    const rays = texture(this.rays.texture);
    this.addMaterial = fullScreen(vec4(at(rays, vUv).rgb.mul(strength), 1), ADDITIVE);
  }

  setSize(width: number, height: number): void {
    this.mask.setSize(scaled(width, C.resolution), scaled(height, C.resolution));
    this.rays.setSize(scaled(width, C.resolution), scaled(height, C.resolution));
  }

  render(gl: NodeRenderer, frame: PostFrame, read: NodeTarget): boolean {
    const cam = frame.camera;
    const sun = frame.depth ? sunOnScreen(cam, frame.sun, this.scratch, this.onScreen) : null;
    if (!sun) return false;
    const u = this.u;
    this.colour.value = read.texture;
    this.depth.value = frame.depth;
    u.sun.value.set(sun.u, sun.v);
    u.aspect.value = cam.aspect;
    u.near.value = cam.near;
    u.far.value = cam.far;
    this.quad.material = this.maskMaterial;
    drawCleared(gl, this.quad, this.mask, 0x000000, this.keep);
    this.quad.material = this.blurMaterial;
    drawCleared(gl, this.quad, this.rays, 0x000000, this.keep);
    u.strength.value = (frame.night ? C.strength.night : C.strength.day) * sun.fade;
    this.quad.material = this.addMaterial;
    gl.setRenderTarget(read);
    this.quad.render(gl);
    return false;
  }

  dispose(): void {
    this.mask.dispose();
    this.rays.dispose();
    this.maskMaterial.dispose();
    this.blurMaterial.dispose();
    this.addMaterial.dispose();
  }
}

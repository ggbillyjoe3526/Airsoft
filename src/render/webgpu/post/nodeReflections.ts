import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import { tsl } from './tsl';
import { POST } from '../../../config/post';
import type { PostFrame, PostPass } from '../../post/postPass';
import { type AnyNode, at, depthAt, fullScreen, type NodeRenderer, type NodeTarget, quad, screenOf, slot, viewAt, vUv } from './nodeKit';

const { Break, clamp, depth, Discard, dot, float, Fn, If, Loop, max, min, mix, normalize, normalView, pow, reflect, screenUV, uniform, vec2, vec4 } = tsl;

const C = POST.reflections;

/** One reflective mesh's stand-in in the mask scene: its geometry, its place copied each frame, the mask material. */
interface Proxy {
  source: THREE.Mesh;
  mesh: THREE.Mesh;
}

/**
 * Reflections on puddles and glass on the node path (W4): render/post/reflectionPass.ts in TSL, the same mask of the
 * reflective meshes (view normal and strength, hidden parts dropped against the scene's depth) and the same walk of
 * each masked pixel's reflected ray through the depth. Three/webgpu 0.186's `SSRNode` reads normals and metalness from
 * a second render target (MRT) on every pixel; the game's reflections are only on its few reflective meshes, so this
 * ports WebGL's, which draws nothing and holds no target without them.
 */
export class NodeReflectionPass implements PostPass<NodeRenderer, NodeTarget> {
  readonly id = 'reflections' as const;
  readonly inPlace = false;
  private readonly maskScene = new THREE.Scene();
  private proxies: Proxy[] = [];
  private mask: NodeTarget | null = null;
  private readonly trace: NodeMaterial;
  private readonly colour = slot();
  private readonly depth = slot();
  private readonly maskRead = slot();
  private readonly quad = quad();
  private readonly keep = new THREE.Color();
  private readonly u = { projection: uniform(new THREE.Matrix4()), inverseProjection: uniform(new THREE.Matrix4()) };
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.maskScene.matrixWorldAutoUpdate = false;
    const { projection, inverseProjection } = this.u;
    const colour = this.colour;
    const view = (u: AnyNode): AnyNode => viewAt(inverseProjection, u, depthAt(this.depth, u));
    const project = (p: AnyNode): AnyNode => screenOf(projection, p);
    this.trace = fullScreen(
      Fn(() => {
        const base = at(colour, vUv).toVar();
        const m = at(this.maskRead, vUv).toVar();
        const result = base.toVar();
        If(m.a.greaterThan(0), () => {
          const p = view(vUv).toVar();
          const n = normalize(m.xyz.mul(2).sub(1)).toVar();
          const v = normalize(p).toVar();
          const r = reflect(v, n).toVar();
          const stepLength = C.maxDistance / C.steps;
          const q = p.toVar();
          const hit = vec2(-1).toVar();
          Loop(C.steps, () => {
            q.addAssign(r.mul(stepLength));
            const uv = project(q).toVar();
            If(uv.x.lessThan(0).or(uv.x.greaterThan(1)).or(uv.y.lessThan(0)).or(uv.y.greaterThan(1)).or(q.z.greaterThan(0)), () => {
              Break();
            });
            const behind = view(uv).z.sub(q.z).toVar();
            If(behind.greaterThan(0).and(behind.lessThan(C.thickness)), () => {
              // Halve back and forth onto the surface.
              const a = q.sub(r.mul(stepLength)).toVar();
              const b = q.toVar();
              Loop(C.refine, () => {
                const mid = a.add(b).mul(0.5).toVar();
                If(view(project(mid)).z.sub(mid.z).greaterThan(0), () => {
                  b.assign(mid);
                }).Else(() => {
                  a.assign(mid);
                });
              });
              hit.assign(project(b));
              Break();
            });
          });
          If(hit.x.greaterThanEqual(0), () => {
            const edge = min(hit, float(1).sub(hit)).div(C.edgeFade);
            const fade = clamp(min(edge.x, edge.y), 0, 1);
            const fresnel = float(C.fresnelBase).add(float(1 - C.fresnelBase).mul(pow(float(1).sub(max(dot(v.negate(), n), 0)), 5)));
            result.assign(vec4(mix(base.rgb, at(colour, hit).rgb, m.a.mul(fresnel).mul(fade)), base.a));
          });
        });
        return result;
      })(),
    );
  }

  /** The reflective meshes now in the scene (findReflective): the mask's stand-ins follow them. */
  setSurfaces(surfaces: readonly { mesh: THREE.Mesh; strength: number }[]): void {
    this.dropProxies();
    for (const { mesh, strength } of surfaces) {
      const proxy = new THREE.Mesh(mesh.geometry, this.maskMaterial(strength));
      proxy.matrixAutoUpdate = false;
      this.maskScene.add(proxy);
      this.proxies.push({ source: mesh, mesh: proxy });
    }
    if (this.proxies.length === 0) {
      this.mask?.dispose();
      this.mask = null;
    } else {
      this.mask ??= new THREE.RenderTarget(this.width, this.height);
    }
  }

  /** How many reflective meshes the pass follows (0: it draws nothing). */
  get surfaces(): number {
    return this.proxies.length;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.mask?.setSize(width, height);
  }

  render(gl: NodeRenderer, frame: PostFrame, read: NodeTarget, write: NodeTarget | null): boolean {
    const mask = this.mask;
    if (!mask || !frame.depth || !write) return false;
    for (let i = 0; i < this.proxies.length; i++) {
      const p = this.proxies[i]!;
      p.mesh.matrixWorld.copy(p.source.matrixWorld);
      p.mesh.visible = p.source.visible;
    }
    const cam = frame.camera;
    this.depth.value = frame.depth;
    gl.getClearColor(this.keep);
    const alpha = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(mask);
    gl.clear(true, true, false);
    gl.render(this.maskScene, cam);
    gl.setClearColor(this.keep, alpha);
    this.colour.value = read.texture;
    this.maskRead.value = mask.texture;
    this.u.projection.value.copy(cam.projectionMatrix);
    this.u.inverseProjection.value.copy(cam.projectionMatrixInverse);
    this.quad.material = this.trace;
    gl.setRenderTarget(write);
    this.quad.render(gl);
    return true;
  }

  dispose(): void {
    this.dropProxies();
    this.mask?.dispose();
    this.mask = null;
    this.trace.dispose();
  }

  /** The mask material for one strength: the view normal and the strength, where the scene's depth shows the surface. */
  private maskMaterial(strength: number): NodeMaterial {
    const m = new NodeMaterial();
    const sceneDepth = this.depth;
    m.fragmentNode = Fn(() => {
      // Behind something the scene drew: not seen, so not reflective here.
      Discard(depth.greaterThan(sceneDepth.sample(screenUV).add(1e-5)));
      return vec4(normalize(normalView).mul(0.5).add(0.5), strength);
    })();
    m.side = THREE.DoubleSide;
    return m;
  }

  private dropProxies(): void {
    for (const p of this.proxies) {
      this.maskScene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.proxies = [];
  }
}

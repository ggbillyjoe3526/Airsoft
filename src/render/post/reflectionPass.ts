import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { POST } from '../../config/post';
import { fullScreenMaterial, type PostFrame, type PostPass } from './postPass';

const C = POST.reflections;

/**
 * How reflective a mesh is (G5): its `userData.reflective` strength when it sets one (G8's puddles), the glass strength
 * for the map's merged glass (by name, POST.reflections.meshNames), else 0. Nothing else is ever reflective.
 */
export function reflectivity(o: THREE.Object3D): number {
  if (!(o instanceof THREE.Mesh)) return 0;
  const own = (o.userData as { reflective?: unknown }).reflective;
  if (typeof own === 'number') return Math.max(0, own);
  return C.meshNames.some((n) => o.name.startsWith(n)) ? C.glass : 0;
}

/** The reflective meshes under `root`, with their strengths, into `out` (cleared first). Not per frame: on a scene change. */
export function findReflective(root: THREE.Object3D, out: { mesh: THREE.Mesh; strength: number }[]): void {
  out.length = 0;
  root.traverse((o) => {
    const strength = reflectivity(o);
    if (strength > 0) out.push({ mesh: o as THREE.Mesh, strength });
  });
}

/** One reflective mesh's stand-in in the mask scene: its geometry, its place copied each frame, the mask material. */
interface Proxy {
  source: THREE.Mesh;
  mesh: THREE.Mesh;
}

/**
 * Reflections on puddles and glass (G5, QualitySettings.reflections): screen-space, and only there. The reflective
 * meshes are drawn once more into a small mask (their view-space normal and strength; hidden parts dropped against the
 * scene's depth), then a full-screen pass walks each masked pixel's reflected ray through the depth and takes the colour
 * it hits, faded by a Fresnel term and towards the screen's edges. With no reflective mesh in the scene the pass draws
 * nothing and holds no target.
 */
export class ReflectionPass implements PostPass {
  readonly id = 'reflections' as const;
  private readonly maskScene = new THREE.Scene();
  private proxies: Proxy[] = [];
  private mask: THREE.WebGLRenderTarget | null = null;
  private readonly shared = { tDepth: { value: null as THREE.Texture | null }, resolution: { value: new THREE.Vector2(1, 1) } };
  private readonly trace: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private readonly keep = new THREE.Color();
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.maskScene.matrixWorldAutoUpdate = false;
    this.trace = fullScreenMaterial(
      /* glsl */ `
      #include <packing>
      uniform sampler2D tColour;
      uniform highp sampler2D tDepth;
      uniform sampler2D tMask;
      uniform mat4 projection, inverseProjection;
      uniform float maxDistance, thickness, edgeFade, fresnelBase;
      varying vec2 vUv;
      vec3 viewAt(vec2 uv) {
        vec4 p = inverseProjection * vec4(vec3(uv, texture2D(tDepth, uv).x) * 2.0 - 1.0, 1.0);
        return p.xyz / p.w;
      }
      vec2 screenOf(vec3 p) {
        vec4 c = projection * vec4(p, 1.0);
        return c.xy / c.w * 0.5 + 0.5;
      }
      void main() {
        vec4 base = texture2D(tColour, vUv);
        vec4 m = texture2D(tMask, vUv);
        if (m.a <= 0.0) { gl_FragColor = base; return; }
        vec3 p = viewAt(vUv);
        vec3 n = normalize(m.xyz * 2.0 - 1.0);
        vec3 v = normalize(p);
        vec3 r = reflect(v, n);
        float stepLength = maxDistance / float(STEPS);
        vec3 q = p;
        vec2 hit = vec2(-1.0);
        for (int i = 0; i < STEPS; i++) {
          q += r * stepLength;
          vec2 uv = screenOf(q);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || q.z > 0.0) break;
          float behind = viewAt(uv).z - q.z;
          if (behind > 0.0 && behind < thickness) {
            // Halve back and forth onto the surface.
            vec3 a = q - r * stepLength;
            vec3 b = q;
            for (int k = 0; k < REFINE; k++) {
              vec3 mid = (a + b) * 0.5;
              vec2 muv = screenOf(mid);
              if (viewAt(muv).z - mid.z > 0.0) b = mid; else a = mid;
            }
            hit = screenOf(b);
            break;
          }
        }
        if (hit.x < 0.0) { gl_FragColor = base; return; }
        vec2 edge = min(hit, 1.0 - hit) / edgeFade;
        float fade = clamp(min(edge.x, edge.y), 0.0, 1.0);
        float fresnel = fresnelBase + (1.0 - fresnelBase) * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
        gl_FragColor = vec4(mix(base.rgb, texture2D(tColour, hit).rgb, m.a * fresnel * fade), base.a);
      }`,
      {
        tColour: { value: null },
        tDepth: this.shared.tDepth,
        tMask: { value: null },
        projection: { value: new THREE.Matrix4() },
        inverseProjection: { value: new THREE.Matrix4() },
        maxDistance: { value: C.maxDistance },
        thickness: { value: C.thickness },
        edgeFade: { value: C.edgeFade },
        fresnelBase: { value: C.fresnelBase },
      },
      { defines: { STEPS: C.steps, REFINE: C.refine } },
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
      this.mask ??= new THREE.WebGLRenderTarget(this.width, this.height);
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

  render(gl: THREE.WebGLRenderer, frame: PostFrame, read: THREE.WebGLRenderTarget, write: THREE.WebGLRenderTarget | null): boolean {
    const mask = this.mask;
    if (!mask || !frame.depth || !write) return false;
    for (let i = 0; i < this.proxies.length; i++) {
      const p = this.proxies[i]!;
      p.mesh.matrixWorld.copy(p.source.matrixWorld);
      p.mesh.visible = p.source.visible;
    }
    const cam = frame.camera;
    this.shared.tDepth.value = frame.depth;
    this.shared.resolution.value.set(this.width, this.height);
    gl.getClearColor(this.keep);
    const alpha = gl.getClearAlpha();
    gl.setClearColor(0x000000, 0);
    gl.setRenderTarget(mask);
    gl.clear(true, true, false);
    gl.render(this.maskScene, cam);
    gl.setClearColor(this.keep, alpha);
    const t = this.trace.uniforms;
    t.tColour!.value = read.texture;
    t.tMask!.value = mask.texture;
    t.projection!.value.copy(cam.projectionMatrix);
    t.inverseProjection!.value.copy(cam.projectionMatrixInverse);
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
    this.quad.dispose();
  }

  /** The mask material for one strength: the view normal and the strength, where the scene's depth shows the surface. */
  private maskMaterial(strength: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform highp sampler2D tDepth;
        uniform vec2 resolution;
        uniform float strength;
        varying vec3 vNormal;
        void main() {
          // Behind something the scene drew: not seen, so not reflective here.
          if (gl_FragCoord.z > texture2D(tDepth, gl_FragCoord.xy / resolution).x + 1e-5) discard;
          vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
          gl_FragColor = vec4(n * 0.5 + 0.5, strength);
        }`,
      uniforms: { tDepth: this.shared.tDepth, resolution: this.shared.resolution, strength: { value: strength } },
      side: THREE.DoubleSide,
    });
  }

  private dropProxies(): void {
    for (const p of this.proxies) {
      this.maskScene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.proxies = [];
  }
}

import * as THREE from 'three';
import { type ComputeNode, IndirectStorageBufferAttribute, MeshLambertNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import {
  atan,
  atomicAdd,
  atomicStore,
  cameraPosition,
  cameraViewMatrix,
  float,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  mix,
  normalize,
  positionLocal,
  select,
  storage,
  texture,
  uint,
  uniform,
  uniformArray,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { GPU_FOREST } from '../../../config/gpuDressing';
import { freeBuffer } from './computeKit';
import { FILL, FOOT, ForestAtlas } from './forestAtlas';
import type { StandIn } from './forestLayout';
import type { Node } from './kernelOps';

/**
 * The tree stand-ins beyond the fence (WebGPU overhaul W5, MapDressing.forest; placed by forestLayout.ts): a picture of
 * one of the game's own tree shapes each (forestAtlas.ts), on a quad turned to the camera about its upright, showing
 * the side the camera sees it from (the two nearest of the atlas's sides blended), lit by the scene's own lights from
 * the picture's normals, fogged as the shapes would be. Culled on the GPU every frame by the view and GPU_FOREST.drawTo,
 * as the grass is (grassField.ts): on WebGPU the kept ones are packed by an atomic counter into an indirect draw; on
 * Three's WebGL2 back end (no atomics, no indirect draws) every one is drawn and a culled one has no size.
 */

const PLANE = new THREE.PlaneGeometry(1, 1);

export class ForestStandIns {
  readonly mesh: THREE.Mesh;
  readonly count: number;
  private readonly atlas: ForestAtlas;
  private readonly planes = uniformArray([0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4()), 'vec4');
  private readonly frustum = new THREE.Frustum();
  private readonly matrix = new THREE.Matrix4();
  private readonly eye = uniform(new THREE.Vector3());
  private readonly passes: ComputeNode[];
  private readonly buffers: THREE.BufferAttribute[] = [];

  /** `trees` drawn with pictures taken now on `renderer`; `webgpu`: it has atomics and indirect draws. */
  constructor(
    private readonly renderer: WebGPURenderer,
    trees: readonly StandIn[],
    webgpu: boolean,
  ) {
    const F = GPU_FOREST;
    const n = (this.count = trees.length);
    this.atlas = new ForestAtlas(renderer);
    // Each stand-in's foot and height, and its variant and shade, read at its own index (all Three's WebGL2 back end
    // can read in its transform feedback).
    const feet = new Float32Array(n * 4);
    const looks = new Float32Array(n * 4);
    trees.forEach((t, k) => {
      feet.set([t.x, t.y, t.z, t.height], k * 4);
      looks.set([t.variant, t.shade, 0, 0], k * 4);
    });
    const sourceFoot = instancedArray(feet, 'vec4');
    const sourceLook = instancedArray(looks, 'vec4');
    const foot = instancedArray(n, 'vec4');
    const look = instancedArray(n, 'vec4');
    this.buffers.push(sourceFoot.value, sourceLook.value, foot.value, look.value);
    const planes = this.planes;
    const eye = this.eye;
    const tree = (): { foot: Node; look: Node; kept: Node } => {
      const a = sourceFoot.element(instanceIndex);
      const b = sourceLook.element(instanceIndex);
      const middle = a.xyz.add(vec3(0, a.w.mul(0.5), 0));
      const radius = a.w.mul(0.6);
      let seen: Node = middle.sub(eye).length().lessThan(F.drawTo);
      for (let p = 0; p < 6; p++) {
        const plane: Node = planes.element(p);
        seen = seen.and(plane.xyz.dot(middle).add(plane.w).greaterThan(radius.negate()));
      }
      return { foot: a, look: b, kept: seen };
    };
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(PLANE.getIndex());
    geometry.setAttribute('position', PLANE.getAttribute('position'));
    geometry.setAttribute('uv', PLANE.getAttribute('uv'));
    geometry.instanceCount = n;
    if (webgpu) {
      const args = new IndirectStorageBufferAttribute(new Uint32Array([PLANE.getIndex()!.count, 0, 0, 0, 0]), 1);
      const kept = storage(args, 'uint', 5).toAtomic();
      this.buffers.push(args);
      const reset = Fn(() => {
        atomicStore(kept.element(1), uint(0));
      })().compute(1) as ComputeNode;
      const cull = Fn(() => {
        const t = tree();
        If(t.kept, () => {
          const k = atomicAdd(kept.element(1), uint(1));
          foot.element(k).assign(t.foot);
          look.element(k).assign(t.look);
        });
      })().compute(n) as ComputeNode;
      this.passes = [reset, cull];
      geometry.setIndirect(args);
    } else {
      const cull = Fn(() => {
        const t = tree();
        foot.element(instanceIndex).assign(vec4(t.foot.xyz, select(t.kept, t.foot.w, float(0))));
        look.element(instanceIndex).assign(t.look);
      })().compute(n) as ComputeNode;
      this.passes = [cull];
    }

    const material = new MeshLambertNodeMaterial({ side: THREE.DoubleSide });
    material.name = 'forest-gpu';
    material.alphaTest = F.alphaTest;
    const at = foot.element(instanceIndex);
    const lk = look.element(instanceIndex);
    // The side the camera sees it from (azimuth from the tree to the eye), its two nearest pictures and their blend.
    const toEye = cameraPosition.sub(at.xyz);
    const azimuth = atan(toEye.x, toEye.z);
    const side = azimuth.div(Math.PI * 2).fract().mul(F.views);
    const first = side.floor();
    const blend = varying(side.sub(first)) as Node;
    const right = vec3(azimuth.cos(), 0, azimuth.sin().negate());
    const size = at.w.div(FILL);
    const corner = uv();
    material.positionNode = at.xyz.add(right.mul(positionLocal.x.mul(size))).add(vec3(0, corner.y.sub(FOOT).mul(size), 0));
    const row = lk.x;
    // On the node renderer a target's texture starts at the top of what was drawn into it (both back ends): row v's
    // square spans v .. v + 1 up the atlas camera's view, so 1 − (v + y) / variants down the texture.
    const tile = (column: Node): Node => varying(vec2(column.add(corner.x).div(F.views), float(1).sub(row.add(corner.y).div(F.variants)))) as Node;
    const uv0 = tile(first);
    const uv1 = tile(first.add(1).mod(F.views));
    const colour = mix(texture(this.atlas.colour, uv0), texture(this.atlas.colour, uv1), blend);
    const normal = mix(texture(this.atlas.normal, uv0), texture(this.atlas.normal, uv1), blend).xyz.mul(2).sub(1);
    const shade = varying(lk.y) as Node;
    material.colorNode = vec4(colour.xyz.pow(2.2).mul(shade), 1);
    material.opacityNode = colour.w;
    material.normalNode = normalize(cameraViewMatrix.mul(vec4(normalize(normal), 0)).xyz);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'forest-gpu';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  /** Once a frame before the draws: culls for `camera` (its world matrix up to date). Nothing is allocated. */
  frame(camera: THREE.Camera): void {
    this.eye.value.setFromMatrixPosition(camera.matrixWorld);
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem);
    const values = this.planes.array as THREE.Vector4[];
    for (let k = 0; k < 6; k++) {
      const p = this.frustum.planes[k]!;
      values[k]!.set(p.normal.x, p.normal.y, p.normal.z, p.constant);
    }
    void this.renderer.compute(this.passes);
  }

  /** Frees the draw, the atlas, the passes and every buffer (on the GPU too). */
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.atlas.dispose();
    for (const p of this.passes) p.dispose();
    for (const b of this.buffers) freeBuffer(this.renderer, b);
  }
}

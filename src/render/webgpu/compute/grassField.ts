import * as THREE from 'three';
import { type ComputeNode, IndirectStorageBufferAttribute, MeshLambertNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import {
  abs,
  atomicAdd,
  atomicStore,
  cameraViewMatrix,
  exp2,
  float,
  Fn,
  hash,
  If,
  instancedArray,
  instanceIndex,
  int,
  ivec2,
  max,
  mix,
  normalize,
  positionLocal,
  select,
  sin,
  storage,
  texture,
  textureLoad,
  uint,
  uniform,
  uniformArray,
  varying,
  vec3,
  vec4,
} from 'three/tsl';
import { GPU_GRASS, type GpuDressingTier } from '../../../config/gpuDressing';
import type { Terrain } from '../../../map/terrain';
import { freeBuffer } from './computeKit';
import { type GrassLevels, type GrassMask, clipSlot, grassLevels, levelReach, onTriangles } from './grassLayout';
import { type Node, tslOps } from './kernelOps';

/**
 * Woodland's grass on the node path (WebGPU overhaul W5, MapDressing.grass): a blade on every slot of the clipmap round
 * the camera (grassLayout.ts) where the ground grows grass, thinning with distance, culled on the GPU every frame and
 * drawn in one instanced draw. A compute pass places each slot's blade on its lattice point (jittered by a hash of the
 * point, so blades stay put as the camera moves), on the terrain's own triangles, in the ground's own colour, and
 * keeps it when the mask grows grass there, the camera sees it and its ring's thinning keeps it (a blade thinned out
 * shrinks away, never pops).
 *
 * WebGPU: the kept blades are packed into a list by an atomic counter, which is the draw's instance count read from
 * the GPU (an indirect draw): only kept blades are drawn. Three's WebGL2 back end has neither atomics nor indirect
 * draws (and its compute is transform feedback, writing each slot's own element only), so there every slot is drawn
 * and a culled one is a blade of no size, which the rasteriser drops (its vertices still run).
 */

/** The blade: two vertices at its foot, two halfway up, one at its tip (three triangles), x across, y up (0 .. 1). */
function bladeGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.36, 0.5, 0, 0.36, 0.5, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  return g;
}
const BLADE_INDICES = 9;

/** The terrain as a float texture, a texel a vertex: the ground's colour (linear, the terrain mesh's own) and height. */
function groundTexture(terrain: Terrain, colours: THREE.BufferAttribute): THREE.DataTexture {
  const w = terrain.cols + 1;
  const h = terrain.rows + 1;
  const data = new Float32Array(w * h * 4);
  for (let v = 0; v < w * h; v++) data.set([colours.getX(v), colours.getY(v), colours.getZ(v), terrain.heights[v]!], v * 4);
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}

function maskTexture(mask: GrassMask): THREE.DataTexture {
  const t = new THREE.DataTexture(mask.cells, mask.cols, mask.rows, THREE.RedFormat, THREE.UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

export class GrassField {
  readonly mesh: THREE.Mesh;
  readonly levels: GrassLevels;
  private readonly ground: THREE.DataTexture;
  private readonly maskTex: THREE.DataTexture;
  private readonly eye = uniform(new THREE.Vector3());
  private readonly planes = uniformArray([0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4()), 'vec4');
  private readonly time = uniform(0);
  private readonly sway = uniform(1);
  private readonly frustum = new THREE.Frustum();
  private readonly matrix = new THREE.Matrix4();
  private readonly passes: ComputeNode[];
  private readonly buffers: THREE.BufferAttribute[] = [];
  private clock = 0;

  /**
   * `tier`'s grass over `terrain` where `mask` grows it, its blades `height` m tall (MapDressing.grass), coloured as
   * `colours` (the terrain mesh's vertex colours) paints the ground; `webgpu`: the renderer has atomics and indirect
   * draws (not its WebGL2 back end).
   */
  constructor(
    private readonly renderer: WebGPURenderer,
    tier: GpuDressingTier,
    terrain: Terrain,
    mask: GrassMask,
    colours: THREE.BufferAttribute,
    height: number,
    webgpu: boolean,
  ) {
    const G = GPU_GRASS;
    const L = (this.levels = grassLevels(tier));
    const n = L.count;
    this.ground = groundTexture(terrain, colours);
    this.maskTex = maskTexture(mask);
    const groundTex = texture(this.ground);
    const maskNode = texture(this.maskTex);
    const eye = this.eye;
    const planes = this.planes;
    const o = tslOps;

    // The blade of slot `n` (where it stands, how big, its colour), and whether it is kept.
    const blade = (): { at: Node; size: Node; colour: Node; kept: Node } => {
      const { level, i, j } = clipSlot(o, float(instanceIndex), L);
      const step = float(L.spacing).mul(exp2(level));
      const I = eye.x.div(step).add(0.5).floor().add(i);
      const J = eye.z.div(step).add(0.5).floor().add(j);
      // A seed per world lattice point and ring (every lattice index here is within ±4096).
      const seed = I.add(4096).toUint().add(J.add(4096).toUint().mul(8192)).add(level.mul(67108864).toUint()).mul(4);
      const h0 = hash(seed);
      const h1 = hash(seed.add(1));
      const keep = hash(seed.add(2));
      const h3 = hash(seed.add(3));
      const x = I.add(h0).mul(step);
      const z = J.add(h1).mul(step);
      // Chebyshev distance from the eye; this ring draws from the inner ring's reach out to its own.
      const d = max(abs(x.sub(eye.x)), abs(z.sub(eye.z)));
      const reach = float(levelReach(L, 0)).mul(exp2(level));
      const inner = select(level.greaterThan(0), reach.mul(0.5), float(-1));
      const ramp = (from: Node, to: Node): Node => d.sub(from).div(to.sub(from)).clamp(0, 1).smoothstep(0, 1);
      // Near its reach a ring thins to the next ring's density (a quarter); the last ring thins to nothing.
      const last = level.greaterThanEqual(L.levels - 1);
      const thin = select(last, float(1).sub(ramp(reach.mul(G.far), reach)), float(1).sub(ramp(reach.mul(1 - G.fade), reach).mul(0.75)));
      // The mask, bilinear over its cells (out of the terrain: none).
      const mx = x.sub(mask.minX).div(mask.cell).sub(0.5);
      const mz = z.sub(mask.minZ).div(mask.cell).sub(0.5);
      const m0x = mx.floor().clamp(0, mask.cols - 2);
      const m0z = mz.floor().clamp(0, mask.rows - 2);
      const fx = mx.sub(m0x).clamp(0, 1);
      const fz = mz.sub(m0z).clamp(0, 1);
      const cell = (a: Node, b: Node): Node => textureLoad(maskNode, ivec2(int(a), int(b))).x;
      const row0 = mix(cell(m0x, m0z), cell(m0x.add(1), m0z), fx);
      const row1 = mix(cell(m0x, m0z.add(1)), cell(m0x.add(1), m0z.add(1)), fx);
      const gx = x.sub(terrain.minX).div(terrain.cell);
      const gz = z.sub(terrain.minZ).div(terrain.cell);
      const inside = gx.greaterThanEqual(0).and(gz.greaterThanEqual(0)).and(gx.lessThanEqual(terrain.cols)).and(gz.lessThanEqual(terrain.rows));
      const grows = select(inside, mix(row0, row1, fz), float(0));
      // Thinned blades shrink over the last 0.15 of their hash before they go.
      const share = thin.mul(grows).sub(keep).div(0.15).clamp(0, 1);
      const inRing = d.lessThan(reach).and(d.greaterThanEqual(inner));
      const ground = onTriangles(o, gx.clamp(0, terrain.cols), gz.clamp(0, terrain.rows), terrain.cols, terrain.rows, (a: Node, b: Node) => textureLoad(groundTex, ivec2(int(a), int(b))));
      const tall = float(height).mul(mix(float(G.height[0]), float(G.height[1]), h3)).mul(share);
      const wide = float(G.width).mul(exp2(level.mul(Math.log2(G.widen)))).mul(share);
      // In view: the blade's sphere (its middle, its height round it) inside every plane of the frustum.
      const middle = vec3(x, ground.w.add(tall.mul(0.5)), z);
      let seen: Node = inRing.and(share.greaterThan(0));
      for (let p = 0; p < 6; p++) {
        const plane: Node = planes.element(p);
        seen = seen.and(plane.xyz.dot(middle).add(plane.w).greaterThan(tall.negate()));
      }
      const yaw = h3.mul(97.1).fract().mul(Math.PI * 2);
      const lean = h3.mul(13.7).fract().sub(0.5).mul(2 * G.lean);
      const shade = h3.mul(41.3).fract().sub(0.5).mul(2 * G.jitter).add(1);
      return {
        at: vec4(x, ground.w, z, yaw),
        size: vec4(wide, tall, lean, h0.add(h1).mul(3.1)),
        colour: vec4(ground.xyz.mul(shade), 1),
        kept: seen,
      };
    };

    // Per slot (WebGL2 and the draw's source there), or packed (WebGPU).
    const at = instancedArray(n, 'vec4');
    const size = instancedArray(n, 'vec4');
    const colour = instancedArray(n, 'vec4');
    this.buffers.push(at.value, size.value, colour.value);
    const geometry = bladeGeometry();
    if (webgpu) {
      const args = new IndirectStorageBufferAttribute(new Uint32Array([BLADE_INDICES, 0, 0, 0, 0]), 1);
      const count = storage(args, 'uint', 5).toAtomic();
      this.buffers.push(args);
      const reset = Fn(() => {
        atomicStore(count.element(1), uint(0));
      })().compute(1) as ComputeNode;
      const cull = Fn(() => {
        const b = blade();
        If(b.kept, () => {
          const k = atomicAdd(count.element(1), uint(1));
          at.element(k).assign(b.at);
          size.element(k).assign(b.size);
          colour.element(k).assign(b.colour);
        });
      })().compute(n) as ComputeNode;
      this.passes = [reset, cull];
      geometry.setIndirect(args);
    } else {
      const cull = Fn(() => {
        const b = blade();
        at.element(instanceIndex).assign(b.at);
        size.element(instanceIndex).assign(select(b.kept, b.size, vec4(0)));
        colour.element(instanceIndex).assign(b.colour);
      })().compute(n) as ComputeNode;
      this.passes = [cull];
    }
    geometry.instanceCount = n;

    // The draw: each blade from its element, bent along its face and swayed by the wind at its tip.
    const material = new MeshLambertNodeMaterial({ side: THREE.DoubleSide });
    material.name = 'grass-gpu';
    const a = at.element(instanceIndex);
    const s = size.element(instanceIndex);
    const across = vec3(a.w.cos(), 0, a.w.sin());
    const face = vec3(a.w.sin().negate(), 0, a.w.cos());
    const y = positionLocal.y;
    const W = G.wind;
    const wave = sin(this.time.mul(W.rate).add(a.x.add(a.z.mul(0.6)).mul(W.scale)).add(s.w)).mul(W.sway).mul(this.sway);
    const bend = face.mul(s.z.mul(s.y)).add(vec3(wave, 0, wave.mul(0.4)));
    const world = a.xyz.add(across.mul(positionLocal.x.mul(s.x))).add(vec3(0, y.mul(s.y), 0)).add(bend.mul(y.mul(y)));
    material.positionNode = world;
    // The mesh stands at the origin unturned: its local position is the world's, which the moon's shadow is read at.
    material.receivedShadowPositionNode = varying(world) as Node;
    // The normal: the blade's face (tilted by its bend) leaned towards straight up, so it lights as the ground does.
    const rise = vec3(0, s.y, 0).add(bend.mul(y.mul(2)));
    const facing = normalize(across.cross(rise));
    const lit = normalize(mix(facing, vec3(0, 1, 0), G.normalUp));
    material.normalNode = varying(cameraViewMatrix.mul(vec4(lit, 0)).xyz) as Node;
    const c = colour.element(instanceIndex);
    material.colorNode = vec4(varying(c.xyz.mul(mix(float(G.root), float(G.tip), y))) as Node, 1);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'grass-gpu';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
  }

  /**
   * Once a frame before the draws: the blades for `camera` (its world matrix up to date), the wind moved on by `dt`
   * (still under Reduced motion: `motion` false). Nothing is allocated.
   */
  frame(camera: THREE.Camera, dt: number, motion: boolean): void {
    camera.updateMatrixWorld();
    this.eye.value.setFromMatrixPosition(camera.matrixWorld);
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem);
    const values = this.planes.array as THREE.Vector4[];
    for (let k = 0; k < 6; k++) {
      const p = this.frustum.planes[k]!;
      values[k]!.set(p.normal.x, p.normal.y, p.normal.z, p.constant);
    }
    if (motion) this.clock += dt;
    this.time.value = this.clock;
    this.sway.value = motion ? 1 : 0;
    void this.renderer.compute(this.passes);
  }

  /** Frees the draw, the textures, the passes and every buffer (on the GPU too). */
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.ground.dispose();
    this.maskTex.dispose();
    for (const p of this.passes) p.dispose();
    for (const b of this.buffers) freeBuffer(this.renderer, b);
  }
}

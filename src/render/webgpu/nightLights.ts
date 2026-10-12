import * as THREE from 'three';
import { DataTexture, FloatType, type Light, Lighting, LightsNode, type NodeBuilder, RGBAFormat } from 'three/webgpu';
import { Break, Fn, getDistanceAttenuation, If, int, ivec2, Loop, positionView, smoothstep, textureLoad, vec4 } from 'three/tsl';
import type { WebGPURenderer } from 'three/webgpu';
import ClusteredLightsNode from 'three/examples/jsm/tsl/lighting/ClusteredLightsNode.js';
import { CLUSTERED_LIGHTS } from '../../config/renderLighting';
import { freeBuffer } from './compute/computeKit';

/**
 * The night's lights on WebGPU (WebGPU overhaul W3): Forward+ clustered shading, from three/webgpu's own
 * (`ClusteredLightsNode`, three/examples/jsm/tsl/lighting, new in 0.186). The view is cut into 32-pixel screen tiles
 * times exponential depth slices; a compute pass lists the lights reaching each cluster, and a pixel shades only its
 * cluster's lights. The light count costs no shader rebuild (the lights are a data texture), so the night maps give
 * every lamp its own light and the neon signs their spill beside WebGL's fixed pool (render/lightPools.ts, mapSigns.ts).
 *
 * Three's node clusters point lights only. This one is the closest equivalent for the game's lights, built on it:
 *
 * - **Spot lights too** (your weapon torch's real spot): each light's data has a third and fourth row, the spot's
 *   direction and its cone and penumbra cosines, shaded as Three's SpotLightNode does
 *   (`smoothstep(cone, penumbra, cos)`); a point light's cone is open (cosines below -1). The compute pass culls a spot
 *   by its reach sphere, as a point light.
 * - **No allocation per frame**: Three's sorts its lights by depth with a new comparator each frame; this one sorts
 *   into kept arrays (an insertion sort over at most `CLUSTERED_LIGHTS.maxLights`).
 * - **The world only**: `NightLighting` gives the clustered node to the scene it is pointed at (the match's world),
 *   and Three's plain lights node to any other (the held replica's overlay, the prefilter's sky), which have no night
 *   lights and need no compute pass.
 *
 * A light that casts a shadow (the sun or moon) stays one of Three's own lights, as it must for its shadow map; so does
 * any light with a projected map. The WebGL2 back end has no storage
 * buffers in a pixel shader: the node renderer there (`?forceWebGL`) keeps Three's own lights, as WebGL does.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's node types don't follow its own swizzles and helpers. */
type AnyNode = any;

/** The parts of Three's clustered node this one reads and replaces (not in its type). */
interface ClusteredInternals {
  _lightsTexture: DataTexture;
  /** The clusters' light lists (a storage buffer), and the size the grid was made for. */
  _lightIndexes: { value: THREE.BufferAttribute } | null;
  _bufferSize: THREE.Vector2 | null;
  _zSliceRangesData: Float32Array;
  _zSliceRangesTexture: DataTexture;
  _lightsCount: { value: number };
  _cameraViewMatrix: AnyNode;
  getTile(i: AnyNode): AnyNode;
}

/** What the grid is sized from: the target being drawn into, else the canvas. */
interface Sizing {
  getRenderTarget(): { width: number; height: number } | null;
  getDrawingBufferSize(out: THREE.Vector2): THREE.Vector2;
}

/** Rows of a light's data: position and reach; colour × intensity and decay; spot direction and cone; penumbra. */
const ROWS = 4;
/** A point light's cone: open all round (any cosine is above both). */
const OPEN = -2;

const position = new THREE.Vector3();
const target = new THREE.Vector3();
const canvas = new THREE.Vector2();

/** Whether `light` is shaded by the clusters: a point or spot light with no shadow and no projected map. */
export function clusters(light: Light): boolean {
  if (light.castShadow) return false;
  if ((light as THREE.PointLight).isPointLight) return true;
  const spot = light as THREE.SpotLight & { colorNode?: unknown };
  return spot.isSpotLight === true && !spot.map && !spot.colorNode;
}

export class NightLightsNode extends ClusteredLightsNode {
  /** Each clustered light's view-space depth this frame, and the lights' order by it (kept: no allocation). */
  private readonly depth: Float32Array;
  private readonly order: Int32Array;
  /** The clusters were last filled with no lights (updateBefore). */
  private empty = false;

  constructor(
    private readonly capacity: number = CLUSTERED_LIGHTS.maxLights,
    /** Where a light-list buffer the grid has outgrown goes, to be freed after the frame (NightLighting.flush). */
    private readonly retired: THREE.BufferAttribute[] = [],
  ) {
    super(capacity, CLUSTERED_LIGHTS.tileSize, CLUSTERED_LIGHTS.zSlices, CLUSTERED_LIGHTS.perCluster);
    const own = this as unknown as ClusteredInternals;
    own._lightsTexture.dispose();
    own._lightsTexture = new DataTexture(new Float32Array(capacity * 4 * ROWS), capacity, ROWS, RGBAFormat, FloatType);
    this.depth = new Float32Array(capacity);
    this.order = new Int32Array(capacity);
  }

  /**
   * Each frame: the clusters filled by Three's compute pass, but once only while there are no clustered lights (Low,
   * a Day map): the clusters then list none, and nothing can change until a light comes.
   */
  override updateBefore(frame: Parameters<ClusteredLightsNode['updateBefore']>[0]): boolean | undefined {
    if (this.clusteredLights.length === 0) {
      if (this.empty) return undefined;
      this.empty = true;
    } else this.empty = false;
    return super.updateBefore(frame);
  }

  /**
   * The grid sized each frame (Three's updateBefore calls this) to what the world is drawn into: the retro look's small
   * target, the stack's scene target or the canvas. Three's sizes it from the canvas, while a pixel finds its cluster
   * by its place in the target it is drawn into, so under the retro look every pixel read the wrong clusters and the
   * lamp pools and the torch's spot went missing (BP3). Shadow maps never get here: their material is unlit.
   */
  updateProgram(renderer: Sizing): void {
    const into = renderer.getRenderTarget();
    if (into) this.setSize(into.width, into.height);
    else {
      renderer.getDrawingBufferSize(canvas);
      this.setSize(canvas.width, canvas.height);
    }
  }

  /**
   * A new grid. A light-list buffer it outgrows is retired, to be freed once the frame is submitted (BP3): Three makes a
   * bigger one and leaves the old on the GPU (its own TODO), and a draw of this frame may still bind it.
   */
  create(width: number, height: number): void {
    const own = this as unknown as ClusteredInternals;
    const before = own._lightIndexes;
    (ClusteredLightsNode.prototype as unknown as { create(w: number, h: number): void }).create.call(this, width, height);
    if (before && before !== own._lightIndexes) this.retired.push(before.value);
  }

  /** The light-list buffer in use (for NightLighting to retire with the node), or null before the first grid. */
  get lightLists(): THREE.BufferAttribute | null {
    return (this as unknown as ClusteredInternals)._lightIndexes?.value ?? null;
  }

  /** The clustered lights (point and spot, no shadow, at most `capacity`) and Three's own (the rest). */
  override setLights(lights: Light[]): this {
    const clustered = this.clusteredLights;
    const material = this.materialLights;
    let c = 0;
    let m = 0;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i]!;
      if (c < this.capacity && clusters(light)) clustered[c++] = light;
      else material[m++] = light;
    }
    clustered.length = c;
    material.length = m;
    return LightsNode.prototype.setLights.call(this, lights) as this;
  }

  /** Each frame: the lights' data written in depth order, and each depth slice's range of them. Allocation-free. */
  updateLightsTexture(camera: THREE.Camera): void {
    const own = this as unknown as ClusteredInternals;
    const lights = this.clusteredLights;
    const count = lights.length;
    const depth = this.depth;
    const order = this.order;
    own._lightsCount.value = count;
    for (let i = 0; i < count; i++) {
      depth[i] = position.setFromMatrixPosition(lights[i]!.matrixWorld).applyMatrix4(camera.matrixWorldInverse).z;
      // Insertion by depth, nearest the far plane first (as Three's sort: ascending view z).
      let j = i;
      while (j > 0 && depth[order[j - 1]!]! > depth[i]!) {
        order[j] = order[j - 1]!;
        j--;
      }
      order[j] = i;
    }
    const data = own._lightsTexture.image.data as Float32Array;
    const line = this.capacity * 4;
    for (let k = 0; k < count; k++) {
      const light = lights[order[k]!]! as THREE.PointLight & Partial<THREE.SpotLight>;
      position.setFromMatrixPosition(light.matrixWorld);
      const o = k * 4;
      data[o] = position.x;
      data[o + 1] = position.y;
      data[o + 2] = position.z;
      data[o + 3] = light.distance;
      data[line + o] = light.color.r * light.intensity;
      data[line + o + 1] = light.color.g * light.intensity;
      data[line + o + 2] = light.color.b * light.intensity;
      data[line + o + 3] = light.decay;
      if (light.isSpotLight) {
        // Towards the light from its target, as Three's lightTargetDirection.
        target.setFromMatrixPosition(light.target!.matrixWorld);
        position.sub(target).normalize();
        data[2 * line + o] = position.x;
        data[2 * line + o + 1] = position.y;
        data[2 * line + o + 2] = position.z;
        data[2 * line + o + 3] = Math.cos(light.angle!);
        data[3 * line + o] = Math.cos(light.angle! * (1 - light.penumbra!));
      } else {
        data[2 * line + o + 3] = OPEN;
        data[3 * line + o] = OPEN + 1;
      }
    }
    own._lightsTexture.needsUpdate = true;
    // Each depth slice's range of lights in the sorted order (Three's own reckoning).
    const near = (camera as THREE.PerspectiveCamera).near;
    const far = (camera as THREE.PerspectiveCamera).far;
    const slices = this.zSlices;
    const ranges = own._zSliceRangesData;
    for (let z = 0; z < slices; z++) {
      const sliceNear = -(near * Math.pow(far / near, z / slices));
      const sliceFar = -(near * Math.pow(far / near, (z + 1) / slices));
      let start = count;
      let end = 0;
      for (let k = 0; k < count; k++) {
        const vz = depth[order[k]!]!;
        const reach = (lights[order[k]!]! as THREE.PointLight).distance;
        const r = reach > 0 ? reach : far;
        if (vz + r >= sliceFar && vz - r <= sliceNear) {
          if (k < start) start = k;
          if (k + 1 > end) end = k + 1;
        }
      }
      ranges[z * 4] = start >= count ? 0 : start;
      ranges[z * 4 + 1] = start >= count ? 0 : end;
    }
    own._zSliceRangesTexture.needsUpdate = true;
  }

  /** Light `index`'s data: Three's (position, reach, colour, decay) and the spot's direction and cosines. */
  getLightData(index: AnyNode): AnyNode {
    const own = this as unknown as ClusteredInternals;
    const i = int(index);
    const a: AnyNode = textureLoad(own._lightsTexture, ivec2(i, 0));
    const b: AnyNode = textureLoad(own._lightsTexture, ivec2(i, 1));
    const c: AnyNode = textureLoad(own._lightsTexture, ivec2(i, 2));
    const d: AnyNode = textureLoad(own._lightsTexture, ivec2(i, 3));
    const view: AnyNode = own._cameraViewMatrix;
    return {
      position: a.xyz,
      viewPosition: view.mul(vec4(a.xyz, 1.0)).xyz,
      distance: a.w,
      color: b.rgb,
      decay: b.w,
      spotDirection: view.mul(vec4(c.xyz, 0.0)).xyz,
      coneCos: c.w,
      penumbraCos: d.x,
    };
  }

  /** Three's own lights as usual, then the pixel's cluster's lights: point and spot, by the same formulas as Three's. */
  override setupLights(builder: NodeBuilder, lightNodes: AnyNode): void {
    const own = this as unknown as ClusteredInternals;
    // A material built between frames (a warm-up compile's) takes the grid the frames draw with; only the first build
    // makes one, sized for the target it is compiled into (BP3). The frame's resize rebuilds them, as on Three's.
    if (own._bufferSize === null) this.updateProgram(builder.renderer as unknown as Sizing);
    const reflected = (builder.context as unknown as { reflectedLight: { directDiffuse: AnyNode; directSpecular: AnyNode } }).reflectedLight;
    reflected.directDiffuse.toStack();
    reflected.directSpecular.toStack();
    LightsNode.prototype.setupLights.call(this, builder, lightNodes);
    const lightsNode = (builder as unknown as { lightsNode: { setupDirectLight(b: NodeBuilder, n: unknown, l: unknown): void } }).lightsNode;
    Fn(() => {
      Loop(this.maxLightsPerCluster, ({ i }: { i: AnyNode }) => {
        const index: AnyNode = own.getTile(i);
        If(index.equal(int(0)), () => {
          Break();
        });
        const light = this.getLightData(index.sub(1));
        const vector: AnyNode = light.viewPosition.sub(positionView);
        If(light.distance.equal(0).or(vector.dot(vector).lessThanEqual(light.distance.mul(light.distance))), () => {
          const lightDirection: AnyNode = vector.normalize();
          const fall = getDistanceAttenuation({ lightDistance: vector.length(), cutoffDistance: light.distance, decayExponent: light.decay });
          const cone = smoothstep(light.coneCos, light.penumbraCos, lightDirection.dot(light.spotDirection));
          lightsNode.setupDirectLight(builder, this, { lightDirection, lightColor: light.color.mul(fall).mul(cone) });
        });
      });
    }, 'void')();
  }
}

/**
 * The node renderer's lighting with clustered lights for one scene, the world's (`world`, set before its first draw),
 * and Three's own lights node for every other scene.
 */
export class NightLighting extends Lighting {
  /** The scene that takes the clustered node. */
  world: THREE.Object3D | null = null;
  private clustering = false;
  /** The clustered node made for the world (its textures and compute pass are freed with the renderer). */
  private made: NightLightsNode | null = null;
  /** Light-list buffers let go (a grid outgrown, a map's node replaced), freed after the frame (flush). */
  private readonly retired: THREE.BufferAttribute[] = [];

  override getNode(scene: THREE.Object3D): LightsNode {
    this.clustering = scene === this.world;
    return super.getNode(scene as THREE.Scene);
  }

  override createNode(lights: Light[] = []): LightsNode {
    if (!this.clustering) return new LightsNode().setLights(lights);
    this.retire();
    return (this.made = new NightLightsNode(CLUSTERED_LIGHTS.maxLights, this.retired).setLights(lights));
  }

  /**
   * After each frame's draws are submitted: frees the light-list buffers let go during it (BP3). Three frees no storage
   * buffer of its own accord, and one freed before the submit would drop the frame.
   */
  flush(renderer: WebGPURenderer): void {
    for (const buffer of this.retired) freeBuffer(renderer, buffer);
    this.retired.length = 0;
  }

  /** Frees the clustered node's textures, compute pass and light lists. */
  dispose(renderer: WebGPURenderer): void {
    this.retire();
    this.made = null;
    this.flush(renderer);
  }

  /** The node made for the world freed, its light lists retired. */
  private retire(): void {
    if (!this.made) return;
    const lists = this.made.lightLists;
    if (lists) this.retired.push(lists);
    this.made.dispose();
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBasicNodeMaterial, RenderTarget, type WebGPURenderer } from 'three/webgpu';
import { attribute, normalLocal, vec4 } from 'three/tsl';
import { DRESSING } from '../../../config/dressing';
import { GPU_FOREST } from '../../../config/gpuDressing';
import { createRng } from '../../../sim/rng';
import { detailedTree, painted } from '../../atmosphere';

/**
 * The tree stand-ins' pictures (WebGPU overhaul W5; drawn by forestStandIns.ts): the game's own tree shapes (the
 * detailed ring's pines and broadleaves, render/atmosphere.ts detailedTree, in the treeline's greens) taken by the node renderer itself from
 * GPU_FOREST.views sides each, into two atlases of GPU_FOREST.tile-pixel squares, a row a variant and a column a side:
 * their colour (sRGB in 8 bits, the shapes' flat paint, unlit) and their normals in the tree's own frame (each facet's,
 * as the ring's flat shading has them), so the stand-ins are lit by the scene's own lights where they stand. Each
 * tree is scaled to one unit from its foot to its top, its foot `FOOT` up its square and its top `FOOT + FILL` (the
 * stand-in is sized to match).
 * Mipmapped, so a far stand-in doesn't shimmer.
 */

/** Where a tree stands in its square: its foot this far up, and how much of the square its unit height fills. */
export const FOOT = 0.04;
export const FILL = 0.92;

/**
 * The shapes of variant `v`: the first half pines, the rest broadleaves, each painted one of the treeline's dark
 * conifer greens (config/dressing.ts DRESSING.treeline: the wood beyond the fence reads as the dark band in front of
 * it does, not as the day's lighter ring), merged and faceted.
 */
function variantShape(v: number): THREE.BufferGeometry {
  const colours = DRESSING.treeline.colours;
  const parts: THREE.BufferGeometry[] = [];
  const broad = v >= GPU_FOREST.variants / 2;
  const green = Number.parseInt(colours[v % colours.length]!.slice(1), 16);
  detailedTree(createRng(GPU_FOREST.seed + v), 0, 0, 1, green, broad, (geo, colour) => painted(geo, colour), parts);
  const merged = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  // Scaled to stand one unit tall from its foot (a broadleaf's top crown rises past the height it was built at); every
  // shape is narrower than it is tall, so any side of it fits its square.
  merged.computeBoundingBox();
  merged.scale(1 / merged.boundingBox!.max.y, 1 / merged.boundingBox!.max.y, 1 / merged.boundingBox!.max.y);
  // Non-indexed: each vertex takes its facet's normal, as the ring's flat shading draws it.
  merged.computeVertexNormals();
  return merged;
}

/** A target the size of the atlas, mipmapped, cleared to clear. */
function atlasTarget(): RenderTarget {
  const F = GPU_FOREST;
  const t = new RenderTarget(F.views * F.tile, F.variants * F.tile, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  t.texture.name = 'forest-atlas';
  return t;
}

export class ForestAtlas {
  readonly colour: THREE.Texture;
  readonly normal: THREE.Texture;
  private readonly targets: RenderTarget[];

  /** Takes the pictures now, on `renderer` (its target and clear colour are put back after). */
  constructor(renderer: WebGPURenderer) {
    const F = GPU_FOREST;
    const scene = new THREE.Scene();
    const shapes = Array.from({ length: F.variants }, (_, v) => variantShape(v));
    const colourMaterial = new MeshBasicNodeMaterial();
    colourMaterial.colorNode = vec4(attribute('color', 'vec3').pow(1 / 2.2), 1);
    const normalMaterial = new MeshBasicNodeMaterial();
    normalMaterial.colorNode = vec4(normalLocal.mul(0.5).add(0.5), 1);
    const meshes: THREE.Mesh[] = [];
    for (let v = 0; v < F.variants; v++) {
      for (let a = 0; a < F.views; a++) {
        // Turning the tree by −θ is the camera going round it by θ: the side seen from azimuth θ (sin θ, cos θ).
        const m = new THREE.Mesh(shapes[v], colourMaterial);
        m.position.set(a + 0.5, v + FOOT, 0);
        m.scale.setScalar(FILL);
        m.rotation.y = -(a / F.views) * Math.PI * 2;
        scene.add(m);
        meshes.push(m);
      }
    }
    // Looking along −z at the squares (a unit each), far enough either side for the widest crown.
    const camera = new THREE.OrthographicCamera(0, F.views, F.variants, 0, -2, 2);
    camera.position.set(0, 0, 1);
    camera.updateMatrixWorld();
    const before = { target: renderer.getRenderTarget(), colour: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha() };
    // Both pictures are taken through one depth buffer, freed once they are: only the atlases stay on the GPU.
    const depth = new THREE.DepthTexture(F.views * F.tile, F.variants * F.tile);
    this.targets = [atlasTarget(), atlasTarget()];
    renderer.setClearColor(0x000000, 0);
    for (const [k, material] of [colourMaterial, normalMaterial].entries()) {
      for (const m of meshes) m.material = material;
      const target = this.targets[k]!;
      target.depthTexture = depth;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, camera);
    }
    renderer.setRenderTarget(before.target);
    renderer.setClearColor(before.colour, before.alpha);
    for (const t of this.targets) t.depthTexture = null;
    depth.dispose();
    for (const s of shapes) s.dispose();
    colourMaterial.dispose();
    normalMaterial.dispose();
    this.colour = this.targets[0]!.texture;
    this.normal = this.targets[1]!.texture;
  }

  /** Frees both atlases. */
  dispose(): void {
    for (const t of this.targets) t.dispose();
  }
}

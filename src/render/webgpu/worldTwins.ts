import * as THREE from 'three';
import { type NodeMaterial, PMREMGenerator, type WebGPURenderer } from 'three/webgpu';
import { disposeEnvironmentScene, type EnvironmentLook, ReplicaSheen, skyEnvironmentScene } from '../replicaSheen';
import { REPLICA_SHEEN } from '../../config/render';
import { copyOnto, flamesTwin, smokeTwin } from './effectNodes';
import { figureTwin } from './figureNodes';
import { PointSprites } from './pointSprites';
import { emptyGrid, SurfaceLambertTwin, SurfaceNodes, surfaceRecipe, SurfaceStandardTwin } from './surfaceNodes';

/**
 * The world's materials on the node path (WebGPU overhaul W2). Three's node library turns each plain material into a
 * node material as it builds its program, ignoring `onBeforeCompile`; here it is asked first for a twin. A material is
 * known by its program key (`customProgramCacheKey`, the same key WebGL compiles its patch under), so every world
 * patch has exactly one twin and every material sharing a WebGL program shares a node program:
 *
 * | Program key | Patch | Twin |
 * |---|---|---|
 * | `surface:…` (+ `:puddles`, `:dressing-junk[-neon]`) | surfaceShader.ts, dressingMeshes.ts | surfaceNodes.ts |
 * | `without-environment:sky-host` | skyHost.ts | surfaceNodes.ts |
 * | `light-fixtures-flames` | lightFixtures.ts | effectNodes.ts flamesTwin |
 * | `smoke-plumes` | smokePlumes.ts (smoke and steam) | effectNodes.ts smokeTwin |
 * | `night-sky-stars`, `light-fixtures-embers`, `fireflies`, the motes' | nightSky.ts, lightFixtures.ts, fireflies.ts, dustMotes.ts | pointSprites.ts |
 * | `without-environment`, `night-sky-moon` | surfaceMaterials.ts, nightSky.ts | none: Three's own (node Lambert and Basic never take the scene's environment) |
 * | `fa8-vertex-finish` | figureFinish.ts (the detailed figures) | figureNodes.ts (W3) |
 *
 * The GLSL post passes and the retro filter (W4) are not materials of the scene. The prefiltered sky is made here too,
 * with the node renderer's own prefilter: the scene's environment map (what Standard surfaces and figures reflect) and
 * the held replica's sheen (W3), one target for both, as the WebGL path's ReplicaSheen is.
 */

export class WorldTwins {
  /** The sized points' sprite twins. */
  readonly sprites = new PointSprites();
  /** The baked-light read's stand-in texture until an object's grid is read. */
  private readonly grid = emptyGrid();
  /** The prefiltered sky per look, made with the node renderer (the WebGL path's is the Renderer's ReplicaSheen). */
  private readonly sky: ReplicaSheen;
  /** Three's own conversion, given back on dispose. */
  private readonly own: WebGPURenderer['library']['fromMaterial'];

  constructor(private readonly renderer: WebGPURenderer) {
    const library = renderer.library;
    const own = (this.own = library.fromMaterial);
    library.fromMaterial = ((material: THREE.Material) => worldTwin(material, this.grid) ?? own.call(library, material)) as typeof own;
    this.sky = new ReplicaSheen((_gl, look) => this.prefilter(look));
  }

  /**
   * The prefiltered sky for `look` while `on`, else null: the scene's environment map (Settings › Environment lighting)
   * and the held replica's sheen (Replica sheen, W3) both ask. Made on first want; freed by `trim` when neither wants it.
   */
  environment(on: boolean, look: EnvironmentLook): THREE.Texture | null {
    return this.sky.texture(undefined as unknown as THREE.WebGLRenderer, on, look);
  }

  /** The settings changed: with neither the environment nor the sheen on (`on` false), the prefiltered sky is freed. */
  trim(on: boolean): void {
    this.sky.trim(on);
  }

  dispose(): void {
    this.renderer.library.fromMaterial = this.own;
    this.sprites.dispose();
    this.sky.dispose();
    this.grid.dispose();
  }

  /** The sky prefiltered as the WebGL path's (replicaSheen.ts prefilterSky), by the node renderer. */
  private prefilter(look: EnvironmentLook): { texture: THREE.Texture; dispose(): void } {
    const pmrem = new PMREMGenerator(this.renderer);
    const scene = skyEnvironmentScene(look);
    const target = pmrem.fromScene(scene, REPLICA_SHEEN.blur);
    disposeEnvironmentScene(scene);
    pmrem.dispose();
    return target;
  }
}

/**
 * The node twin of a world material (a new one per build, as Three's library makes them), or null for one Three's
 * library draws as it is. `grid`: the baked-light stand-in texture.
 */
export function worldTwin(material: THREE.Material, grid: THREE.Data3DTexture): NodeMaterial | null {
  if ((material as Partial<NodeMaterial>).isNodeMaterial) return null;
  const key = material.customProgramCacheKey();
  const recipe = surfaceRecipe(key);
  if (recipe && (material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshStandardMaterial)) {
    const twin = copyOnto(material, material instanceof THREE.MeshStandardMaterial ? new SurfaceStandardTwin() : new SurfaceLambertTwin());
    twin.surface = new SurfaceNodes(recipe, grid);
    return twin;
  }
  if (key === 'light-fixtures-flames') return flamesTwin(material);
  if (key === 'smoke-plumes') return smokeTwin(material);
  return figureTwin(material);
}

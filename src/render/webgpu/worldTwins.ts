import * as THREE from 'three';
import { type NodeMaterial, PMREMGenerator, type WebGPURenderer } from 'three/webgpu';
import { disposeEnvironmentScene, type EnvironmentLook, ReplicaSheen, skyEnvironmentScene } from '../replicaSheen';
import { REPLICA_SHEEN } from '../../config/render';
import { copyOnto, flamesTwin, smokeTwin } from './effectNodes';
import { figureTwin } from './figureNodes';
import { PointSprites } from './pointSprites';
import { type CarriedPatch, nodePatchOf } from '../nodePatch';
import { emptyGrid, SurfaceLambertTwin, SurfaceNodes, SurfaceStandardTwin } from './surfaceNodes';

/**
 * The world's materials on the node path (WebGPU overhaul W2; W6b). Three's node library turns each plain material into
 * a node material as it builds its program; here it is asked first for the node material of the patch the material
 * carries (render/nodePatch.ts). Every material sharing a patch's program key shares that node program, and reads its
 * own uniforms per draw (twinUniforms.ts):
 *
 * - a surface patch (the map surfaces, the set dressing's junk and puddles, the sky host): surfaceNodes.ts;
 * - the flames and the smoke: effectNodes.ts flamesTwin and smokeTwin;
 * - the figures' per-vertex finish and your sleeves' camo: figureNodes.ts (W3);
 * - the sized points (stars, embers, fireflies, dust motes): sprites (pointSprites.ts), their Points left undrawn.
 *
 * A material with no patch is Three's own (node Lambert and Basic never take the scene's environment). The post passes
 * and the retro filter (W4) are not materials of the scene. The prefiltered sky is made here too, with the node
 * renderer's own prefilter: the scene's environment map (what Standard surfaces and figures reflect) and the held
 * replica's sheen (W3), one target for both (ReplicaSheen).
 */

export class WorldTwins {
  /** The sized points' sprite twins (but those a compute pass moves and draws, W5: `claimed`). */
  readonly sprites: PointSprites;
  /** The baked-light read's stand-in texture until an object's grid is read. */
  private readonly grid = emptyGrid();
  /** The prefiltered sky per look, made with the node renderer. */
  private readonly sky: ReplicaSheen;
  /** Three's own conversion, given back on dispose. */
  private readonly own: WebGPURenderer['library']['fromMaterial'];

  constructor(
    private readonly renderer: WebGPURenderer,
    claimed?: (points: THREE.Points) => boolean,
  ) {
    this.sprites = new PointSprites(claimed);
    const library = renderer.library;
    const own = (this.own = library.fromMaterial);
    library.fromMaterial = ((material: THREE.Material) => worldTwin(material, this.grid) ?? own.call(library, material)) as typeof own;
    this.sky = new ReplicaSheen((look) => this.prefilter(look));
  }

  /**
   * The prefiltered sky for `look` while `on`, else null: the scene's environment map (Settings › Environment lighting)
   * and the held replica's sheen (Replica sheen, W3) both ask. Made on first want; freed by `trim` when neither wants it.
   */
  environment(on: boolean, look: EnvironmentLook): THREE.Texture | null {
    return this.sky.texture(on, look);
  }

  /** The settings changed: with neither the environment nor the sheen on (`on` false), the prefiltered sky is freed. */
  trim(on: boolean): void {
    this.sky.trim(on);
  }

  /** The patch `material` carries, or null (the browser checks read what the scene draws, and set its uniforms). */
  patchOf(material: THREE.Material): CarriedPatch | null {
    return nodePatchOf(material);
  }

  dispose(): void {
    this.renderer.library.fromMaterial = this.own;
    this.sprites.dispose();
    this.sky.dispose();
    this.grid.dispose();
  }

  /** The sky prefiltered by the node renderer: the environment scene (replicaSheen.ts) through its PMREM. */
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
 * The node material of a world material's patch (a new one per build, as Three's library makes them), or null for one
 * Three's library draws as it is (no patch, or a sized point's: its sprite draws it). `grid`: the baked-light stand-in.
 */
export function worldTwin(material: THREE.Material, grid: THREE.Data3DTexture): NodeMaterial | null {
  if ((material as Partial<NodeMaterial>).isNodeMaterial) return null;
  const carried = nodePatchOf(material);
  if (!carried) return null;
  const { patch, uniforms } = carried;
  switch (patch.kind) {
    case 'surface': {
      if (!(material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshStandardMaterial)) return null;
      const twin = copyOnto(material, material instanceof THREE.MeshStandardMaterial ? new SurfaceStandardTwin() : new SurfaceLambertTwin());
      // The baked-light read starts on this material's own grid (its map's), so the first draws bind it (see objectTexture3D).
      const own = patch.recipe.probes ? (uniforms.bakeTex?.value as THREE.Data3DTexture | null | undefined) : null;
      twin.surface = new SurfaceNodes(patch.recipe, own ?? grid);
      return twin;
    }
    case 'flames':
      return flamesTwin(material);
    case 'smoke':
      return smokeTwin(material);
    case 'figure-finish':
    case 'sleeve-camo':
      return figureTwin(material);
    default:
      return null;
  }
}

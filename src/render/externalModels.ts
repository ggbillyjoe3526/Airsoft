import * as THREE from 'three';
import { clone as cloneWithSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FIGURE_MODEL, FIGURE_PARTS, type FigurePart } from '../config/assets';

/**
 * Optional external models (M25a, docs/CC0_ASSETS.md). A figure model is `src/assets/models/characters/figure.glb`:
 * Vite finds it when the game is built (or the dev server starts), so without one nothing is fetched and the built-in
 * figures are drawn. With one, the game loads it once at start and every figure uses it; anything wrong with the file
 * logs a warning and falls back to the built-in figures.
 */
const FIGURE_FILES = import.meta.glob<string>('../assets/models/characters/figure.glb', { query: '?url', import: 'default', eager: true });

/** A figure model, ready to clone per figure: its parts in figure space (metres, feet at the origin, facing -Z). */
export interface FigureModel {
  /** The named parts it has (FIGURE_PARTS). The built-in figure draws any part it lacks. */
  parts: Partial<Record<FigurePart, THREE.Object3D>>;
  /**
   * The whole model, when it names none of the parts: drawn as a static body (no walk cycle, crouch or lean), with the
   * built-in arms and replica, so a model straight from a CC0 pack shows up at once.
   */
  whole: THREE.Object3D | null;
  /** Frees its geometry, materials and textures (figures only borrow the geometry; their materials are their own). */
  dispose(): void;
}

/** The figure model's URL in this build, or null when there is none. */
export function figureModelUrl(): string | null {
  return Object.values(FIGURE_FILES)[0] ?? null;
}

/** The first four bytes of a binary glTF file: "glTF". */
const GLB_MAGIC = 0x46546c67;

/** Loads the figure model at `url` (this build's, by default). Resolves to null when there is none or it can't be used. */
export async function loadFigureModel(url = figureModelUrl()): Promise<FigureModel | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    if (data.byteLength < 12 || new DataView(data).getUint32(0, true) !== GLB_MAGIC) throw new Error('not a binary glTF (.glb) file');
    if (data.byteLength > FIGURE_MODEL.warnBytes) console.warn(`The figure model is ${(data.byteLength / 1e6).toFixed(1)} MB, over its ${FIGURE_MODEL.warnBytes / 1e6} MB budget (docs/CC0_ASSETS.md).`);
    // The loader only joins the download when there is a model to load. Meshopt-compressed files (gltfpack,
    // glTF-Transform) decode in the page; Draco and KTX2 need decoder files the game doesn't ship.
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js')]);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, '');
    return prepareFigureModel(gltf.scene);
  } catch (err) {
    console.warn(`The figure model (${url}) could not be used, so the built-in figures are drawn instead:`, err);
    return null;
  }
}

/**
 * Fits a loaded scene to the figures (turned by FIGURE_MODEL.yaw, scaled to FIGURE_MODEL.height, feet on the ground)
 * and takes out its named parts, each in figure space. Exported for the tests.
 */
export function prepareFigureModel(scene: THREE.Object3D): FigureModel {
  const fit = new THREE.Group();
  fit.rotation.y = FIGURE_MODEL.yaw;
  fit.add(scene);
  fit.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(fit);
  const tall = box.max.y - box.min.y;
  if (!(tall > 0)) throw new Error('the model has no size');
  const scale = FIGURE_MODEL.height / tall;
  fit.scale.setScalar(scale);
  fit.position.y = -box.min.y * scale;
  fit.updateMatrixWorld(true);

  const parts: Partial<Record<FigurePart, THREE.Object3D>> = {};
  for (const name of FIGURE_PARTS) {
    const node = scene.getObjectByName(name);
    if (!node) continue;
    // A holder at the figure's origin, with the node attached under it at the same place in the figure.
    const holder = new THREE.Group();
    holder.name = name;
    holder.attach(node);
    parts[name] = holder;
  }
  const whole = Object.keys(parts).length === 0 ? fit : null;
  const all = [...Object.values(parts), ...(whole ? [whole] : [])];
  for (const root of all) {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }
  return {
    parts,
    whole,
    dispose: () => {
      for (const root of [...all, fit]) {
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) disposeMaterial(m);
        });
      }
    },
  };
}

/** Disposes a material and every texture it holds. */
function disposeMaterial(m: THREE.Material): void {
  for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
  m.dispose();
}

/**
 * A copy of model part `part` for one figure: the geometry is shared (marked so disposeFigure leaves it), every
 * material is its own copy (so one figure can fade on its own), and team materials are painted `teamColor`. Pushes the
 * copied materials to `materials`. A skinned mesh gets its own skeleton, so each figure stands where it is drawn.
 */
export function instanceModelPart(part: THREE.Object3D, teamColor: number, materials: THREE.Material[]): THREE.Object3D {
  const copy = cloneWithSkeleton(part);
  const prefix = FIGURE_MODEL.teamMaterialPrefix.toLowerCase();
  copy.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.userData.sharedGeometry = true;
    const own = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      if (c.name.toLowerCase().startsWith(prefix) && 'color' in c && c.color instanceof THREE.Color) c.color.setHex(teamColor);
      materials.push(c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  return copy;
}

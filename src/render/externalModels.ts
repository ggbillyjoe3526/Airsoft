import * as THREE from 'three';
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
  bakeSkinnedMeshes(scene);
  const box = new THREE.Box3().setFromObject(fit);
  const tall = box.max.y - box.min.y;
  if (!(tall > 0)) throw new Error('the model has no size');
  const scale = FIGURE_MODEL.height / tall;
  fit.scale.setScalar(scale);
  fit.position.y = -box.min.y * scale;
  fit.updateMatrixWorld(true);

  const parts: Partial<Record<FigurePart, THREE.Object3D>> = {};
  for (const name of FIGURE_PARTS) {
    // The first node of that name with a mesh in it (a rig's bone can share a part's name).
    const node = scene.getObjectsByProperty('name', name).find(hasMesh);
    if (!node) continue;
    // A holder at the figure's origin, with the node attached under it at the same place in the figure.
    const holder = new THREE.Group();
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

/** Whether `root` is or holds a mesh. */
function hasMesh(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) found = true;
  });
  return found;
}

/**
 * Replaces every skinned mesh under `root` with a plain mesh of the same shape in the pose its rig is in now (the
 * rest pose, for a model straight from a file). The game doesn't play glTF animations yet; a static mesh can be
 * moved anywhere by the figure's parts without its bones, which stay behind in the rig.
 */
function bakeSkinnedMeshes(root: THREE.Object3D): void {
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) skinned.push(o);
  });
  const v = new THREE.Vector3();
  const d = new THREE.Vector4();
  for (const mesh of skinned) {
    const geometry = mesh.geometry.clone();
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      mesh.applyBoneTransform(i, v.fromBufferAttribute(position, i));
      position.setXYZ(i, v.x, v.y, v.z);
    }
    for (const name of ['normal', 'tangent'] as const) {
      const attr = geometry.getAttribute(name);
      if (!attr) continue;
      for (let i = 0; i < attr.count; i++) {
        mesh.applyBoneTransform(i, d.set(attr.getX(i), attr.getY(i), attr.getZ(i), 0));
        v.set(d.x, d.y, d.z).normalize();
        attr.setXYZ(i, v.x, v.y, v.z);
      }
    }
    geometry.deleteAttribute('skinIndex');
    geometry.deleteAttribute('skinWeight');
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const baked = new THREE.Mesh(geometry, mesh.material);
    baked.name = mesh.name;
    baked.position.copy(mesh.position);
    baked.quaternion.copy(mesh.quaternion);
    baked.scale.copy(mesh.scale);
    for (const child of [...mesh.children]) baked.add(child);
    const parent = mesh.parent!;
    parent.children[parent.children.indexOf(mesh)] = baked;
    baked.parent = parent;
    mesh.parent = null;
    mesh.geometry.dispose();
    mesh.skeleton.dispose();
  }
  root.updateMatrixWorld(true);
}

/** Disposes a material and every texture it holds. */
function disposeMaterial(m: THREE.Material): void {
  for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
  m.dispose();
}

/**
 * A copy of model part `part` for one figure: the geometry is shared (marked so disposeFigure leaves it), every
 * material is its own copy (so one figure can fade on its own), and team materials are painted `teamColor`. Pushes the
 * copied materials to `materials`, each with its authored opacity kept in `userData` (see fadeModelMaterials).
 */
export function instanceModelPart(part: THREE.Object3D, teamColor: number, materials: THREE.Material[]): THREE.Object3D {
  const copy = part.clone();
  const prefix = FIGURE_MODEL.teamMaterialPrefix.toLowerCase();
  copy.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.userData.sharedGeometry = true;
    const own = (m: THREE.Material): THREE.Material => {
      const c = m.clone();
      c.userData.authored = { opacity: c.opacity, transparent: c.transparent };
      if (c.name.toLowerCase().startsWith(prefix) && 'color' in c && c.color instanceof THREE.Color) c.color.setHex(teamColor);
      materials.push(c);
      return c;
    };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
  });
  return copy;
}

/**
 * Fades a figure's copies of the model materials to `opacity` (1: as authored), keeping any see-through material the
 * model was authored with. `switched` says the figure has just started or stopped fading.
 */
export function fadeModelMaterials(materials: readonly THREE.Material[], opacity: number, switched: boolean): void {
  for (const m of materials) {
    const authored = m.userData.authored as { opacity: number; transparent: boolean };
    m.opacity = authored.opacity * opacity;
    if (switched) {
      m.transparent = authored.transparent || opacity < 1;
      m.needsUpdate = true;
    }
  }
}

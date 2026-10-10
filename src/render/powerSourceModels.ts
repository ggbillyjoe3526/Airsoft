import * as THREE from 'three';
import { POWER_SOURCE_FILE } from '../config/assets';
import { loadGltfScene } from './externalModels';

/**
 * Power-source models (RM3, config/assets.ts POWER_SOURCE_FILE): the battery, LiPo and gas bottle the menus picture,
 * from `src/assets/models/powerSources/<file>.glb`. Nothing loads at start: a file is fetched the first time a picture
 * of it is asked for, and kept for the visit.
 */
const FILES = import.meta.glob<string>('../assets/models/powerSources/*.glb', { query: '?url', import: 'default', eager: true });

/** A power source ready to picture: its model (drawn as is) and the material its label colour goes on, if any. */
export interface PowerSourceModel {
  readonly group: THREE.Object3D;
  /** The `Label` material, coloured per item before each picture; null when the file has none. */
  readonly label: THREE.MeshStandardMaterial | null;
}

/** Loads a power-source model by file name: the model, or null when there is no such file or it can't be used. */
export type PowerSourceLoader = (file: string) => Promise<PowerSourceModel | null>;

/** No power-source models (the unit tests' default): every power source keeps its line drawing. */
export const NO_POWER_SOURCES: PowerSourceLoader = () => Promise.resolve(null);

/** This build's power-source model files, by file name. */
export function powerSourceFileUrls(): Map<string, string> {
  const urls = new Map<string, string>();
  for (const [path, url] of Object.entries(FILES)) urls.set(path.slice(path.lastIndexOf('/') + 1, -'.glb'.length), url);
  return urls;
}

/**
 * The game's loader: each of `urls` (this build's, by default) fetched once, on its first ask; one that can't be used
 * warns once and gives null from then on, so the menus keep the line drawing without fetching it again.
 */
export function powerSourceLoader(urls: ReadonlyMap<string, string> = powerSourceFileUrls()): PowerSourceLoader {
  const loads = new Map<string, Promise<PowerSourceModel | null>>();
  return (file) => {
    let found = loads.get(file);
    if (!found) {
      const url = urls.get(file);
      found = url
        ? loadGltfScene(url, POWER_SOURCE_FILE.warnBytes, `The ${file} power-source model`)
            .then((scene) => preparePowerSource(scene, POWER_SOURCE_FILE.turns[file]))
            .catch((err: unknown) => {
              console.warn(`The ${file} power-source model (${url}) could not be used, so its line drawing is shown instead:`, err);
              return null;
            })
        : Promise.resolve(null);
      loads.set(file, found);
    }
    return found;
  };
}

/**
 * Makes a loaded file's scene ready to picture: turned by `turn` (POWER_SOURCE_FILE.turns), every material a plain
 * standard one with the file's colour and roughness, no more metallic than POWER_SOURCE_FILE.maxMetalness, and the
 * `Label` material kept apart to be coloured. Throws when the scene has no mesh. Exported for the tests.
 */
export function preparePowerSource(scene: THREE.Object3D, turn: readonly [number, number, number] = [0, 0, 0]): PowerSourceModel {
  const made = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  let label: THREE.MeshStandardMaterial | null = null;
  let meshes = 0;
  // Lights and cameras in the file would light or frame the studio: the picture has its own.
  const strays: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Light).isLight || (o as THREE.Camera).isCamera) strays.push(o);
    if (!(o instanceof THREE.Mesh)) return;
    meshes++;
    const own = (m: THREE.Material): THREE.MeshStandardMaterial => {
      let mat = made.get(m);
      if (!mat) {
        const src = m as Partial<THREE.MeshStandardMaterial>;
        mat = new THREE.MeshStandardMaterial({
          name: m.name,
          color: src.color ?? 0xffffff,
          roughness: src.roughness ?? 0.5,
          metalness: Math.min(src.metalness ?? 0, POWER_SOURCE_FILE.maxMetalness),
        });
        if (m.name.toLowerCase() === POWER_SOURCE_FILE.labelMaterial.toLowerCase()) label = mat;
        made.set(m, mat);
        m.dispose();
      }
      return mat;
    };
    o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material as THREE.Material);
  });
  for (const o of strays) o.removeFromParent();
  if (meshes === 0) throw new Error('no mesh');
  const group = new THREE.Group();
  group.rotation.set(...turn);
  group.add(scene);
  return { group, label };
}

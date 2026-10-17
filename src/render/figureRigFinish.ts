import * as THREE from 'three';
import { CAMO_ATTRIBUTE } from './figureCamo';
import { FINISH_ATTRIBUTE, useVertexFinish } from './figureFinish';

/**
 * One draw for a rigged figure's plain materials (BD1): every material of the file that is one colour (no map), opaque,
 * unlit and not the team's is drawn by one vertex-coloured material that reads each vertex's roughness and metalness
 * (the built-in figure's finish, render/figureFinish.ts). Its colour goes into the vertex colours, its roughness and
 * metalness into the `finish` attribute. The robot's shell, joints, visor and gloss become one draw instead of four;
 * the team paint, the glows and anything textured keep their own. A file with fewer than two such materials is left as
 * it is (the human's).
 */
export interface FigureFinish {
  /** The figure's materials: the finish first, then the file's others in their order. */
  readonly materials: readonly THREE.Material[];
  /** The material index a mesh of the file is drawn in. */
  indexOf(material: THREE.Material): number;
  /** A mesh's geometry with the attributes every merged part needs (made once per mesh). */
  geometryOf(mesh: THREE.Mesh): THREE.BufferGeometry;
  dispose(): void;
}

/** Whether `m` can be drawn in the shared finish: a plain Standard material in one colour, opaque, unlit, not the team's. */
export function finishable(m: THREE.Material, teamPrefix: string): m is THREE.MeshStandardMaterial {
  const s = m as THREE.MeshStandardMaterial & { isMeshPhysicalMaterial?: boolean };
  if (s.isMeshStandardMaterial !== true || s.isMeshPhysicalMaterial === true) return false;
  if (s.map || s.roughnessMap || s.metalnessMap || s.normalMap || s.bumpMap || s.emissiveMap || s.alphaMap || s.aoMap || s.lightMap) return false;
  if (s.transparent || s.opacity !== 1 || s.alphaTest !== 0) return false;
  if (s.emissive.r > 0 || s.emissive.g > 0 || s.emissive.b > 0) return false;
  return !m.name.toLowerCase().startsWith(teamPrefix);
}

/** The finish for a file's `materials` (each once, in order), or null when fewer than two can share it. */
export function figureFinish(materials: readonly THREE.Material[], teamPrefix: string): FigureFinish | null {
  const shared = materials.filter((m): m is THREE.MeshStandardMaterial => finishable(m, teamPrefix));
  const side = shared[0]?.side ?? THREE.FrontSide;
  const merged = shared.filter((m) => m.side === side);
  if (merged.length < 2) return null;
  const finish = useVertexFinish(new THREE.MeshStandardMaterial({ name: 'Finish', color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0, side }));
  finish.envMapIntensity = merged[0]!.envMapIntensity;
  const others = materials.filter((m) => !merged.includes(m as THREE.MeshStandardMaterial));
  const list = [finish, ...others];
  const prepared = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const colour = new THREE.Color();

  const geometryOf = (mesh: THREE.Mesh): THREE.BufferGeometry => {
    const source = mesh.geometry;
    const kept = prepared.get(source);
    if (kept) return kept;
    const material = mesh.material as THREE.Material;
    const into = merged.includes(material as THREE.MeshStandardMaterial) ? (material as THREE.MeshStandardMaterial) : null;
    const g = source.clone();
    const count = g.getAttribute('position').count;
    const from = source.getAttribute('color') as THREE.BufferAttribute | undefined;
    const colours = new Float32Array(count * 4);
    const finishes = new Float32Array(count * 2);
    const s = material as Partial<THREE.MeshStandardMaterial>;
    const rough = s.roughness ?? 1;
    const metal = s.metalness ?? 0;
    // The finish's colour is the material's, times the vertex colours the material read; the others keep their own.
    const tint = into !== null;
    if (tint) colour.copy(into.color);
    const useVertex = !tint || into.vertexColors;
    for (let i = 0; i < count; i++) {
      const r = from && useVertex ? from.getX(i) : 1;
      const gg = from && useVertex ? from.getY(i) : 1;
      const b = from && useVertex ? from.getZ(i) : 1;
      const a = from && useVertex && from.itemSize > 3 ? from.getW(i) : 1;
      colours[i * 4] = tint ? r * colour.r : r;
      colours[i * 4 + 1] = tint ? gg * colour.g : gg;
      colours[i * 4 + 2] = tint ? b * colour.b : b;
      colours[i * 4 + 3] = a;
      finishes[i * 2] = rough;
      finishes[i * 2 + 1] = metal;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colours, 4));
    g.setAttribute(FINISH_ATTRIBUTE, new THREE.BufferAttribute(finishes, 2));
    g.setAttribute(CAMO_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(count), 1));
    prepared.set(source, g);
    return g;
  };

  return {
    materials: list,
    indexOf: (m) => (merged.includes(m as THREE.MeshStandardMaterial) ? 0 : list.indexOf(m)),
    geometryOf,
    dispose: () => {
      for (const g of prepared.values()) g.dispose();
      prepared.clear();
      finish.dispose();
    },
  };
}

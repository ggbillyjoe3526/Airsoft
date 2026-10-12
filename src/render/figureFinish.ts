import type * as THREE from 'three';
import { carryNodePatch, nodePatchOf } from './nodePatch';

/**
 * A per-vertex finish for vertex-coloured models (FA8): each vertex carries its own roughness and metalness in a
 * `finish` attribute (vec2), so one MeshStandardMaterial draws matte fabric, a glossy goggle lens and a helmet shell in
 * a single draw call. Three has no per-vertex roughness, so the material's node patch reads the attribute where Three
 * would read the material's (render/webgpu/figureNodes.ts). Every material given it shares one program.
 *
 * The same patch prints the team camo (G11, render/figureCamo.ts) per pixel on the vertices whose `camo` attribute
 * names a pattern (0: none), from each vertex's own position in the part.
 */
export const FINISH_ATTRIBUTE = 'finish';

/** Makes `material` read its roughness and metalness from each vertex's `finish` attribute, and print its camo. Returns it. */
export function useVertexFinish<M extends THREE.MeshStandardMaterial>(material: M): M {
  return carryNodePatch(material, { kind: 'figure-finish' });
}

/** True if `material` reads the per-vertex finish (useVertexFinish). */
export function hasVertexFinish(material: THREE.Material): boolean {
  return nodePatchOf(material)?.patch.kind === 'figure-finish';
}

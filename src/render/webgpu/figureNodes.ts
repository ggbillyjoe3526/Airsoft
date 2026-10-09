import type * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute } from 'three/tsl';
import { FINISH_ATTRIBUTE, hasVertexFinish } from '../figureFinish';
import { copyOnto } from './effectNodes';

/**
 * The node twin of the figures' per-vertex finish (render/figureFinish.ts, FA8; WebGPU overhaul W3). The detailed
 * figure (Player detail High: Medium and up) is one vertex-coloured Standard material whose GLSL patch reads each
 * vertex's roughness and metalness from its `finish` attribute (vec2) where Three would read the material's: matte
 * fabric, a glossy goggle lens and helmet shell, steel barrels, in one draw. The twin reads the same attribute in the
 * same places (`roughnessNode`, `metalnessNode`), so Three's own clamping and geometry roughness follow as in the GLSL.
 *
 * Everything else a figure shows is the plain material's, read per drawn object from the material the figure carries
 * (its colour, emissive and opacity; Three's material observer sees them change): the team colours and both looks
 * (humans and robots, in the vertex colours), the baked light on figures (the colour and emissive
 * render/characterRenderer.ts sets as they move), the glow of others' torch beams, the walk-off fade (opacity and
 * transparency), the hit and out states (which parts are shown). The low-detail figure has no patch and no twin.
 */

/** The figures' finish twin for a material with the patch, or null for any other. */
export function figureTwin(material: THREE.Material): MeshStandardNodeMaterial | null {
  if (!hasVertexFinish(material) || !(material as Partial<THREE.MeshStandardMaterial>).isMeshStandardMaterial) return null;
  const twin = copyOnto(material, new MeshStandardNodeMaterial());
  const finish = attribute(FINISH_ATTRIBUTE, 'vec2');
  twin.roughnessNode = finish.x;
  twin.metalnessNode = finish.y;
  return twin;
}

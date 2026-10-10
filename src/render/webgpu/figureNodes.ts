import type * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, float, fwidth, materialColor, max, mix, positionGeometry, sin, smoothstep, step } from 'three/tsl';
import { FIGURE } from '../../config/characters';
import { CAMO_ATTRIBUTE, CAMO_EDGE_MIN, CAMO_WARP_RATE, CAMO_WARP_SEED, CAMO_WAVES, hasSleeveCamo, SLEEVE_CAMO_SEED } from '../figureCamo';
import { FINISH_ATTRIBUTE, hasVertexFinish } from '../figureFinish';
import { copyOnto } from './effectNodes';

/**
 * The node twins of the figures' per-vertex finish and the team camo (render/figureFinish.ts, FA8; render/figureCamo.ts,
 * G11; WebGPU overhaul W3). The detailed figure (Player detail High: Medium and up) is one vertex-coloured Standard
 * material whose GLSL patch reads each vertex's roughness and metalness from its `finish` attribute (vec2) where Three
 * would read the material's: matte fabric, a glossy goggle lens and helmet shell, steel barrels, in one draw; and prints
 * the camo per pixel where the vertex's `camo` attribute names a pattern. The twin reads the same attributes in the same
 * places (`roughnessNode`, `metalnessNode`, and the camo on the colour before Three multiplies the vertex colours in),
 * so Three's own clamping and geometry roughness follow as in the GLSL. Your first-person sleeves (Hand detail High)
 * print the camo all over: their twin is the plain Standard node material with the same colour.
 *
 * Everything else a figure shows is the plain material's, read per drawn object from the material the figure carries
 * (its colour, emissive and opacity; Three's material observer sees them change): the team colours and both looks
 * (humans and robots, in the vertex colours), the baked light on figures (the colour and emissive
 * render/characterRenderer.ts sets as they move), the glow of others' torch beams, the walk-off fade (opacity and
 * transparency), the hit and out states (which parts are shown). The low-detail figure has no patch and no twin.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's node types don't follow its own swizzles and helpers. */
type AnyNode = any;

/** camoGlsl's camoTone: the colour multiplier at part position `p` for pattern `seed`, the same sums in the same order. */
function camoTone(p: AnyNode, seed: AnyNode): AnyNode {
  const C = FIGURE.camo;
  const s = p.mul(float(1 / C.scale));
  const q = s.add(sin(s.yzx.mul(CAMO_WARP_RATE).add(seed.mul(CAMO_WARP_SEED))).mul(C.warp));
  let n: AnyNode = null;
  for (const [x, y, z, k] of CAMO_WAVES) {
    const wave = sin(q.x.mul(x).add(q.y.mul(y)).add(q.z.mul(z)).add(seed.mul(k)));
    n = n === null ? wave : n.add(wave);
  }
  const edge = max(fwidth(n), CAMO_EDGE_MIN);
  const dark = smoothstep(edge.negate().add(C.darkAt), edge.add(C.darkAt), n);
  const light = float(1).sub(smoothstep(edge.negate().add(C.lightAt), edge.add(C.lightAt), n));
  return mix(mix(float(1), float(C.light), light), float(C.dark), dark);
}

/** The material's colour with the camo multiplied in, where `seed` (0: none) names a pattern. */
function camoColour(seed: AnyNode): AnyNode {
  const tone = mix(float(1), camoTone(positionGeometry, seed), step(0.5, seed));
  return materialColor.mul(tone);
}

/** The sleeves' colour: the camo all over, at FIGURE.camo.sleeve of the figures' size (useSleeveCamo). */
function sleeveColour(): AnyNode {
  return materialColor.mul(camoTone(positionGeometry.mul(1 / FIGURE.camo.sleeve), float(SLEEVE_CAMO_SEED)));
}

/** The figures' finish twin for a material with the patch, the sleeves' camo twin, or null for any other. */
export function figureTwin(material: THREE.Material): MeshStandardNodeMaterial | null {
  if (!(material as Partial<THREE.MeshStandardMaterial>).isMeshStandardMaterial) return null;
  if (hasSleeveCamo(material)) {
    const twin = copyOnto(material, new MeshStandardNodeMaterial());
    twin.colorNode = sleeveColour();
    return twin;
  }
  if (!hasVertexFinish(material)) return null;
  const twin = copyOnto(material, new MeshStandardNodeMaterial());
  const finish = attribute(FINISH_ATTRIBUTE, 'vec2');
  twin.roughnessNode = finish.x;
  twin.metalnessNode = finish.y;
  twin.colorNode = camoColour(attribute(CAMO_ATTRIBUTE, 'float'));
  return twin;
}

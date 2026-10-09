import type * as THREE from 'three';
import type { NodeFrame } from 'three/webgpu';
import { texture3D, uniform } from 'three/tsl';

/**
 * The uniforms a world material's GLSL patch is given, read by its node twin (WebGPU overhaul W2), so the two can never
 * drift: the twin is not handed copies of the patch's numbers, it reads the very objects the patch puts in the WebGL
 * program. They are found by running the material's own `onBeforeCompile` once on an empty shader (every world patch
 * only rewrites the strings and adds its uniforms, by reference where they are shared: the baked light's grid, the
 * fixtures' clock, the neon flicker, the plane's matrix, the motes' size cap), and kept per material.
 *
 * Several plain materials share one node program (the node renderer keys its programs on the plain material's program
 * key, as WebGL does), so a twin never captures one material's values: each value is a node uniform set from the drawn
 * object's own material (`onObjectUpdate`), as WebGL gives each material its own uniforms. Three runs those updates only
 * for an object its material observer marks as holding nodes, and the observer looks at the plain material (the one
 * the object carries), which holds none: so every twin with such a uniform has its observer say so (`everyDraw`), and
 * its uniforms are set on every draw (the fixtures' clock, the neon flicker and the plane move every frame).
 */

/**
 * A twin's material observer (`setupObserver`) marked as holding nodes, so Three refreshes the drawn object's uniforms on
 * every draw: the `onObjectUpdate` reads above run each frame for each object, not only on its first draw. No
 * allocation: the refresh writes into the uniforms' existing values. It costs one object refresh a frame per twinned
 * mesh: 11 on Depot, 4 on Woodland and 14 on Neon Heights at High (measured 2026-10-09), none at Low (no patches).
 */
export function everyDraw<T extends { hasNode: boolean }>(observer: T): T {
  observer.hasNode = true;
  return observer;
}

/** A material's patch uniforms by name (`shader.uniforms` after its onBeforeCompile). */
export type PatchUniforms = Readonly<Record<string, THREE.IUniform>>;

const found = new WeakMap<THREE.Material, PatchUniforms>();

/** The uniforms `material`'s patch adds (none for an unpatched material), found once and kept. */
export function patchUniforms(material: THREE.Material): PatchUniforms {
  let u = found.get(material);
  if (!u) {
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '', fragmentShader: '', defines: {} };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    u = shader.uniforms;
    found.set(material, u);
  }
  return u;
}

/** The value of patch uniform `name` of the drawn object's material, or `fallback` while it has none. */
function valueOf<T>(frame: NodeFrame, name: string, fallback: T): T {
  const material = frame.material as THREE.Material | null;
  const value = material ? (patchUniforms(material)[name]?.value as T | null | undefined) : undefined;
  return value ?? fallback;
}

/**
 * Tags a twin's uniform node with the patch uniform it reads (`patchUniform`, a plain property: the shader's own names
 * are left to Three), so a test can find what reached the GPU for it in the drawn object's uniform buffer.
 */
function tagged<T extends object>(node: T, name: string): T {
  return Object.assign(node, { patchUniform: name });
}

/** A float uniform reading patch uniform `name` of each drawn object's material. */
export function objectFloat(name: string, fallback = 0) {
  return tagged(uniform(fallback).onObjectUpdate((frame: NodeFrame) => valueOf(frame, name, fallback)), name);
}

/** A vec3, mat4 (or any object-valued) uniform reading patch uniform `name` of each drawn object's material, by reference. */
export function objectValue<T extends THREE.Vector3 | THREE.Matrix4>(name: string, fallback: T) {
  return tagged(uniform(fallback as THREE.Vector3).onObjectUpdate((frame: NodeFrame) => valueOf(frame, name, fallback) as THREE.Vector3), name);
}

/**
 * A 3D texture read at `uvw`, the texture being patch uniform `name` of each drawn object's material (the map's baked
 * light grid); `fallback` while it has none (a freed grid is never drawn, but the node keeps a texture).
 */
export function objectTexture3D(name: string, fallback: THREE.Data3DTexture, uvw: Parameters<typeof texture3D>[1]) {
  const node = texture3D(fallback, uvw);
  node.onObjectUpdate((frame: NodeFrame) => {
    node.value = valueOf<THREE.Texture>(frame, name, fallback);
  });
  return node;
}

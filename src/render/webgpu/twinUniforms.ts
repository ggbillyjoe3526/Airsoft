import type * as THREE from 'three';
import type { NodeFrame } from 'three/webgpu';
import { texture3D, uniform } from 'three/tsl';
import { patchUniforms } from '../nodePatch';

/**
 * The uniforms a world material's node patch carries (render/nodePatch.ts), read by the node material that draws it
 * (WebGPU overhaul W2, W6b): not copies of the patch's numbers but the very objects its owner writes, by reference where
 * they are shared (the baked light's grid, the fixtures' clock, the neon flicker, the plane's matrix, the motes' size
 * cap).
 *
 * Several plain materials share one node program (the node renderer keys its programs on the plain material's program
 * key, which names the patch, not the material), so a twin never captures one material's values: each value is a node uniform set from the drawn
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
 *
 * On a WebGPU device a texture is bound in a bind group, which Three remakes when the bound texture's version differs
 * from the one bound before (three 0.186 Bindings: its "generation"), not when it is another texture of the same
 * version: a swap between two grids each uploaded once (version 1) kept the first bound, and Depot drew with no baked
 * light (W3, found by pipeline/webgpu-compare.mjs on WebGPU). So a texture swapped in with the same version as the one
 * swapped out is marked for upload once (its version moves on), and the bind group follows. The WebGL2 back end binds
 * by texture and never needed it.
 */
export function objectTexture3D(name: string, fallback: THREE.Data3DTexture, uvw: Parameters<typeof texture3D>[1]) {
  const node = texture3D(fallback, uvw);
  node.onObjectUpdate((frame: NodeFrame) => {
    const next = valueOf<THREE.Texture>(frame, name, fallback);
    const was = node.value as THREE.Texture;
    if (next !== was && next.version === was.version) next.needsUpdate = true;
    node.value = next;
  });
  return node;
}

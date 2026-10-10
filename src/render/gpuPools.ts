import type * as THREE from 'three';

/**
 * The particle pools a compute pass may move on the node path (WebGPU overhaul W5): each pool's drawn object to its
 * CPU module (dustMotes.ts, fireflies.ts, smokePlumes.ts, impactPuffs.ts, impactGrit.ts register themselves), read by
 * render/webgpu/compute/particleTwins.ts. Kept off the object (not in its userData), so cloning or serialising it
 * meets no cycle back to the module.
 */
export const GPU_POOLS = new WeakMap<THREE.Object3D, object>();

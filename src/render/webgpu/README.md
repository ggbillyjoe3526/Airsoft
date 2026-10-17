# src/render/webgpu

The node renderer (WebGPU overhaul W1, the only renderer since W6a). `../rendererStart.ts` picks the back end at load.

- `nodeBackend.ts` makes `WebGPURenderer`, reads the GPU time from timestamp queries, compiles ahead and makes the
  replacement renderer when the device is lost (WebGPU a few times, then WebGL2). `deferredFrees.ts` (W6a, WebGPU
  only) holds the uniform buffers Three frees mid-frame (a draw rebuilt inside its pass) until the frame is submitted,
  so an earlier draw in the same pass can't use a destroyed buffer.
- The world's materials carry node patches (`../nodePatch.ts`, W6b; GLSL before it). `worldTwins.ts` asks each
  material's patch first for its node material (its doc lists each patch and where it is drawn); `surfaceNodes.ts`
  (surfaces: weathering, per-pixel and vertex baked light, junk glow and neon flicker, the sky host), `effectNodes.ts`
  (flames, smoke and steam, and the sized points' sprite materials), `pointSprites.ts` (each sized Points drawn as one
  instanced sprite, since points draw one pixel wide there) and `twinUniforms.ts` (the patch's own uniform objects,
  read per drawn object).
- W3: `figureNodes.ts` (the figures' per-vertex finish, and since G11 their camo and your sleeves'), the replica sheen
  from the node renderer's prefiltered sky, `nightLights.ts` (clustered lights on a real WebGPU device: three/webgpu's
  Forward+ `ClusteredLightsNode` with spot lights added, for the world only; the extra lights themselves are made by
  `light/lightPools.ts` when `Renderer.clusteredLights` says so) and `webgpuCompat.ts` (fits what Chromium 141's WebGPU
  does differently, where a test on the device finds it: Three's string swizzle, and the layer-by-layer write into the
  baked light's 3D grid).
- W4: `post/` draws the frame as the WebGL path did, with the same draws (`webglReference.ts` holds what that path did,
  recorded before W6a deleted it): `nodePostStack.ts` is `../post/postStack.ts`'s chain (`PostChain`; the pure helpers
  in `../post/postHelpers.ts`) with each pass in TSL (`nodeAmbientOcclusion.ts`, `nodeReflections.ts`,
  `nodeLightShafts.ts`, `nodeTemporalAA.ts`, `nodeBloom.ts`, `nodeFinish.ts` for the output step and lens finish),
  `nodeRetro.ts` is the retro filter, and `nodeOutput.ts` tone-maps each material as it draws where the frame goes
  straight to the screen: Low's whole frame (the haze after the tone mapping, as the WebGL path's), and the held
  replica, which draws into a target of its own that the stack's last pass lays on. `tsl.ts` holds the TSL functions
  the passes share. A stack or retro filter frees its targets only once the renderer's warm-up compile is done
  (`nodeKit.ts` `CompileGate`).
- W5: `compute/` runs compute passes. `particleTwins.ts` gives each particle pool a driver that its CPU module
  (`effects/dustMotes.ts`, `dressing/fireflies.ts`, `dressing/smokePlumes.ts`, `effects/impactPuffs.ts`,
  `effects/impactGrit.ts`, registered in `effects/gpuPools.ts`) hands its frame and spawns to, skipping its own
  per-particle loop. The formulas are written once in `particleKernels.ts` over `kernelOps.ts` (numbers for the tests,
  TSL for the GPU), and the quads are drawn by `particleDraws.ts`. On Medium and up, `gpuDressing.ts` makes a map's GPU
  grass (`grassField.ts`, a clipmap laid out by `grassLayout.ts`) and the tree stand-ins beyond its fence
  (`forestStandIns.ts`, placed by `forestLayout.ts` and pictured by `forestAtlas.ts` from `light/atmosphere.ts`
  `detailedTree`). Both come from the map's `dressing.grass` and `dressing.forest` (`config/gpuDressing.ts` caps them
  per preset) and are culled on the GPU each frame. On WebGPU, culling packs what is kept with an atomic counter into an
  indirect draw. On the WebGL2 back end, compute runs as transform feedback, which has no atomics or indirect draws, so
  culling sizes a dropped instance to nothing. `computeKit.ts` `followSwappedBuffers` makes that back end's draws read
  the buffer a pass wrote last. The page switch `?noGpuDressing` (DEV and e2e builds) leaves the grass and stand-ins out
  for the WebGL comparison.

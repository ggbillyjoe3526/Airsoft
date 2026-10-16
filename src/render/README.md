# src/render

Three.js presentation, all procedural. It reads `GameState` and `state.events`, interpolates with the stepper's alpha
and never writes the simulation.

- `renderer.ts`: `Renderer` owns the scene, camera, quality (`setQuality`), lighting and environment, tone mapping,
  field of view and zoom, the retro filter (the node renderer's, `webgpu/post/nodeRetro.ts`; Settings › Look › Retro look), `warmUp` and
  `warmShaders` (which also compiles what is hidden at a session's start but shows later: the overtime flag, a tossed
  magazine, a scope's eyepiece; `rendererParts.ts` `withShown`, BP6). `mapMeshCache.ts` keeps the last map's meshes. `rendererParts.ts` holds its helpers (field of view,
  tone mapping, idle warm-up, handing GPU resources to a new renderer). The Renderer draws with the node renderer
  (`webgpu/nodeBackend.ts`) and recovers a lost device itself (`nodeLost`): a new device, or the WebGL2 back end, with
  the post stack, retro filter and sheen back.
- The node renderer (WebGPU overhaul W1, the only renderer since W6a; Graphics › Renderer, Auto by default):
  `rendererStart.ts` decides at load which back end draws, in a chunk of its own loaded at boot with the Renderer row
  (`ui/rendererRow.ts`) and `webgpu/nodeBackend.ts` (with `three/webgpu`, never in the main chunk). On Auto or WebGPU,
  `webgpuProbe.ts` asks for an adapter first, and only when one is given (on Auto, not a software one) is WebGPU
  tried; with none, or on the WebGL pick, it is the WebGL2 back end. `nodeBackend.ts` makes `WebGPURenderer`, reads
  the GPU time from timestamp queries, compiles ahead and makes the replacement renderer when the device is lost
  (WebGPU a few times, then WebGL2). `webgpu/deferredFrees.ts` (W6a, WebGPU only) holds the uniform buffers Three
  frees mid-frame (a draw rebuilt inside its pass) until the frame is submitted, so an earlier draw in the same pass
  can't use a destroyed buffer. The world's materials carry node patches (`nodePatch.ts`, W6b; GLSL before it): what each draws beyond Three's own
  material and the uniforms it reads, set where the material is made. `webgpu/worldTwins.ts` asks each material's patch
  first for its node material (its doc lists each patch and where it is drawn); `webgpu/surfaceNodes.ts` (surfaces: weathering, per-pixel
  and vertex baked light, junk glow and neon flicker, the sky host), `webgpu/effectNodes.ts` (flames, smoke and steam,
  and the sized points' sprite materials), `webgpu/pointSprites.ts` (each sized Points drawn as one instanced sprite,
  since points draw one pixel wide there) and `webgpu/twinUniforms.ts` (the patch's own uniform objects, read per drawn
  object). W3: `webgpu/figureNodes.ts` (the figures' per-vertex finish, and since G11 their camo and your sleeves'), the replica sheen from the node renderer's
  prefiltered sky, `webgpu/nightLights.ts` (clustered lights on a real WebGPU device: three/webgpu's Forward+
  `ClusteredLightsNode` with spot lights added, for the world only; the extra lights themselves are made by
  `lightPools.ts` when `Renderer.clusteredLights` says so) and `webgpu/webgpuCompat.ts` (fits
  what Chromium 141's WebGPU does differently, where a test on the device finds it: Three's string swizzle, and the
  layer-by-layer write into the baked light's 3D grid). W4: `webgpu/post/` draws the frame as the WebGL path did, with
  the same draws (`webglReference.ts` holds what that path did, recorded before W6a deleted it): `nodePostStack.ts` is
  `post/postStack.ts`'s chain (`PostChain`; the pure helpers in `post/postHelpers.ts`) with each pass in TSL
  (`nodeAmbientOcclusion.ts`, `nodeReflections.ts`, `nodeLightShafts.ts`, `nodeTemporalAA.ts`, `nodeBloom.ts`,
  `nodeFinish.ts` for the output step and lens finish), `nodeRetro.ts` is the retro filter, and `nodeOutput.ts` tone-maps
  each material as it draws where the frame goes straight to the screen: Low's whole frame (the haze after the tone
  mapping, as the WebGL path's), and the held replica, which draws into a target of its own that the stack's last pass lays on.
  A stack or retro filter frees its targets only once the renderer's warm-up compile is done (`nodeKit.ts` `CompileGate`).
  W5: `webgpu/compute/` runs compute passes. `particleTwins.ts` gives each particle pool a driver that its CPU module
  (`dustMotes.ts`, `fireflies.ts`, `smokePlumes.ts`, `impactPuffs.ts`, `impactGrit.ts`, registered in `gpuPools.ts`)
  hands its frame and spawns to, skipping its own per-particle loop. The formulas are written once in
  `particleKernels.ts` over `kernelOps.ts` (numbers for the tests, TSL for the GPU), and the quads are drawn by
  `particleDraws.ts`. On Medium and up, `gpuDressing.ts` makes a map's GPU grass (`grassField.ts`, a clipmap laid out
  by `grassLayout.ts`) and the tree stand-ins beyond its fence (`forestStandIns.ts`, placed by `forestLayout.ts` and
  pictured by `forestAtlas.ts` from `atmosphere.ts` `detailedTree`). Both come from the map's `dressing.grass` and
  `dressing.forest` (`config/gpuDressing.ts` caps them per preset) and are culled on the GPU each frame. On WebGPU,
  culling packs what is kept with an atomic counter into an indirect draw. On the WebGL2 back end, compute runs as
  transform feedback, which has no atomics or indirect draws, so culling sizes a dropped instance to nothing.
  `computeKit.ts` `followSwappedBuffers` makes that back end's draws read the buffer a pass wrote last. The page switch
  `?noGpuDressing` (DEV and e2e builds) leaves the grass and stand-ins out for the WebGL comparison.
- `matchPresentation.ts`: other players, hit feedback, spectator camera, round banner, scoreboard, flag.
  `combatPresentation.ts`: after each tick it consumes `state.events`; each frame it draws the BBs, puffs, tossed
  magazines (`magTosses.ts`, MG1: a code-made box on an arc, one mesh a slot of `GameState.magTosses`), leaves a BB
  knocks out of a bush (`leafFlecks.ts`, FO1: CPU only, one instanced draw), a puff of dust off a noisy prop run into
  (`propNoise`, NP1: a bigger impact puff in the prop's dust tint), the held
  replica (a second render pass) and the HUD. Also `cameraRig.ts`, `viewmodel.ts`, and `eyepiece.ts` (aimed, a
  scope's rear glass shows the world: a depth-only disc in the held replica's pass).
- The practice range's targets: `rangeTargetsRenderer.ts` (instanced plates, figures and the START plate, moved by the
  sim's data; a lit challenge target draws through an orange twin), `rangeTargetGear.ts` (the posts, swinger frames,
  mover rails and pop-up motor boxes, merged once).
- The field: `mapMeshes.ts` turns blocks into pieces merged per texture by `cuboidMesh.ts`. Look-only data is drawn by
  `mapSigns.ts`, `mapDecals.ts`, `dressingMeshes.ts`, `cityProps.ts`, `natureShapes.ts`, `canopyMeshes.ts`,
  `terrainMeshes.ts`, `foliageMeshes.ts`. Textures: `proceduralTextures.ts`, `textureLibrary.ts`.
- Set dressing (`MapData.dressing`, look only, placed the same way every time from its seed): `mapDressing.ts` places
  it, with `dressingSpots.ts` (the rules for where a loose piece may lie), `woodsDressing.ts` (fallen branches, twigs,
  logs and leaf drifts on terrain), `streetDressing.ts` (pasted posters), `neonDressing.ts` (tube-letter signs and
  their flicker); `dressingMeshes.ts` merges the lot into one junk mesh and one puddle mesh. The horizon beyond the
  field is `skyline.ts` (towers, treelines, hills, and the lights they carry at night). Moving pieces are owned by
  `dressingEffects.ts`: `smokePlumes.ts` (chimney smoke and vent steam), `fireflies.ts`, `passingPlane.ts`. The
  skyline's lights and the plane ride the tree ring's draw call (`skyHost.ts`).
- Light: `lighting.ts` (sun and sky fill; on High the shadow map follows the view), `lightingPreset.ts` (day or night),
  `atmosphere.ts`, `lightPools.ts`, `torchBeams.ts`. Baked bounce light: `lightBake.ts`, `probeGrid.ts`,
  `probeFile.ts` (the file format, loaded in a chunk of its own), `bakedLight.ts`, read by the surfaces' node patch
  (`surfaceShader.ts`, which also weathers them).
- Figures: `characterRenderer.ts`, `characterModels.ts`, `figureHuman.ts` / `figureRobot.ts`; `figureFinish.ts` (the
  per-vertex finish) and `figureCamo.ts` (the team camo printed per pixel on clothes and sleeves, G11). The rigged Blender
  human and robot (BF1, drawn only with the Dev tab's model switches off): `figureRig.ts` (a kind's files taken apart
  into bones, merged meshes and clips, and `figureLegs.ts` reading the legs' clips out for the hit volume, IM8),
  `figurePose.ts` (the pure blend of clips from the character's state),
  `riggedFigure.ts` (one figure: skinned, posed, each loadout replica on the grip bone with its fitted optic, grip, laser,
  barrel and muzzle part, BG1, the reload's magazines, the rifle slung on the back while holstered and its drawn
  muzzle for the BBs, BP4, your first-person body) and `thrownMagazines.ts` (the empty magazines thrown in reloads); `modelFiles.ts` imports
  `figureRig.ts` on demand, so the four ride in their own chunk and the game's carries only their types. Replicas and hands:
  `replicaModels.ts` (the bodies and assembly), `replicaParts.ts` (optics, grips, magazines and the other fitted parts),
  `replicaBuilder.ts` (the mesh builder both use), `replicaFiles.ts` (the Blender model files, M101, RM1, and their parts' sight-line and under-laser markers, RM8, and a laser's lens, BP4; `modelFiles.ts` loads them, and the figure model, only while the Dev tab's model switches let them in, RM4) and `replicaRig.ts`
  (their moving parts, skinned and posed from the game's state, RM1; the Inspect key plays a file's Inspect clip, RM2; the built-in GBB Pistol's slide rides one too, and a GBB's slide locks back on an empty magazine, RM7), `replicaFinish.ts` (moulded speckle), `replicaSheen.ts` (the
  environment reflection), `replicaArms.ts` (the first-person arms), `handModels.ts`; `itemPictures.ts` draws them off
  screen for the menus, with the power sources from `powerSourceModels.ts` (the menus' battery, LiPo and gas bottle, RM3).
- Surface textures: `proceduralTextures.ts` draws each at the quality's Texture detail, the city's flat finishes capped
  at 512² (`drawnSize`, M78), with `natureTextures.ts`, `cityTextures.ts` and `textureLibrary.ts`.
- Pooled effects (nothing in flight uploads nothing): `impactPuffs.ts`, `bbRenderer.ts`, `dustMotes.ts`. The post stack
  is `post/` (`postPlan.ts` picks passes per preset, `postHost.ts` makes and frees the node renderer's); Low builds
  none.
- Quality: `gpuCheck.ts` rates the GPU, `qualityStepDown.ts` steps down on slow frames (never saved).
  `Game.changeQuality` → `Renderer.setQuality` → `MatchSession.setQuality`. Changing antialiasing waits for the next
  load (`Renderer.antialiasPending`).
- Tuning, in `config/`: `render.ts` (re-exports the `render*.ts` files), `graphics.ts`, `post.ts`, `look.ts`,
  `characters.ts`, `weathering.ts`. Tests: `renderer.test.ts`, `disposal.test.ts`, one per feature.
- Rules: every graphical effect is an engine feature read from quality settings and map data, never map-exclusive
  (owner, 2026-10-04). A new quality field takes a value on every preset, a row in `config/graphics.ts` and a
  `graphics.<field>` key. Dispose geometries, materials and textures; no per-frame allocation in hot loops.

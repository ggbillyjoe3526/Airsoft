# src/render

Three.js presentation, all procedural. It reads `GameState` and `state.events`, interpolates with the stepper's alpha
and never writes the simulation.

- `renderer.ts`: `Renderer` owns the scene, camera, quality (`setQuality`), lighting and environment, tone mapping,
  field of view and zoom, the retro filter (WebGL's, `retroFilterWebGL.ts`, loads the first time it is turned on: a Dev
  look kept out of the main chunk), `warmUp` and `warmShaders`. `mapMeshCache.ts` keeps the last map's meshes.
  `rendererParts.ts` holds its helpers (field of view, tone mapping, idle warm-up, handing GPU resources to a new
  renderer, the draw counts read the same on WebGL and the node renderer). The Renderer draws with WebGL or the node
  renderer (`webgpu/nodeBackend.ts`) and recovers a lost device itself (`nodeLost`): a new device, or WebGL with the
  post stack, retro filter and sheen back.
- The node renderer (WebGPU overhaul W1; Graphics › Renderer, Auto by default): `rendererStart.ts` decides at load
  which renderer draws, in a chunk of its own loaded at boot with the Renderer row (`ui/rendererRow.ts`). On Auto or
  WebGPU, `webgpuProbe.ts` asks for an adapter first, and only when one is given (on Auto, not a software one) is
  `webgpu/nodeBackend.ts` imported (with `three/webgpu`, never in the main chunk); with none, or on the WebGL pick, it
  is WebGL as before. `nodeBackend.ts` makes `WebGPURenderer` (WebGL if no device can be made), reads the GPU time
  from timestamp queries, compiles ahead and makes the replacement renderer when the device is lost. On that path
  the world's materials draw as node twins of their GLSL patches (W2): `webgpu/worldTwins.ts` asks first, by program
  key, for a twin (its table lists each patch and twin); `webgpu/surfaceNodes.ts` (surfaces: weathering, per-pixel
  and vertex baked light, junk glow and neon flicker, the sky host), `webgpu/effectNodes.ts` (flames, smoke and steam,
  and the sized points' sprite materials), `webgpu/pointSprites.ts` (each sized Points drawn as one instanced sprite,
  since points draw one pixel wide there) and `webgpu/twinUniforms.ts` (the patch's own uniform objects, read per drawn
  object). W3: `webgpu/figureNodes.ts` (the figures' per-vertex finish, and since G11 their camo and your sleeves'), the replica sheen from the node renderer's
  prefiltered sky, `webgpu/nightLights.ts` (clustered lights on a real WebGPU device: three/webgpu's Forward+
  `ClusteredLightsNode` with spot lights added, for the world only; the extra lights themselves are made by
  `lightPools.ts` when `Renderer.clusteredLights` says so) and `webgpu/webgpuCompat.ts` (fits
  what Chromium 141's WebGPU does differently, where a test on the device finds it: Three's string swizzle, and the
  layer-by-layer write into the baked light's 3D grid). W4: `webgpu/post/` draws the frame as WebGL's does, with
  the same draws: `nodePostStack.ts` is `post/postStack.ts`'s chain (`PostChain`) with each pass ported to TSL beside
  it (`nodeAmbientOcclusion.ts`, `nodeReflections.ts`, `nodeLightShafts.ts`, `nodeTemporalAA.ts`, `nodeBloom.ts`,
  `nodeFinish.ts` for the output step and lens finish), `nodeRetro.ts` is the retro filter, and `nodeOutput.ts` tone-maps
  each material as it draws where WebGL draws straight to the screen: Low's whole frame (the haze after the tone
  mapping, as WebGL's), and the held replica, which draws into a target of its own that the stack's last pass lays on.
  A stack or retro filter frees its targets only once the renderer's warm-up compile is done (`nodeKit.ts` `CompileGate`).
- `matchPresentation.ts`: other players, hit feedback, spectator camera, round banner, scoreboard, flag.
  `combatPresentation.ts`: after each tick it consumes `state.events`; each frame it draws the BBs, puffs, the held
  replica (a second render pass) and the HUD. Also `cameraRig.ts`, `viewmodel.ts`.
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
  `probeFile.ts` (the file format, loaded in a chunk of its own), `bakedLight.ts`, read in `surfaceShader.ts` (which
  also draws weathering).
- Figures: `characterRenderer.ts`, `characterModels.ts`, `figureHuman.ts` / `figureRobot.ts`; `figureFinish.ts` (the
  per-vertex finish) and `figureCamo.ts` (the team camo printed per pixel on clothes and sleeves, G11). Replicas and hands:
  `replicaModels.ts` (the bodies and assembly), `replicaParts.ts` (optics, grips, magazines and the other fitted parts),
  `replicaBuilder.ts` (the mesh builder both use), `replicaFiles.ts` (the Blender model files, M101, RM1) and `replicaRig.ts`
  (their moving parts, skinned and posed from the game's state, RM1), `replicaFinish.ts` (moulded speckle), `replicaSheen.ts` (the
  environment reflection), `replicaArms.ts` (the first-person arms), `handModels.ts`; `itemPictures.ts` draws them off
  screen for the menus.
- Surface textures: `proceduralTextures.ts` draws each at the quality's Texture detail, the city's flat finishes capped
  at 512² (`drawnSize`, M78), with `natureTextures.ts`, `cityTextures.ts` and `textureLibrary.ts`.
- Pooled effects (nothing in flight uploads nothing): `impactPuffs.ts`, `bbRenderer.ts`, `dustMotes.ts`. The post stack
  is `post/` (`postPlan.ts` picks passes per preset, `postHost.ts` makes and frees it, WebGL's or the node renderer's);
  Low builds none.
- Quality: `gpuCheck.ts` rates the GPU, `qualityStepDown.ts` steps down on slow frames (never saved).
  `Game.changeQuality` → `Renderer.setQuality` → `MatchSession.setQuality`. Changing antialiasing makes a new WebGL
  context on a new canvas (the pointer lock is on the container, so it survives); on the node renderer it waits for
  the next load.
- Tuning, in `config/`: `render.ts` (re-exports the `render*.ts` files), `graphics.ts`, `post.ts`, `look.ts`,
  `characters.ts`, `weathering.ts`. Tests: `renderer.test.ts`, `disposal.test.ts`, one per feature.
- Rules: every graphical effect is an engine feature read from quality settings and map data, never map-exclusive
  (owner, 2026-10-04). A new quality field takes a value on every preset, a row in `config/graphics.ts` and a
  `graphics.<field>` key. Dispose geometries, materials and textures; no per-frame allocation in hot loops.

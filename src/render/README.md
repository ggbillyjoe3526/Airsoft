# src/render

Three.js presentation, all procedural. It reads `GameState` and `state.events`, interpolates with the stepper's alpha
and never writes the simulation.

- `renderer.ts`: `Renderer` owns the scene, camera, quality (`setQuality`), lighting and environment, tone mapping,
  field of view and zoom, the retro filter, `warmUp` and `warmShaders`. `mapMeshCache.ts` keeps the last map's meshes.
  `rendererParts.ts` holds its helpers (field of view, tone mapping, idle warm-up, handing GPU resources to a new
  renderer); `drawingDevice.ts` is the renderer it draws with and what that reports (`stats`, GPU time), read the same
  on WebGL and the node renderer.
- The node renderer (WebGPU overhaul W1; Graphics › Renderer, Auto by default): `rendererStart.ts` decides at load
  which renderer draws. On Auto or WebGPU, `webgpuProbe.ts` asks for an adapter first, and only when one is given is
  `webgpu/nodeBackend.ts` imported (with `three/webgpu`, never in the main chunk); with none, or on the WebGL pick, it
  is WebGL as before. `nodeBackend.ts` makes `WebGPURenderer` (WebGL if no device can be made), reads the GPU time
  from timestamp queries, compiles ahead and makes the replacement renderer when the device is lost. On that path
  materials draw as Three's node versions of the plain ones: `onBeforeCompile` patches (the surfaces' baked light,
  weathering and relief, the figures' per-vertex finish, the shader-moved stars, smoke, motes, fireflies and flames)
  are left out, and there is no post stack, retro filter or environment sheen yet (W2 to W4).
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
  `bakedLight.ts`, read in `surfaceShader.ts` (which also draws weathering).
- Figures: `characterRenderer.ts`, `characterModels.ts`, `figureHuman.ts` / `figureRobot.ts`. Replicas and hands:
  `replicaModels.ts` (the bodies and assembly), `replicaParts.ts` (optics, grips, magazines and the other fitted parts),
  `replicaBuilder.ts` (the mesh builder both use), `replicaFinish.ts` (moulded speckle), `replicaSheen.ts` (the
  environment reflection), `replicaArms.ts` (the first-person arms), `handModels.ts`; `itemPictures.ts` draws them off
  screen for the menus.
- Surface textures: `proceduralTextures.ts` draws each at the quality's Texture detail, the city's flat finishes capped
  at 512² (`drawnSize`, M78), with `natureTextures.ts`, `cityTextures.ts` and `textureLibrary.ts`.
- Pooled effects (nothing in flight uploads nothing): `impactPuffs.ts`, `bbRenderer.ts`, `dustMotes.ts`. The post stack
  is `post/` (`postPlan.ts` picks passes per preset); Low builds none.
- Quality: `gpuCheck.ts` rates the GPU, `qualityStepDown.ts` steps down on slow frames (never saved).
  `Game.changeQuality` → `Renderer.setQuality` → `MatchSession.setQuality`. Changing antialiasing makes a new WebGL
  context on a new canvas (the pointer lock is on the container, so it survives); on the node renderer it waits for
  the next load.
- Tuning, in `config/`: `render.ts` (re-exports the `render*.ts` files), `graphics.ts`, `post.ts`, `look.ts`,
  `characters.ts`, `weathering.ts`. Tests: `renderer.test.ts`, `disposal.test.ts`, one per feature.
- Rules: every graphical effect is an engine feature read from quality settings and map data, never map-exclusive
  (owner, 2026-10-04). A new quality field takes a value on every preset, a row in `config/graphics.ts` and a
  `graphics.<field>` key. Dispose geometries, materials and textures; no per-frame allocation in hot loops.

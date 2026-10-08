# src/render

Three.js presentation, all procedural. It reads `GameState` and `state.events`, interpolates with the stepper's alpha
and never writes the simulation.

- `renderer.ts`: `Renderer` owns the scene, camera, quality (`setQuality`), lighting and environment, tone mapping,
  field of view and zoom, the retro filter, `warmUp` and `warmShaders`. `mapMeshCache.ts` keeps the last map's meshes.
- `matchPresentation.ts`: other players, hit feedback, spectator camera, round banner, scoreboard, flag.
  `combatPresentation.ts`: after each tick it consumes `state.events`; each frame it draws the BBs, puffs, the held
  replica (a second render pass) and the HUD. Also `cameraRig.ts`, `viewmodel.ts`.
- The field: `mapMeshes.ts` turns blocks into pieces merged per texture by `cuboidMesh.ts`. Look-only data is drawn by
  `mapSigns.ts`, `mapDecals.ts`, `dressingMeshes.ts`, `cityProps.ts`, `natureShapes.ts`, `canopyMeshes.ts`,
  `terrainMeshes.ts`, `foliageMeshes.ts`. Textures: `proceduralTextures.ts`, `textureLibrary.ts`.
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
  context on a new canvas (the pointer lock is on the container, so it survives).
- Tuning, in `config/`: `render.ts` (re-exports the `render*.ts` files), `graphics.ts`, `post.ts`, `look.ts`,
  `characters.ts`, `weathering.ts`. Tests: `renderer.test.ts`, `disposal.test.ts`, one per feature.
- Rules: every graphical effect is an engine feature read from quality settings and map data, never map-exclusive
  (owner, 2026-10-04). A new quality field takes a value on every preset, a row in `config/graphics.ts` and a
  `graphics.<field>` key. Dispose geometries, materials and textures; no per-frame allocation in hot loops.

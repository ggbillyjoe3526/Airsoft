# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## FA7 · Visual overhaul: lighting, map, sky, flag and range
tier: core
perf: required
touches: src/config/render.ts, src/config/range.ts, src/config/graphics.ts, src/render/replicaSheen.ts, src/render/renderer.ts, src/render/surfaceNormals.ts, src/render/surfaceMaterials.ts, src/render/proceduralTextures.ts, src/render/vertexOcclusion.ts, src/render/cuboidMesh.ts, src/render/mapDecals.ts, src/render/mapMeshes.ts, src/render/atmosphere.ts, src/render/lighting.ts, src/render/contactShadows.ts, src/render/flagRenderer.ts, src/render/rangeTargetsRenderer.ts, src/render/matchPresentation.ts, src/matchSession.ts, src/rangeSession.ts, src/settings/storage.ts, src/ui/menus/savedChoices.ts, src/ui/graphicsSettings.ts, src/game.ts
contract: QualitySettings fields added additively (allowed): environment, normalMaps, mapDetail, trees, clouds, each with a value on every preset, a Custom row and a `graphics.<field>` key; the tone mapping is a separate saved setting
acceptance:
  1. Art bible: `docs/ART.md` holds the audit's paragraph and is linked from `docs/VISION.md`
  2. F1: the environment map is built from the sky dome's own colours over a concrete disc, set as `scene.environment` at 0.35 with Environment lighting (row 16 off · on · on), shared with the replica sheen, which turns on for Medium; the map's Lambert materials stay off it (replicaSheen.test.ts, surfaceMaterials.test.ts, render.test.ts)
  3. F2: a Tone mapping row (Neutral · AgX · ACES), Neutral at exposure 1 by default on every preset, saved and applied live (renderer.test.ts, graphics.test.ts, storage.test.ts)
  4. F3: baked vertex occlusion on the map with Map detail: corners and wall feet darken, open floor does not, a face never shades itself (vertexOcclusion.test.ts, mapMeshes.test.ts)
  5. F4: normal maps from each surface texture (Sobel, tiling, at most 512²) on a "Relief maps" row, Bump on Low (surfaceNormals.test.ts, surfaceMaterials.test.ts)
  6. F5: contact shadows under every figure on every preset, one instanced draw, no texture, tighter when crouched, fading with a figure leaving play (contactShadows.test.ts)
  7. F7 skipped and F8 held (no bloom, SSAO/GTAO or LUT; row 24 not added), each with its reason in DECISIONS
  8. Map props and surfaces: bevels with a lighter edge, tiled faces, ground variation, prop detail inside each block, one alpha-tested sign mesh, the steel plate as painted steel with Environment lighting; the shadow map draws the plain boxes (cuboidMesh.test.ts, mapDecals.test.ts, mapMeshes.test.ts)
  9. Sky and trees: Trees None · Simple · Detailed (Low Simple, today's ring) and Clouds (row 21) with a sun disc, vertex-alpha, no texture (atmosphere.test.ts)
  10. Flagpole and cloth: with Map detail a finial, rope and cleat and a finer painted cloth whose ripple is damped near the pole; the plain cloth's ripple is unchanged (flagRenderer.test.ts)
  11. Range targets: with Map detail chains, arm, safety band, hinge brackets, a shelf of BB bottles, scuffed plates and painted figures (rangeTargetsRenderer.test.ts)
  12. Low keeps today's cost: every new feature off or at today's value on Low; its draw calls rise only by the contact shadows and its triangles and textures not at all (render.test.ts; perf numbers in DECISIONS)
  13. Medium stays within 80 draw calls, 110k triangles, 16 programs and 30 MB of textures, High within 130k triangles and 80 MB, on Depot and the practice range (draw calls) (DECISIONS)
  14. KNOWN_ISSUES: the bump-map and tree rows are struck or reworded; PLAYTEST has the FA7 checks
status: gates
attempts: 2

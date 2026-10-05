# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## G6 · Materials, textures and baked lighting
tier: core
perf: required
touches: src/render/, src/map/, src/config/render.ts, src/config/graphics.ts, src/config/bake.ts, src/config/weathering.ts, src/matchSession.ts, src/game.ts, src/settings/, src/ui/menus/, pipeline/bake-light.mjs, pipeline/README.md, docs/ARCHITECTURE.md, docs/KNOWN_ISSUES.md, docs/REVIEWS.md, docs/METRICS.md, docs/TASKS.md
contract: QualitySettings (two fields added: bakedLight, weathering); the map block format (MapData.bakedLight added, optional)
acceptance:
  1. Texture library: `blockWall` is drawn as grey precast concrete panels and `gabion` as grey rubble behind wire (no sand, no brick); a library surface `paint` (worn paint on steel) is drawn on demand. The drawings are pure per-texel functions: the same pixels every time, at QualitySettings.textureSize (Low 256, Medium 512, High 1024); Low keeps Lambert materials.
  2. Wear: rain streaks, rust, chipped paint and scratches drawn into the library textures; on Medium and High (`weathering`) a world-space grime term (dirt at wall feet, patches, streaks, rust on steel) in the map surface shaders, one program per variant (customProgramCacheKey); Low unchanged.
  3. The decal atlas gains stain cells (oil, crack, tyre marks, dirt), no two cells overlap; floor stains are placed on a map's ground with map detail, never under a block.
  4. Map meshes merge each texture's shadow-casting and plain pieces into one mesh (the shadow pass draws the casting range only): Depot draws one map mesh fewer, and no preset draws more map meshes than before.
  5. `node pipeline/bake-light.mjs [map…]` (Node, no browser) voxelises a map's blocks, casts rays from a probe grid and writes `src/map/bakes/<file>.probes.b64`, well under 300 KB compressed; the same map gives the same bytes; the file's header holds the map's bake hash.
  6. A map opts in with `MapData.bakedLight`; Depot opts in, Woodland and Neon Heights do not (night). Medium and High read the probes per pixel (one 3D texture read); Low bakes them into the map's vertex colours (no new per-pixel work, no extra draw call); figures read the nearest probes on the CPU as they move, with no per-frame allocation.
  7. A test fails, naming the bake command, when a baked map's inputs change without a re-bake.
  8. Day lighting: a lower (about 35°), warmer sun, a bluer sky fill and a deeper sky (the environment map follows it); the night preset is unchanged.
  9. Collision, cover, sight lines and every map's block data unchanged (Neon Heights' order untouched).
  10. Quality fields `bakedLight` and `weathering` have a value on every preset and a Custom row; a saved Custom choice without them reads the default.
status: building
attempts: 0

# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M50 · Chunk headroom and the crash report (Audit 2 CORE-A: CORE-01, CORE-02, CORE-09)
tier: core
perf: required
touches: vite.config.ts, src/config/chunkBudget.ts, src/map/maps.ts, src/map/devMaps.ts, src/testSetup.ts, src/game.ts, src/newGamePicks.ts, src/ui/menus/menus.ts, src/ui/menus/choiceDialog.ts, src/ui/testSupport.ts, src/ui/menus/savedChoices.ts, src/core/reportFields.ts, src/pool/pool.ts, src/ai/extractionRoles.ts, src/audio/audioEngine.ts, src/config/statsFile.ts, src/map/woodland.ts, src/pool/armory.ts, src/render/lightFixtures.ts, src/render/lightPools.ts, src/render/lighting.ts, src/render/mapDecals.ts, src/render/mapMeshes.ts, src/render/rangeTargetsRenderer.ts, src/render/replicaModels.ts, src/render/replicaSheen.ts, src/render/torchBeams.ts, src/save/saveManager.ts, src/sim/armament.ts, src/sim/flag.ts, src/sim/movement.ts, src/sim/rangeTargets.ts, src/ui/rangeReadout.ts, src/ui/saveDialog.ts
contract: Content tags (ARCHITECTURE › Contracts: the dev maps' data loads on demand; `MapEntry` loses `data`, read through `mapData`)
acceptance:
  1. The dev maps' data (Woodland, Neon Heights and their Extraction blocks) is in its own chunk, fetched only once Dev content is on (at start when it was left on); a player with Dev content off never downloads it, and no dev map is listed or played before its data is in.
  2. pool.md and stats.md are in a chunk of their own; the game chunk is under 90 % of its budget, and the default budget is 900 kB (owner decision 1, DECISIONS); a chunk within 10 % of its budget warns at build time (test: config/chunkBudget.test.ts).
  3. The crash and diagnostics report's Quality row is the quality line the debug overlay shows (choice, auto, scale, shadow map, textures; never "[object Object]"), reads the live automatic flag, and the report adds Rules, Lighting, Retro pixels and, in an Extraction run, a Run row (outcome, exits open, cases opened, carried, waves).
  4. `tierOf` is gone and the 28 exports nothing outside their file uses are no longer exported; no behaviour change (existing tests pass unchanged apart from reading map data through `mapData`).
status: gates
attempts: 2


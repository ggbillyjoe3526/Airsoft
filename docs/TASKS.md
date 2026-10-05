# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

The Extraction plan (owner approved 2026-10-04 20:51 and 20:54 UTC: every default except question 3, one automatic
respawn per run; the plan in the project's shared files `research/extraction-mode-2026-10-04.md`). Everything here is
tagged dev with M35's content tag until the owner says it's done. M33 owns the map framework (MapData gains only an
optional `extraction` block), the Pro thread owns held angles and team play (M37, M38): changes there go through the
coordinator.

## M46 · Extraction: guards, patrols and hunters
tier: core
perf: required
touches: src/ai/, src/config/bots.ts, src/map/, src/sim/extraction.ts
acceptance:
  1. Guards hold cover facing a case's approaches within a leash (M37's angles where present), two on the locker; patrols walk between cases in pairs.
  2. From halfway (Normal) hunters push to where the squad was last seen or heard: the bots' first push behaviour.
  3. Bot teammates take cover facing outwards while you open a case.
  4. Headless balance runs: extract rate and FC a minute per difficulty within bands, guarded by a test.
status: open
attempts: 0

## M47 · Extraction: pay and records
tier: ui
perf: skip
touches: src/pool/armory.ts, pool.md, src/stats/, src/ui/, src/matchSession.ts, src/game.ts
acceptance:
  1. A run pays the FC it extracts with plus 5 a hit, times the difficulty; out or caught out pays hits only.
  2. Records `difficulty.extraction` (runs and extractions), best haul, extraction streak, fastest extraction with a case; older saves load unchanged.
status: open
attempts: 0

## M48 · Extraction on Woodland and Neon Heights
tier: core
perf: required
touches: src/map/, src/ai/
acceptance:
  1. Each map's extraction block (insertions, exits, cases, regens, opponent starts), Woodland 15 min with 4 / 5 / 6 opponents, the city 10 min.
  2. The data tests and balance runs of M45 and M46 pass on each.
status: open
attempts: 0

## M49 · Supply weekends and dated events
tier: ui
perf: skip
touches: pool.md, src/pool/, src/config/, src/ui/
acceptance:
  1. A recurring Supply weekend (Friday to Sunday by the device clock) and a dated event table in data, each a case-odds modifier shown on the Mode pop-up.

## M33i · The woodland look
tier: core
perf: required
touches: src/render/, src/config/render.ts, src/config/materials.ts, src/map/mapTypes.ts, src/map/nightSight.ts, src/map/groundSurfaces.ts, src/map/woodland.ts, src/matchSession.ts, src/rangeSession.ts, pipeline/perf-run.mjs, src/config/perfScript.ts, e2e/, docs/
contract: map data drives every new look (tree, log and boulder shapes by block kind, a canopy over `tree` blocks, optional MapData.ground patches, optional MapLight.kind fixtures, a night sky from the lighting preset); a map that uses none of them (Depot) builds exactly as today.
acceptance:
  1. Woodland's trees, logs, log walls, cabin, fort, fence and boulders read as wood, bark and stone (shapes inside their collision boxes, invisible corners at most 8 cm), with crowns against the sky; Depot's meshes, textures and GPU memory are unchanged.
  2. The ground shows the creek bed, tracks, clearings and darker leaf litter under the trees from one ground grid that M33j's footsteps will read.
  3. Camp fires and lanterns have fixtures; fires flicker (no per-frame CPU work on the mesh), with embers where dust motes are on; the night preset draws a moon and stars on every preset and the day nothing.
  4. Woodland stays within Low's 100 draw calls and 150k triangles, and Medium's ceiling; the perf harness can play Woodland; no shader is first built mid-match.
  5. Low and Medium screenshots of Woodland from the spawn and from the meadow towards the Knoll.
status: open
attempts: 0

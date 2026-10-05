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

## M45 · Extraction: waves and regen points
tier: core
perf: required
touches: src/sim/extraction.ts, src/config/extraction.ts, src/config/bots.ts, src/map/mapTypes.ts, src/map/depot.ts, src/ai/, src/matchSession.ts
acceptance:
  1. Hit opponents re-enter in waves: every 75 s on Normal (100 Easy, 60 Hard) or as soon as all are out, up to the cap; one more in play in the last third.
  2. Regen points are map data; a returner uses one at least 15 m (Depot) from every squad member and out of their sight; tested on every map with an extraction block.
status: open
attempts: 0

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
status: open
attempts: 0

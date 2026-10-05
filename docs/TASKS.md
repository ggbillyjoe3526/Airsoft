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

## M47 · Extraction: pay and records
tier: ui
perf: skip
touches: src/pool/armory.ts, src/pool/armory.test.ts, src/pool/caches.test.ts, pool.md, src/stats/, src/ui/, src/config/menus.ts, src/matchSession.ts, src/game.ts
acceptance:
  1. A run pays the FC it extracts with plus 5 a hit, times the difficulty; out or caught out pays hits only.
  2. Records `difficulty.extraction` (runs and extractions), best haul, extraction streak, fastest extraction with a case; older saves load unchanged.
status: building
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

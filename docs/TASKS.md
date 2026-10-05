# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M55 · Case line of sight, map overlaps and Extraction posts that see (Audit 2 SIM-A + AI-A: SIM-02, SIM-04, SIM-05, SIM-08, AI-01, AI-09, rows 197 and 200)
tier: core
perf: required
touches: src/config/extraction.ts, src/config/bots.ts, src/sim/extraction.ts, src/map/neonHeights.ts, src/map/woodland.ts, src/ai/bot.ts, src/ai/botBrain.ts, src/ai/botMovement.ts, src/ai/extractionRoles.ts, src/ai/squadOrders.ts, docs/DECISIONS.md, docs/KNOWN_ISSUES.md, docs/ARCHITECTURE.md
contract: none (`ExtractionContext` gains an optional `sight`, ARCHITECTURE updated)
acceptance:
  1. No case opens through a wall: the runner's eye needs a clear line to the case, one ray per candidate; every shipped case spot opens from in front of it (extractionCases.test, extractionData.test).
  2. No two blocks on any map overlap, except the Plaza stair lip listed in the test and in KNOWN_ISSUES; Neon Heights' nav fingerprint is unchanged; Woodland's longest sight line is at most 140 m (owner decision 11).
  3. Extraction guards hold their post on its own floor and lean out where it was picked for a lean (owner decision 34, fix b): over 6 seeds on each map no guard at its post goes without seeing its way in (was 17 of 48); openers face their watch point from a lean spot.
  4. Between sidesteps a pushing hunter casts no more rays than a patrol, and a wave that can't place a returner tries again after `EXTRACTION.regenRetry`, not every tick.
status: gates
attempts: 0

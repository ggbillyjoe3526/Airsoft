# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M57 · Night rosters in the headless guards (Audit 2 AI-B: AI-02)
tier: core
perf: none
touches: docs/DECISIONS.md, docs/KNOWN_ISSUES.md, src/ai/depotMatchSupport.ts, src/ai/extractionRunSupport.ts, src/ai/extractionRunSupport.test.ts, src/ai/woodlandTorchMatch.test.ts, src/ai/woodlandNightMatch.test.ts, src/ai/nightSightHiderMatch.test.ts, src/ai/proBalance.test.ts, src/ai/woodlandMatch.pro.test.ts, src/ai/woodlandMatch.proFlag.test.ts, src/ai/neonHeightsMatch.proNight.test.ts, src/ai/neonHeightsMatch.proNightFlag.test.ts, src/ai/depotMatch.neonHeights.test.ts, src/ai/depotMatch.neonHeightsFlag.test.ts, src/ai/woodlandMatch.extractionBalance.test.ts, src/ai/neonHeightsMatch.extractionBalance.test.ts
contract: none (test harness only; no bot, map or match code changes)
acceptance:
  1. On a night map, `playMatch` and `setUpRun` fit every bot the torch the match build fits, and none by day; a unit test fails without it.
  2. Every night guard passes on torch-fitted rosters, and each changed band or comment carries the new numbers.
  3. Each band change has a DECISIONS line with its numbers; the Pro 40-60 % band holds everywhere except Woodland Attack / Defend, whose 20-60 % is recorded as temporary until the Woodland balance pass.
  4. The fast project and `tsc` are clean; no bot or map config changed.
status: qa
attempts: 0

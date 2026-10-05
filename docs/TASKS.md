# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M51 · CI split and test hygiene (Audit 2 CORE-B: CORE-04, CORE-05, CORE-06, CORE-15, CORE-16, BAL-07, BAL-10)
tier: core
perf: none
touches: .github/workflows/check.yml, pipeline/gate.mjs, pipeline/gate.test.mjs, pipeline/README.md, vite.config.ts, src/sim/wind.test.ts, src/physics/levelRay.rapier.test.ts, src/render/whatGotYouWiring.test.ts, src/ai/woodlandMatch.pro.test.ts, src/ai/woodlandMatch.proFlag.test.ts, src/ai/depotMatchSupport.ts, src/ai/extractionBalanceSupport.ts, src/ai/depotMatch.extractionBalance.test.ts, src/ai/woodlandMatch.extractionBalance.test.ts, src/ai/neonHeightsMatch.extractionBalance.test.ts, src/map/extractionBlock.ts, src/map/woodlandExtraction.ts, src/map/neonHeightsExtraction.ts, e2e/rulesets.spec.ts
contract: none
acceptance:
  1. CI runs the build, fast tests, smoke, perf and the record checks in one job and the slow project in three parallel shards (`gate.mjs --tests fast|slow --shard k/n --only tests`), each under its timeout; a red shard fails the run (owner decision 2, DECISIONS).
  2. The wind and level-ray tests carry their own timeout and less work, `whatGotYouWiring.test.ts` resets the module registry when it ends, and `SLOW_TESTS` takes `src/ai/*Match.levels*.test.ts`; KNOWN_ISSUES row 175 names only what is still open.
  3. The three Extraction balance tests share one support (`extractionBalanceSupport.ts`) and the two map Extraction blocks one builder (`extractionBlock.ts`), and the built blocks are the same data as before (compared with main's JSON once; the existing Extraction data tests pass unchanged).
  4. Woodland's Pro guards run 16 seeds and the Pro guard's failure message gives the standard error; a smoke spec starts Tournament Extraction on Depot with Retro pixels on and Pro CQB against Pro, and reads each from the diagnostics report.
status: gates
attempts: 2

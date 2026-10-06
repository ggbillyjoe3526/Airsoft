# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

**Audit 2, what is left (2026-10-05 20:45 UTC).** Merged: M50–M57, M63–M65, M68, M70 (#107–#122). M69 (AUD PR 4) is
accepted and lands with this list. Below, the rest of section 8 of the report
(`audits/full-audit-2026-10-05.md` in the project's shared files), in its order. Not built in this pass:
POOL-D, Extraction pay (owner decision 23: keep until the playtest shows the extraction rate) and REN-03 step 3 with
REN-12 (when 4v4 and 5v5 go public); both stay in KNOWN_ISSUES.

## M71 · Every level hunts the middle and keeps out of the light (Audit 2 BAL PR 1: BAL-01, BAL-02, BAL-08, BAL-09, AI-03, AI-07, AI-08)
tier: core
perf: required
touches: src/config/bots.ts, src/ai/botController.ts, src/ai/botMovement.ts, src/ai/botBrain.ts, src/ai/botTorch.ts, src/ai/aim.ts, src/ai/depotMatchSupport.ts, vite.config.ts, docs/DECISIONS.md, docs/KNOWN_ISSUES.md, docs/PLAYTEST.md
contract: none
acceptance:
  1. Easy, Normal and Hard hunt the middle (`huntsMiddle`); Normal and Hard keep out of the light (`keepsDark`, owner decision 4); Pro is unchanged. `proBalance.test.ts` compares against the flags turned off.
  2. New Woodland level guards (Elimination and Attack / Defend, Normal and Hard, 8 seeds): end 0 or attackers within 35–65 %, rounds on time under 10 % (owner decision 3); they run in the `slow` project.
  3. The Depot, Neon Heights and difficulty guards touched by the change are re-measured; comments carry the new figures; bands move only where crossed.
  4. The torch light refreshes at the perception rate, not every frame (AI-07); the aim wander's `* 3` is a named tuning value (AI-08).
  5. DECISIONS supersedes "Easy, Normal and Hard do neither" with the measured numbers; KNOWN_ISSUES rows 50, 160 and 186 updated.
status: open
attempts: 0

## M72 · Extraction opponents per level, Woodland's berth, insertion grace, hunters measured (Audit 2 BAL PR 2 + SIM-C: BAL-03, BAL-05, BAL-06, SIM-03)
tier: core
perf: required
touches: src/config/extraction.ts, src/config/bots.ts, src/sim/extraction.ts, src/matchSession.ts, src/ai/extractionRunSupport.ts, src/ai/extractionBalanceSupport.ts, src/ai/extractionRoles.ts, src/ai/botController.ts, src/map/mapTypes.ts, src/map/woodlandExtraction.ts, docs/ARCHITECTURE.md, docs/DECISIONS.md, docs/KNOWN_ISSUES.md, docs/PLAYTEST.md
contract: map block format (optional `insertionBerth`, by addition)
acceptance:
  1. `EXTRACTION.opponentsByLevel` `{ easy: 0, normal: -1, hard: 0, pro: 1 }` offsets the home team (at least 1); the match, the scoreboard and the headless runs size it through one helper (owner decision 1a).
  2. Woodland's Extraction data has a 30 m insertion berth; an inserted or respawned squad has a 3 s grace with no fire in or out (owner decision 8).
  3. The three Extraction balance guards are re-measured at 48 seeds per level with bands ±15 points round the new figures; Woodland asserts Easy > Normal > Hard again.
  4. A careful-runner guard shows hunters appear in at least half the long runs (BAL-06, owner decision 5).
  5. DECISIONS, KNOWN_ISSUES rows 198 and 199, the PLAYTEST Difficulty line.
status: open
attempts: 0

## M73 · Neon Heights: the bar door over the avenue (Audit 2 BAL PR 3: BAL-04; only if M71 leaves the west under 45 %)
tier: core
perf: skip
touches: src/map/neonHeights.ts, docs/DECISIONS.md, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. Measured after M71 by night at Normal, 16 seeds. If the west takes at least 45 %, the task closes with the figure recorded in KNOWN_ISSUES rows 20 and 184 and no code change.
  2. Otherwise the mid lane point moves inside the bar's door line (owner decision 6), then a planter only if that is not enough; the east takes at most 55 % of first hits and the Neon Heights guards read 45–55 %.
status: open
attempts: 0

## M74 · Route searches that fit a tick (Audit 2 SIM-B + AI-D: SIM-01, AI-04)
tier: core
perf: required
touches: src/nav/navGrid.ts, src/sim/elimination.ts, src/ai/botController.ts, src/ai/botMovement.ts, src/config/nav.ts, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. A walk-off route reads a distance field built once per map end, with no A* at the hit (owner decision 10); the route matches today's in length within one cell.
  2. A bot route search is time-sliced under a per-tick budget (owner decision 12); Woodland and Neon Heights hold no tick over the budget in a probe.
  3. One `NavSearch` is shared, not two (Woodland's 7.7 MB once).
  4. Bot guards stay inside their bands.
status: open
attempts: 0

## M75 · Woodland Medium margin (Audit 2 REN PR 2: REN-03 steps 1 and 4, REN-04)
tier: core
perf: required
touches: src/render/characterModels.ts, src/render/characterRenderer.ts, src/render/exitRenderer.ts, src/render/atmosphere.ts, src/config/render.ts, src/config/graphics.ts, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. Figures cast shadows from a low-triangle proxy (High figure detail unchanged on screen).
  2. Extraction's exit rings, washes and boards are instanced: a fixed number of draw calls whatever the exit count.
  3. Woodland's horizon tree ring at night draws at `trees: 1` (owner decision 8).
  4. Woodland and Neon Heights Extraction on Medium measure at or under 120 draw calls in the container perf run; rows 166 and 189 updated.
status: open
attempts: 0

## M76 · Perf gate matrix, baselines, quick-gate precompression and build label (Audit 2 CORE-C: CORE-03, CORE-10, CORE-11, CORE-12)
tier: ui
perf: skip
touches: pipeline/gate.mjs, pipeline/perf-run.mjs, pipeline/perf-budget.json, pipeline/baseline/, pipeline/build-cached.mjs, pipeline/README.md, vite.config.ts, src/config/buildVersion.ts, src/config/precompress.ts, .github/workflows/check.yml, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. The perf gate runs every map and both modes on Low, and Medium on the big maps, against map-scoped Medium budgets (owner decision 4).
  2. Container baselines re-recorded on the fixed game for every combination the gate reads.
  3. `--quick` skips precompression; the full gate and CI keep it (owner decision 3).
  4. A CI or pipeline build reads its version from tags (CI fetches them), not "build <sha>".
status: open
attempts: 0

## M77 · Hot-path trims (Audit 2 SIM-D: SIM-06, SIM-07, REN-10)
tier: core
perf: required
touches: src/sim/, src/physics/, src/render/bbRenderer.ts, src/render/dustMotes.ts, src/render/flagRenderer.ts, docs/KNOWN_ISSUES.md
contract: CharacterMover (behaviour unchanged)
acceptance:
  1. No `Math.hypot` with three arguments in the BB and ray hot paths.
  2. `probeGround` is skipped when the mover has already found the ground that tick; character movement is unchanged in the tests.
  3. BB streaks, dust and flag cloth make no per-frame garbage.
  4. The level-ray test covers every map.
status: open
attempts: 0

## M78 · Splits: replica models, render config and city texture size (Audit 2 REN PR 4: REN-09, REN-11)
tier: core
perf: required
touches: src/render/replicaModels.ts, src/render/, src/config/render.ts, src/config/, docs/ARCHITECTURE.md, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. `src/render/replicaModels.ts` and `src/config/render.ts` are split by concern into files under about 600 lines, with no change in what is drawn (the replica and render tests unchanged).
  2. High caps flat city surfaces at 512² textures (owner decision 9), checked with a screenshot; Neon Heights High holds about 28 MB less.
  3. ARCHITECTURE's file map names the new files.
status: open
attempts: 0

## M79 · Docs, change records and small leaks (Audit 2 CORE-D + AUD PR 3: CORE-07, CORE-08, CORE-13, CORE-14, AUD-06, section 5)
tier: ui
perf: skip
touches: src/game.ts, src/ui/menus/menuParts.ts, src/ai/botMovement.ts, src/ai/squadOrders.ts, src/pool/pool.ts, src/pool/caches.ts, src/audio/, pipeline/, .claude/, CHANGELOG.md, docs/
contract: none
acceptance:
  1. `Game.dispose()` unregisters every callback it registered; menu pages disconnect their ResizeObserver (CORE-07).
  2. No import cycles, with a test that fails on one (CORE-08).
  3. Loop-seam tests bound the wrap by a fixed threshold, through one shared helper (AUD-06).
  4. Report section 5 items 1–7: stale rows and timings, the CHANGELOG PR numbers, the PLAYTEST start section.
  5. The owed records: DECISIONS lines for the five final-audit defaults the owner confirmed and for Woodland and Neon Heights staying dev-only until he plays them; a DECISIONS line and a ROADMAP 0.2 row for the graphics overhaul; an IDEAS entry for a desktop wrapper; ROADMAP rows for the content toolkit checks (replicas, attachments and maps in 0.1 Beta, modes in 0.3, skins in 0.5).
status: open
attempts: 0

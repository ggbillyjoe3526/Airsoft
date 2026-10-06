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

**The owner's 0.1 Dev 4 playtest notes (2026-10-06).** Recorded on his ask, not built yet; they follow the Audit 2
tasks above and the rest of the paused 0.1 Dev 5 work. His words and the per-item reasoning are in the project's shared
files (`plans/playtest-feedback-0.1-dev-4.md`); the table under Alpha in `docs/ROADMAP.md` maps all 26 notes. M80–M91
are 0.1 Dev 5 fixes and changes, M92–M95 suggested 0.1 Dev 6 features. Notes 5, 20–23 go to 0.3 and 0.4 (ROADMAP).
Every block below carries note 19: tune on Normal, then check that Easy, Hard and Pro still scale. `touches` are
first guesses; the build thread confirms them before it starts. Items with an open ruling (notes 13, 16, 26) wait for
the owner before the build.

## M80 · The tutorial shows what it teaches (playtest note 1)
tier: ui
perf: skip
touches: src/tutorial/, src/config/tutorial.ts, src/ui/scoreboard.ts, src/ui/orderWheel.ts, src/ui/menus/, docs/PLAYTEST.md
contract: none
acceptance:
  1. When the tutorial names the scoreboard or the comm wheel (hold Z), it opens it on screen for the player to see.
  2. Every tutorial line is reworded: plain words, complete enough to say how the thing works.
  3. Finishing the tutorial shows a clear "Tutorial complete" pop-up with two choices: the practice range or the menu.
status: open
attempts: 0

## M81 · The practice range and tutorial area in the new look (playtest note 9)
tier: ui
perf: required
touches: src/map/range.ts, src/map/testYard.ts, src/render/, src/rangeSession.ts
contract: none
acceptance:
  1. After graphics G5 and G6 merge, the range and tutorial area use the new materials, baked light and post stack on every preset, re-dressed in the art direction like Depot (G8).
  2. Low still holds its frame budget on the range.
status: open
attempts: 0

## M82 · Sort and filter by rarity (playtest note 4)
tier: ui
perf: skip
touches: src/ui/menus/loadoutScreen.ts, src/ui/menus/itemTile.ts, src/ui/loadoutChoice.ts, src/save/
contract: none
acceptance:
  1. The Loadout's replica list sorts by rarity and can hide chosen rarity tiers (for example show only Epic and Legendary).
  2. Customise does the same for parts.
  3. The choice is remembered between visits. Built after the menu redesign (G3).
status: open
attempts: 0

## M83 · Small menu and HUD options: skip a round, minimap turn, hidden Armory (playtest notes 6, 7, 25)
tier: ui
perf: skip
touches: src/render/spectatorCamera.ts, src/matchFlow.ts, src/ui/minimap.ts, src/ui/minimapView.ts, src/config/minimap.ts, src/ui/hudSettings.ts, src/ui/menus/, src/config/dev.ts
contract: none
acceptance:
  1. The spectator camera offers "Skip to next round", which plays the rest of the round out at once and goes to the next.
  2. A setting picks a fixed (north-up) or rotating minimap.
  3. With "Disable Armory" on in Dev, the Armory is gone from every menu instead of greyed.
status: open
attempts: 0

## M84 · Iron sights on every replica, and walking while aiming (playtest notes 8, 16)
tier: core
perf: skip
touches: src/sim/aiming.ts, src/sim/movement.ts, src/sim/accuracy.ts, src/config/optics.ts, src/config/movement.ts, src/render/replicaModels.ts, src/render/cameraRig.ts
contract: none
acceptance:
  1. Every replica aims down sights; with no optic fitted the view lines up its iron sights. Aiming is more accurate than hip fire, and hip fire stays viable (measured on Normal against bots).
  2. Holding walk (Shift) while aiming slows the player below the aiming pace.
  3. Waits on the owner's ruling: note 16 reverses his 0.1 Dev 3 note 3 (aim only with a scope fitted).
status: open
attempts: 0

## M85 · BBs stop at the first body they hit (playtest note 17)
tier: core
perf: required
touches: src/sim/bbs.ts, src/sim/hitbox.ts, src/sim/ricochet.ts, src/sim/simulation.ts
contract: none
acceptance:
  1. A reproduction test: two bots in a line, the nearer one hit; it shows whether a BB can reach the one behind.
  2. A BB that hits a body knocks that player out and stops (it does not travel on); a test fails without the fix.
  3. Hit volumes match the drawn figure closely enough that a BB only hits what the player can see; checked on every pose (standing, crouched, leaning, walking off).
status: open
attempts: 0

## M86 · More varied ambience and an Ambience volume (playtest note 14)
tier: ui
perf: skip
touches: src/audio/, src/config/audio.ts, src/ui/audioSettings.ts
contract: none
acceptance:
  1. Each map's ambience has more variety (layers and one-off sounds at random gaps), kept quiet enough not to mask footsteps.
  2. Audio settings get an "Ambience volume" slider; field ambience no longer sits only under Effects.
status: open
attempts: 0

## M87 · Bots stop clearing empty corners (playtest notes 15, 19)
tier: core
perf: required
touches: src/ai/botBrain.ts, src/ai/botMovement.ts, src/ai/angles.ts, src/ai/perception.ts, src/config/bots.ts
contract: none
acceptance:
  1. Bots on both teams skip spots they have seen to be empty recently or that a teammate cleared; a test shows fewer visits to dead ends than today.
  2. Built after the paused audit task M71 (which changes how bots hunt); the balance guards on every map and level stay in their bands.
status: open
attempts: 0

## M88 · Woodland: hidden starts, a smaller height edge, bigger teams (playtest note 13)
tier: core
perf: required
touches: src/map/woodland.ts, src/map/terrain.ts, src/map/maps.ts, src/newGamePicks.ts, src/config/teams.ts
contract: none
acceptance:
  1. Neither team can see the other from its start: cover (a building, thick trees or a rise) hides each spawn.
  2. The blue end's height edge at the start is reduced; Elimination and Attack / Defend stay within 35–65 % per end on Normal.
  3. Team size follows the owner's ruling (suggested: 5v5 default, 6v6 allowed); Low holds its frame budget with the largest size.
  4. Waits on the owner's ruling (Woodland was designed for 4v4 with Custom up to 5v5).
status: open
attempts: 0

## M89 · Modes and match settings fit together (playtest note 18)
tier: ui
perf: skip
touches: src/config/modes.ts, src/config/matchRules.ts, src/map/playableMode.ts, src/ui/menus/setupScreen.ts, src/newGamePicks.ts
contract: none
acceptance:
  1. A table of every mode against every match setting and rule set says which fit; the ones that don't (Tournament rules in Extraction, for example) are hidden for that mode.
  2. A test walks every mode and checks that no hidden setting can be picked.
status: open
attempts: 0

## M90 · More Dev settings for playtesting (playtest note 24)
tier: ui
perf: skip
touches: src/config/dev.ts, src/ui/devSettings.ts, src/settings/dev.ts, src/pool/, src/save/, src/game.ts
contract: none
acceptance:
  1. Dev settings can give field credits and tokens on demand, so the Armory's cases can be tested without playing matches.
  2. More aids, each marked a cheat where it should keep records clean: free case openings, reset the save, the map's time of day, end the round now, bots hold fire, spectate any bot, show what each bot is doing.
status: open
attempts: 0

## M91 · Softer torch beams that cast shadows (playtest note 26)
tier: core
perf: required
touches: src/render/torchBeams.ts, src/map/torchLight.ts, src/config/torches.ts, src/render/lighting.ts
contract: none
acceptance:
  1. The beam is soft and diffused, not a bright white cone (built with or after graphics G5).
  2. A torch casts shadows behind what it lights (a tree in the beam shadows the ground behind it), on the presets the owner rules (suggested: your own torch, Medium and up).
  3. Waits on the owner's ruling (the graphics plan keeps shadow lights to the sun or moon and the nearest fire).
status: open
attempts: 0

## M92 · Holster and two kinds of sprint (playtest note 3)
tier: core
perf: skip
touches: src/sim/armament.ts, src/sim/movement.ts, src/sim/commands.ts, src/sim/aiming.ts, src/input/keyBindings.ts, src/config/controls.ts, src/config/movement.ts, src/render/handPoses.ts
contract: PlayerCommand (a holster slot, by addition)
acceptance:
  1. Key 3 holsters (1 primary, 2 secondary), rebindable.
  2. Sprinting holstered is a little faster than sprinting with a replica; drawing to aim from holstered takes longer (with a draw animation) than raising from a ready sprint.
  3. Bots use the same rules through the same commands.
status: open
attempts: 0

## M93 · Practice: moving targets, new target types, a timed challenge (playtest note 10)
tier: core
perf: skip
touches: src/sim/rangeTargets.ts, src/render/rangeTargetsRenderer.ts, src/map/range.ts, src/rangeSession.ts, src/config/range.ts, src/ui/rangeReadout.ts
contract: none
acceptance:
  1. Moving targets and more target kinds (for example small, pop-up and swinging).
  2. A timed challenge, off by default: hit as many targets as you can in a set time; the best score is kept.
status: open
attempts: 0

## M94 · Practice on any map (playtest note 11)
tier: core
perf: required
touches: src/rangeSession.ts, src/map/, src/sim/rangeTargets.ts, src/ui/menus/
contract: none
acceptance:
  1. The practice range is renamed "Practice"; it offers the range and every playable map (Dev maps with Dev content on).
  2. On a map, targets (M93's kinds) stand where bots would play, and there are no bots.
status: open
attempts: 0

## M95 · Practice with any unlocked replica (playtest note 12)
tier: ui
perf: skip
touches: src/rangeSession.ts, src/ui/menus/loadoutScreen.ts, src/ui/loadoutChoice.ts, src/config/dev.ts
contract: none
acceptance:
  1. In Practice the player picks any replica they own and can Customise it freely.
  2. With Dev settings on (Unlock all gear), every replica and part is available.
status: open
attempts: 0

# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
sets `status` and `attempts` once, in its records commit (no status-only commits).

**Audit 2, what is left (2026-10-05 20:45 UTC).** Merged: M50–M57, M63–M65, M68, M70 (#107–#122). M69 (AUD PR 4) is
accepted and lands with this list. Below, the rest of section 8 of the report
(`audits/full-audit-2026-10-05.md` in the project's shared files), in its order. Not built in this pass:
POOL-D, Extraction pay (owner decision 23: keep until the playtest shows the extraction rate) and REN-03 step 3 with
REN-12 (when 4v4 and 5v5 go public); both stay in KNOWN_ISSUES.

## TE1 · Token efficiency step 1: shorter CLAUDE.md, hooks, quiet test output, pipeline habits
tier: ui
perf: skip
touches: CLAUDE.md, docs/PROCESS.md, docs/ROADMAP.md, docs/DECISIONS.md, docs/METRICS.md, docs/REVIEWS.md, docs/TASKS.md, docs/FEATURES.md, CHANGELOG.md, .claude/, package.json, playwright.config.ts, pipeline/hooks.test.mjs
contract: none
acceptance:
  1. CLAUDE.md is at most about 10 KB; every rule it drops is in `docs/PROCESS.md` or `docs/ROADMAP.md`, and its section numbers are unchanged.
  2. A Read of a text file over 40 KB without a range is stopped with a grep-first message; ranged reads, small files and bad input pass.
  3. A cloud session installs dependencies when missing and sets PLAYWRIGHT_CHROMIUM; a local session is untouched.
  4. `npm run t` and `npm run t:all` print dots and failures only; the gate's JSON reports are unchanged.
  5. The pipeline skill has no status-only commits, one push with the records, and the ask-the-owner-at-once rule.
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
and M96 are 0.1 Dev 5 fixes and changes, M92–M95 suggested 0.1 Dev 6 features. Notes 5, 20–23 went to 0.3 and 0.4; notes 5, 20, 22 and 23 are now
0.1 Dev 6 and Dev 7 (owner's feature picks, 2026-10-06, ROADMAP).
Every block below carries note 19: tune on Normal, then check that Easy, Hard and Pro still scale. `touches` are
first guesses; the build thread confirms them before it starts. The owner ruled on every conflict on 2026-10-06
(ROADMAP, under the playtest table).

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
  3. Owner's ruling (2026-10-06): iron sights now, beside scopes; this replaces his 0.1 Dev 3 note 3 (aim only with a scope fitted).
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
  3. Owner's ruling (2026-10-06): Woodland takes the team sizes of note 13: 5v5 by default, 6v6 allowed, and only 5v5 and 6v6 offered there. Low holds its frame budget at 6v6.
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
  2. A torch casts shadows behind what it lights (a tree in the beam shadows the ground behind it), on the higher presets only (High and Ultra); Low keeps today's beams and its 60 fps target (owner's ruling, 2026-10-06).
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

## M96 · The Retro look goes public (owner's ruling on playtest note 2)
tier: ui
perf: skip
touches: src/config/dev.ts, src/ui/devSettings.ts, src/ui/graphicsSettings.ts, src/ui/lookSettings.ts, src/render/retroFilter.ts, src/settings/, docs/PLAYTEST.md
contract: none
acceptance:
  1. The Retro pixel filter (M42) leaves the Dev tab and becomes a public "Retro look" option with its Pixel size and Colours sliders, as soon as possible in 0.1 Dev 5 (owner, 2026-10-06: "I've tested it and I'm happy with it").
  2. A saved Dev choice carries over to the public setting.
status: open
attempts: 0

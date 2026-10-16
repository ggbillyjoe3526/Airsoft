# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its record
(`docs/records/<id>.md`) and its CHANGELOG line remain. The planning thread writes blocks; the build thread sets
`status` and `attempts` once, in its records commit (no status-only commits).

**0.1 Beta 1 (owner, 2026-10-16).** Fixes, balance, performance and polish, with no features. The blocks come from
`docs/ROADMAP.md` › Beta, `docs/KNOWN_ISSUES.md` and the owner's Dev 6 playtest (2026-10-16, rulings in
`docs/DECISIONS.md`). The draft and the backlog triage are in the project's shared files
(`plans/beta-1-task-draft.md`, `triage/known-issues-triage-2026-10-16.md`), and so are the playtest blocks
(`playtest/dev6-playtest-blocks.md`).

- **Order.** Highest priority first. A block marked *after playtest* waits until the owner has played the parts it
  tunes, and PF2 also waits for his laptop baseline.
- **Placed in a later update.** NH1 goes with the Maps Update, because Neon Heights stays dev in 0.1. HV1 goes with the
  rigged figures leaving the Dev switches, which BD1 now does in Beta 1, so HV1 lands with BD1 or straight after it.
- **Numbers are first guesses.** Numeric targets can be changed by the owner. Note 19 applies to every balance block:
  tune on Normal, then check that Easy, Hard and Pro still scale.
- **`touches` are first guesses.** The build thread confirms them before it starts.

**The owner's Dev 6 playtest list (2026-10-16).** These are his 34 items, taken in Beta 1 on his word, small
additions included (`docs/DECISIONS.md`). Seven threads build them, one block each, and they come before the blocks
below. The item numbers are his. Where an older block overlaps one of these, the owner's item wins:
- UX1 overlaps MR1 and HD1.
- RV2 overlaps ST1.
- AX1's kit colours overlap MR1's colour tab.

MS1 shows the owner concept images and waits for his approval before any code changes.

## MV1 · Movement, holster speed and hands (playtest items 26–30)
tier: core
perf: required
touches: src/sim/movement.ts, src/sim/armament.ts, src/sim/accuracy.ts, src/sim/character.ts, src/sim/simulation.ts, src/sim/coverRest.ts, src/config/movement.ts, src/config/figureRig.ts, src/config/renderView.ts, src/audio/foley.ts, src/render/viewmodel.ts, src/render/handModels.ts, src/render/figureHands.ts, src/render/robotHands.ts, src/matchSession.ts
contract: none
acceptance:
  1. Holstered, the player moves faster than with a replica out, and never faster than a Left Alt sprint.
  2. Holding Left Shift walks a little slower and tightens the spread.
  3. Resting on cover is gone, for the player and the bots. Nobody leans on any object.
  4. The first-person thumbs and grip look natural on every replica, with no clipping into the replica.
  5. Switching replicas mid-match causes no frame hitch, including the first switch (measured with `?perf`).
  6. Bots follow the same movement rules through the same commands.
status: open
attempts: 0

## BD1 · Blender models by default (playtest item 1)
tier: core
perf: required
touches: src/config/dev.ts, src/settings/dev.ts, src/ui/devSettings.ts, src/render/, src/assets/, src/config/assets.ts, src/config/renderQuality.ts, src/ui/menus/
contract: none
acceptance:
  1. The Blender figures, replicas and attachments are the default everywhere, menu pictures included. The code-built models remain only on Low, or go.
  2. The code paths behind the Dev toggles "Disable figure models" and "Disable all models" are gone (ST1 takes the toggles out of the menu).
  3. Load size stays under the 30 MB target, and the perf gate is green on every preset.
  4. The hit volume fits the rigged figures (HV1) in this task or straight after it.
status: open
attempts: 0

## MS1 · Map surroundings and detail (playtest item 23)
tier: core
perf: required
touches: src/map/depotDressing.ts, src/map/woodland.ts, src/map/woodlandDressing.ts, src/map/neonHeightsDressing.ts, src/map/foliage.ts, src/render/, docs/ASSETS.md
contract: none
acceptance:
  1. The owner approves concept images before code changes.
  2. Depot has more buildings and objects in the distance.
  3. Woodland's hut has a roof, and its trees and bushes no longer look low-poly or broken.
  4. Neon Heights feels more open inside, with towering, oppressive city edges.
  5. Each map has more detail overall, the perf gate is green on every preset, and every external asset is in `docs/ASSETS.md`.
status: open
attempts: 0

## BL1 · Attack / Defend: fewer attacker wins, more rounds won at the pole (after playtest)
tier: core
perf: skip
touches: src/sim/flag.ts, src/config/modes.ts, src/ai/teamPlan.ts, src/ai/personality.ts, src/config/botPersonalities.ts, src/ai/balance/depotFlag.balance.ts, src/ai/balance/depotRicochetFlag.balance.ts
contract: none
acceptance:
  1. Bot-only Depot Attack / Defend with personalities and ricochets on: attackers win 40–60 % over seeds 1–48 (today 64.6 %).
  2. At least 1 round in 4 is won at the pole (today 1 in 7), using the roadmap's levers: raise time, defender holds and retakes.
  3. When the flag is tagged, at most one defender leaves its post, so one player can't bait two away.
  4. Woodland's Attack / Defend is WL1's, so two threads don't tune the same map.
  5. The KNOWN_ISSUES rows for personalities, ricochets and pole captures close as one. ROADMAP's "1 in 10" is corrected.
status: open
attempts: 0

## WL1 · Woodland Attack / Defend: attackers reach the pole, the ends even out (after playtest)
tier: core
perf: required
touches: src/map/woodland.ts, src/map/woodlandDressing.ts, src/map/woodland.test.ts, src/map/woodlandTeams.qa.test.ts, src/ai/balance/woodlandLevelsFlag.balance.ts, src/ai/balance/woodlandProFlag.balance.ts, src/ai/balance/woodlandLevels.balance.ts
contract: none
acceptance:
  1. Before changing anything, the record shows where attackers are knocked out on the way to the pole (bot-only, Normal, seeds 1–32, both halves) and how many rounds end before the attackers reach it. That decides the fix.
  2. Fewer rounds end with the attacking team wiped out before any attacker reaches the pole: target at most half of today's figure. The approach gets cover and at least one route that isn't in the open, in that order before the camps or the pole move; the map grows only if those fail, and the record says why.
  3. The uphill / downhill lean closes: in Attack / Defend and in Elimination neither end wins more than 55 % of decided rounds at Normal over seeds 1–32 (Elimination today: the downhill west end 57.4 %).
  4. Attack / Defend stays in its 40–60 % band at every difficulty, Pro included (today 56.0 %), and Extraction on Woodland stays in its bands.
  5. Hidden starts still hold (M88): neither camp sees the other from its first steps out.
  6. The Woodland rows in `docs/KNOWN_ISSUES.md` (Elimination at 5v5, Pro Attack / Defend) close or carry the new numbers. If William later wants more players instead, that is his call; this block does not raise the team size.
status: open
attempts: 0

## NH1 · Neon Heights: a reason to go up (Maps Update, with its new look)
tier: core
perf: required
touches: src/map/neonHeights.ts, src/map/neonHeightsDressing.ts, src/map/neonHeights.test.ts, src/map/neonHeightsData.test.ts, src/ai/balance/neonHeights.balance.ts, src/ai/balance/neonHeightsFlag.balance.ts, src/ai/balance/neonHeightsPro.balance.ts
contract: none
acceptance:
  1. The record measures today's split first: the share of time and of knockouts on Level 1 and Level 2 against the street, bot-only, Normal, seeds 1–32, Elimination and Attack / Defend.
  2. The upper floors earn their climb: sight lines from them onto the lanes and the flag's approach that the street can't match, and at least one route across the map at height (the Sky Bridge, balconies, galleries) that is quicker or safer than its street route. Every upper-floor spot that sees the street is seen back from somewhere, so height is an edge, not a lock.
  3. Bots use height: anchors and careful bots hold upper-floor spots, and flankers take the high routes. At least a third of knockouts involve a player above the street (first guess; tune in play).
  4. The ends stay even: neither wins more than 55 % of decided Elimination rounds by Day or by Night, and Attack / Defend stays in its 40–60 % band at every difficulty.
  5. The stairs and the Plaza stair still climb without a jump (BP5), and Extraction on Neon Heights stays in its bands.
status: open
attempts: 0

## HV1 · The hit area fits each rigged figure (with the figures going default)
tier: core
perf: skip
touches: src/config/hits.ts, src/config/figureRig.ts, src/render/riggedFigure.ts, src/render/riggedHitVolume.test.ts, src/render/figureHitVolume.test.ts
contract: none
acceptance:
  1. William's ruling (2026-10-16: fit to each figure): the head, chest and hips of the hit volume follow each rigged figure, the human's and the robot's, as the legs already do (IM8). The two may differ.
  2. `render/riggedHitVolume.test.ts` passes the bar on every pose for both figures: at most 4 % of the drawn body missed and 3 % thin air (today 5.5–11.5 % thin air on the human, 7–11 % on the robot). The vault's rise is held to the same bar or listed in the record with its figure.
  3. Running and sprinting: the volume leans with the figure, closing the sprint gap (today up to 16 %), or the record shows why it can't and William decides.
  4. With the Dev figure switches on (the built-in figures), the hit volume and every hit test stay exactly as today.
  5. Bot-only balance on Depot, Woodland and Neon Heights stays in its bands with the rigged figures drawn, and the KNOWN_ISSUES rows for the rigged figures' fit close.
status: open
attempts: 0

## BL2 · Difficulty spread: Easy plays easier than Normal (after playtest)
tier: core
perf: skip
touches: src/config/bots.ts, bots.md, src/ai/balance/depotDifficulty.balance.ts, src/ai/balance/closeRange.balance.ts
contract: none
acceptance:
  1. On Depot Elimination, Easy hits at most 75 % of Normal's share of its BBs (today 6.8 % against 6.9 %).
  2. Easy's first hit at 5 m stays slower than Normal's, and Hard and Pro stay above Normal on both figures.
  3. Hard's 5 m duel figure follows William's call from his playtest (BP5 left it to him).
  4. Adaptive difficulty's steps (a Dev setting) are re-checked against the new spread (`balance.mjs adaptive` in band).
status: open
attempts: 0

## IN1 · Mouse lock and Firefox
tier: core
perf: skip
touches: src/input/pointerLock.ts, src/ui/fullscreen.ts, src/ui/menus/pauseScreen.ts, playwright.config.ts, e2e/, .github/workflows/check.yml
contract: none
acceptance:
  1. Esc on the pause screen never leaves a stuck state. Where Chrome refuses the re-lock, a clear "Click to resume" appears and one click resumes.
  2. The fullscreen key keeps or restores the mouse lock in Chrome and Firefox.
  3. CI runs the boot and save specs in Firefox as well. If CI can't install Firefox within its time budget, the thread asks William instead of dropping it.
  4. Firefox's missing raw mouse input (`unadjustedMovement`) stays a documented limit, with a line in Settings › Controls saying so.
  5. The two duplicate Esc re-lock rows in KNOWN_ISSUES merge into one, or close.
status: open
attempts: 0

## PF1 · No shader hitches mid-match
tier: core
perf: required
touches: src/matchSession.ts, src/render/flagRenderer.ts, src/render/characterRenderer.ts, src/render/externalModels.ts, src/render/viewmodel.ts, src/render/renderer.ts
contract: none
acceptance:
  1. Each first-use hitch is measured before and after with `?perf` on a cold cache, and recorded: the first overtime flag, first tossed magazine, first 2x scope aim, first figure fade, the shadow depth shaders and the post stack's pipelines.
  2. The warm-up compiles all of them before the round starts (shown for the compile, then hidden), so none compiles mid-match on Medium, High or Ultra. (KI1 did the overtime flag, the tossed magazine, the scope eyepiece and all but two post passes; left: the shadow depth shaders, a figure's first fade, the last pass's canvas draw and the reflections' mask, and every before-and-after measurement.)
  3. Load time grows by no more than 10 % on any preset. The perf gate is green.
status: open
attempts: 0

## PF2 · The laptop pass (after William's laptop baseline)
tier: core
perf: required
touches: src/render/, src/map/, src/config/renderQuality.ts
contract: none
acceptance:
  1. Starts once `pipeline/baseline/laptop*.json` is committed (PLAYTEST › Only you can do these).
  2. Profile first. The record ranks the top causes of frame time on Low and Medium on Depot and Woodland, by day and by night.
  3. Fix the top causes until Low holds 60 FPS on modern low-powered hardware (the owner's ruling, 2026-10-16), Medium too where it can, on the laptop baseline's scenes. If a fix would cost too much, say what and why.
  4. Add a High or Ultra night run to the perf gate, so the torch shadow map's cost is measured.
status: open
attempts: 0

## AX1 · Readability and tone: kit colours, High contrast, exit markers
tier: ui
perf: skip
touches: src/config/characters.ts, src/config/accessibility.ts, src/config/schemes.ts, src/config/colourVision.test.ts, src/render/exitRenderer.ts, src/ui/hud.css
contract: none
acceptance:
  1. Kit looks read as a weekend airsoft site, not a military unit: at most two of the six looks wear plate carriers, and at least two vests are in a civilian colour. Team armbands still read first.
  2. High contrast's orange figures meet the colour test's contrast bar in Depot's shaded corners (measured, not judged by eye).
  3. Exit rings and markers stay apart from the orange team under the deuteranopia check in `colourVision.test.ts`.
status: open
attempts: 0

## RV1 · Remove supply weekends and dated events (feature triage, 2026-10-05)
tier: core
perf: skip
touches: src/pool/supplyEvents.ts, src/pool/supplyEvents.test.ts, src/pool/supplyEvents.edge.test.ts, src/pool/caches.ts, src/pool/pool.ts, src/game.ts, src/matchSession.ts, pool.md, docs/IDEAS.md
contract: none
acceptance:
  1. No supply weekend or dated event shows anywhere, and their code and their table in `pool.md` are gone.
  2. No pool item ID changes, and an existing save loads unchanged.
  3. The KNOWN_ISSUES row about IDEAS and M49 closes.
status: open
attempts: 0

## RV2 · Tone mapping leaves Graphics (feature triage, 2026-10-05)
tier: ui
perf: skip
touches: src/ui/graphicsSettings.ts, src/ui/menus/settingsScreen.ts, src/ui/devSettings.ts, src/config/graphics.ts, src/config/dev.ts, src/settings/storage.ts, src/game.ts
contract: none
acceptance:
  1. Settings › Graphics has no Tone mapping row, and everyone gets Neutral (today's default).
  2. The choice moves to Settings › Dev. With Dev settings off, a save holding another tone mapping plays as Neutral.
status: open
attempts: 0

## PF3 · The 4K 240 Hz line for maxed-out settings (after William's desktop baseline)
tier: core
perf: required
touches: pipeline/perf-budget.json, pipeline/gate.mjs, pipeline/perf-run.mjs, pipeline/README.md
contract: none
acceptance:
  1. This starts once `pipeline/baseline/desktop*.json` is committed (PLAYTEST › Only you can do these).
  2. The owner's ruling (2026-10-16): maxed-out settings aim at a PC built for 4K at 240 Hz. `perf-budget.json` gains a desktop frame-time line for Ultra at 3840×2160. The first guess is p95 ≤ 4.2 ms and p99 ≤ 6 ms. `desktop` joins `frameTimeGatedEnvs` for Ultra only.
  3. The record lists any map or mode over the line on the baseline, with its top causes. Fixes are their own tasks.
  4. Draw-call and triangle lines change only with an owner decision line (DECISIONS).
status: open
attempts: 0

## UX1 · Menus at 4K and small windows; HUD clashes at 1280 px
tier: ui
perf: skip
touches: src/ui/menus/menus.css, src/ui/menus/css/, src/style.css, src/ui/hud.css, src/ui/hudCss/, src/ui/flagMarker.ts, src/ui/holdMarker.ts, src/render/viewmodel.ts
contract: none
acceptance:
  1. Menu type and controls scale from the window height, as `hudScale` does (DECISIONS: a Beta task). At 3840×2160 and 100 % OS scaling, body text is about 1.5×; 1280×720 is unchanged.
  2. Menu scrolling is measured again at 1280×720 (the row predates M100), and no main menu page scrolls there. New game fits at 900×600.
  3. Edge markers pointing almost the same way don't overlap, and the Attack / Defend pole marker at the screen's edge shows which way to turn.
  4. At 1280×720 the held pistol's grip clears the ammo panel, and at HUD size 120 % or more the widest score bar clears the minimap.
status: open
attempts: 0

## BT1 · Bot quirks from the backlog (after playtest)
tier: core
perf: skip
touches: src/ai/botCombat.ts, src/ai/cover.ts, src/ai/botMovement.ts, src/ai/squadFollow.ts
contract: none
acceptance:
  1. A bot fighting from crouch cover keeps fighting a second enemy in sight after its target goes down.
  2. (KI1 retried it alone: it failed `depotMatch.overtime` and `depotMatch.stackHouse`'s follow check.) The pause between bursts counts down while the line of fire is blocked, bundled with the spacing fix BP2 named (teammates inside each other in tight spots). Re-measured over 48 seeds, and every guard stays green.
  3. Done in KI1: `ai/coverCycle.test.ts` covers the cycle; M72's `holdLeanSweep.test.ts` already covers AI-05 and AI-06.
  4. The old soak rows (long rounds, friendly hits, the office doorway) are measured again, then either closed or updated.
status: open
attempts: 0

## TU1 · Final tuning of first-guess values (after playtest)
tier: core
perf: skip
touches: src/config/footsteps.ts, src/config/noise.ts, src/config/ballistics.ts, src/config/movement.ts, src/map/foliage.ts, stats.md
contract: none
acceptance:
  1. Each value William flags in his playtest is tuned: footstep ranges, hop-up arcs, bush stopping, noisy props and ramp pace (`MOVEMENT.rampPace`).
  2. The values he doesn't flag stay as they are, and their playtest rows become document rows. The callouts' pace is fine (playtest, 2026-10-16).
  3. Overtime rarely comes up, because rounds end in wipe-outs before the clock (playtest, 2026-10-16). The instant take stays as it is unless BL1 or WL1 makes rounds run to time. Round time isn't changed here.
  4. Magazines carried (4 × 60 AEG, 4 × 18 pistol) change only if he asks.
  5. Still untested by William, so parked: Adaptive difficulty's steps, the laptop and Ultra baselines (PF2), and Save in Firefox and Edge.
status: open
attempts: 0

**The repository audit (2026-10-16; owner: "go ahead").** DX1–DX8 come from
`/mnt/project-files/audit/repo-audit-2026-10-16.md`, in the order to run them. Each one waits until the playtest
threads' branches it touches have merged (ST1, MR1, HD1, MV1, BD1, MS1, TT1), so none conflicts with them. DX2 takes
over DC1's known-issues tidy-up. DX0, the quick wins, is the audit thread's own pull request.

## DX1 · Docs: one source for each rule, and the stage everywhere (audit A7, A9, B11, B12)
tier: trivial
perf: skip
touches: CLAUDE.md, docs/, pipeline/README.md, .claude/skills/pipeline/SKILL.md, .claude/agents/, .github/workflows/pages.yml
contract: none
acceptance:
  1. The pipeline's steps, the attempt rule, the near-miss rule, the changelog-agent rule, the models and "one task per thread" each live in one place (`pipeline/README.md` for protocol, `docs/PROCESS.md` for policy); CLAUDE.md, SKILL.md and the agents point there instead of restating them.
  2. No doc cites a "token plan item" or "token step" number; each such citation carries its one-line reason instead, or is dropped.
  3. `docs/ARCHITECTURE.md` › Contracts has a `###` heading per contract, so `grep '^#'` indexes them; nothing else in the section changes.
  4. `pipeline/README.md`'s worked example (the M27 block) is a fenced block, not a `##` heading.
  5. Every stage statement (CLAUDE.md, ROADMAP › Where we are, HANDOFF, TASKS, PROCESS) says 0.1 Beta 1 and nothing says Dev now or "not scheduled".
status: open
attempts: 0

## DX2 · Docs slimming: the 50 KB rule applied, and the finished plan archived (audit A6; folds DC1)
tier: trivial
perf: skip
touches: docs/
contract: none
acceptance:
  1. `docs/ROADMAP.md` › 0.1 Dev 5 and › 0.1 Dev 6 (with their playtest notes, the audit list and the token table) move to `docs/archive/0.1-dev/ROADMAP.md`; Builds and Where we are still name both tags.
  2. `docs/DECISIONS.md` is under 50 KB: split by subject (gameplay and modes, bots, maps and art, process and tooling) with an index at the top, or each ruling kept to its one-line decision with the "why" in the task's record; superseded rulings are marked or moved to the archive.
  3. `docs/KNOWN_ISSUES.md` is under 50 KB: no row over about 300 characters, the detail in the task's record it names; fixed rows gone to the archive. (DC1's acceptance folds in here; its merges and moves were done in KI1.)
  4. `docs/PLAYTEST.md` is under 50 KB: the current build's guide only, earlier builds' sections in the archive.
  5. `docs/PROCESS.md` › Releases gains an "archive check" step, and `docs/archive/README.md` names the `0.1-beta/` folder it creates.
status: open
attempts: 0

## DX3 · A fix-tier path through the pipeline (audit A5)
tier: ui
perf: skip
touches: pipeline/, .claude/skills/pipeline/SKILL.md, .claude/agents/, docs/PROCESS.md, docs/records/README.md
contract: none
acceptance:
  1. A task block may say `tier: fix`: gates, QA and the three review agents still run, but the record is the review line, one attempt row and a Decisions line, and no FEATURES or PLAYTEST edit is due unless the fix changes what the player sees (the changelog agent decides from the summary).
  2. The agents' prompts each lose anything a build thread already reads elsewhere (the pipeline steps, the house style), citing the file instead; the six agents and two skills together are under 25 KB.
  3. `gate.mjs`'s options are documented in one table, and any option CI never uses and no skill names is removed or folded.
  4. `docs/PROCESS.md` › The pipeline says what a fix-tier task skips and why.
status: open
attempts: 0

## DX4 · Tooling and CI: one build per pull request, balanced shards, a formatter (audit B1, B2, B3)
tier: ui
perf: skip
touches: .github/workflows/check.yml, package.json, package-lock.json, .prettierrc, .prettierignore, pipeline/build-cached.mjs, pipeline/gate.mjs, src/ai/, vite.config.ts
contract: none
acceptance:
  1. A pull request's CI builds the e2e and production bundles once and hands them to the browser shards (an artifact or a cache keyed on the sources); each browser shard no longer builds.
  2. The slow shards finish within about a minute of each other: the Woodland Extraction balance guard is split or the shard count raised.
  3. Prettier is a dev dependency with `printWidth: 140`, single quotes and trailing commas as the code already has them; `npm run format:check` runs on CI once the one-off format commit is in (that commit is made only after the Dev 6 playtest branches merge, and the owner has said yes to the formatter).
  4. The 13 `eslint-disable` comments for an uninstalled linter become plain comments that keep their reason.
  5. `npm run t` finishes under two minutes on the owner's desktop and under four in the cloud container, with no test dropped (any file still over 20 s is in `slow` or has a smaller fixture).
status: open
attempts: 0

## DX5 · App root: one preferences object and one session interface (audit A1 step one, A2, B7)
tier: core
perf: required
touches: src/game.ts, src/matchSession.ts, src/rangeSession.ts, src/settings/, src/ui/menus/savedChoices.ts, src/ui/crosshair.ts, src/ui/hitMarkerLook.ts, src/ui/hudSettings.ts, src/ui/menus/menus.ts, src/render/matchPresentation.ts, src/render/combatPresentation.ts
contract: none
acceptance:
  1. A `HudPrefs` object (or the name the thread picks) holds every HUD and accessibility preference once; `Game`, `Menus`, both sessions and the presentations read it by reference, so a new preference is added in one place and the `set*` forwarders in `game.ts` and `matchSession.ts` are gone.
  2. `MatchSession` and `RangeSession` implement one `Session` interface for what `Game` calls on both; `game.ts` has no `instanceof MatchSession` where the interface answers.
  3. The typed `load*` and `save*` helpers live under `src/settings/`, with `src/settings/README.md` naming them; the UI files keep only what draws.
  4. Every setting still loads, applies live and saves as before (the settings tests and the smoke test pass unchanged apart from import paths), and a save from 0.1 Dev 6 loads.
  5. `game.ts` is under 1,300 lines.
status: open
attempts: 0

## DX6 · Render: the folder regrouped, the prop builders as data, no per-frame vault rays (audit A3, A8 part, B4, B9 part)
tier: core
perf: required
touches: src/render/, src/sim/vault.ts, src/sim/character.ts, src/sim/simulation.ts, src/matchSession.ts, pipeline/cycles.mjs, e2e/
contract: none
acceptance:
  1. `src/render/` is grouped as its README describes: `field/`, `figures/`, `replicas/`, `light/`, `effects/` (names the thread picks), each with a README; `post/` and `webgpu/` keep theirs. Pure moves: no behaviour change, the import-cycle check and every test pass, and `render/README.md` is the index of the subfolders.
  2. `mapMeshes.ts`'s prop builders (containers, pallets, racks, gabions, IBCs, skips, generators, barriers and the rest) live in a `mapPieces/` table, leaving merge, restyle and dispose behind; `mapMeshes.ts` is under 400 lines.
  3. The vault prompt reads the simulation's per-tick answer (on the character or an event) and `combatPresentation.ts` casts no rays.
  4. The six HUD marker updaters in `matchPresentation.ts` share one project-and-pin helper.
  5. The perf gate is green on every matrix entry, and the Low frame-time, draw-call and heap lines are unchanged within noise.
status: open
attempts: 0

## DX7 · Bots: the hub files split, two sources of truth closed (audit A8 part, B5, B6, B13)
tier: core
perf: required
touches: src/ai/, src/config/bots.ts, src/config/, src/ui/devSettings.ts, src/pool/, src/progress/
contract: none
acceptance:
  1. Hearing and round planning leave `ai/botController.ts` for modules of their own (as `squadOrders.ts` and `magShare.ts` already did); `botController.ts` is under 600 lines and every headless guard passes with the same seeds.
  2. `config/bots.ts` is split by concern (movement, senses, squad, extraction, skill), each file under 300 lines, with `config/README.md` naming them and `config/bots.ts` re-exporting so no importer changes.
  3. A malformed row in any root table (`pool.md`, `stats.md`, `levels.md`, `bots.md`, `bot-kits.md`, `callouts.md`) shows in the Dev tab's diagnostics and the console, not the console alone.
  4. The six root tables live in one `data/` folder, named in `README.md` › Layout and `docs/ARCHITECTURE.md`, with every import and test path updated.
status: open
attempts: 0

## DX8 · Game: the play flow and the dev glue out of the composition root (audit A1 step two; optional, after DX5)
tier: core
perf: required
touches: src/game.ts, src/core/, src/matchFlow.ts, src/ui/menus/menus.ts
contract: none
acceptance:
  1. Play, enter, resume, pause and leave live in a `PlayFlow` module (name the thread's) with its own tests; the dev and report glue in a module of its own; `Game` keeps the loop, the lifecycle and the wiring.
  2. `game.ts` is under 800 lines and imports under 50 modules.
  3. Pause, resume, restart and return to menu leave the same state as before (the session tests and the smoke test pass), and the frame loop's crash guard is unchanged.
status: open
attempts: 0

## BP6 · Beta 1 bug pass (when William says go)
tier: core
perf: required
touches: src/
contract: none
acceptance:
  1. The standard bug pass (`docs/PROCESS.md` › Bug pass) over everything Beta 1 changed, on every public map, mode and difficulty.
  2. Every KNOWN_ISSUES row in a public area is checked against the build.
status: open
attempts: 0

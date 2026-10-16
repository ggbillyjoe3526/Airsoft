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

MR1 and MS1 show the owner concept images and wait for his approval before any code changes.

## ST1 · Settings defaults and menu order (playtest items 3–8, 18, 20, 34; the Settings side of 1 and 17)
tier: ui
perf: skip
touches: src/settings/, src/config/menus.ts, src/config/controls.ts, src/config/audio.ts, src/config/graphics.ts, src/config/dev.ts, src/ui/menus/, src/ui/, src/game.ts
contract: none
acceptance:
  1. Defaults (new saves): sound cue colour red, scoreboard size 100 %, aim button Toggle, crouch Hold, volumes master 100 %, effects 80 %, power source 100 %, ambience 60 %, interface 50 %.
  2. The Retro look setting moves to Settings › Dev. The "Voices (hit calls)" setting is gone.
  3. Settings tabs run top to bottom: Display, Graphics, Gameplay, Looks, Audio, Controls, Accessibility, Save file, Dev.
  4. The realistic colours leave Settings (they move to the Loadout's Colour tab, MR1).
  5. The Dev toggles "Disable figure models" and "Disable all models" leave the menu (BD1 removes their code paths).
  6. The level display reads "LVL", not "LV".
  7. A save holding the old values still loads.
status: open
attempts: 0

## MR1 · Match, Loadout and Armory redesign, and the home screen (playtest items 9–14, 16, 17, 19, 21)
tier: ui
perf: skip
touches: src/ui/menus/, src/ui/loadoutChoice.ts, src/ui/lookSettings.ts, src/ui/fullscreen.ts, src/config/menus.ts, src/config/menuArt.ts, src/render/itemPictures.ts, src/style.css
contract: none
acceptance:
  1. The owner approves concept images of the Match screen's rules, and of the Match, Loadout and Armory screens, before code changes (items 11, 13).
  2. The menus, except the top navigation bar and Settings, are smaller and more compact, to the approved concepts. The Armory is laid out horizontally.
  3. Mode buttons are text boxes with the mode's name, its description and its small white icon, with no game images. Your match shows no map image.
  4. A picked map offers only the modes and rules that apply to it (checked again, with a test).
  5. Loadout › Customise has no Skins option; skins join the Colour section, and the Colour tab offers the realistic colours (ST1 takes them out of Settings). A Back button returns to the main Loadout screen, and the LOADOUT tab no longer does.
  6. Saved loadouts are a dropdown.
  7. The home screen has a fullscreen button bottom left, which becomes "exit fullscreen" while in fullscreen. The version tag moves bottom right.
status: open
attempts: 0

## HD1 · In-match HUD, feeds and hop-up (playtest items 15, 22, 24, 25, 31–33)
tier: ui
perf: required
touches: src/ui/, src/ui/hud.css, src/ui/hudCss/, src/input/orderWheel.ts, src/input/keyBindings.ts, src/config/controls.ts, src/config/hudText.ts, src/sim/commands.ts, src/sim/armament.ts, src/render/impactPuffs.ts, src/render/impactGrit.ts, src/config/renderEffects.ts
contract: PlayerCommand (a hop-up step, by addition)
acceptance:
  1. A rebindable control adjusts the held replica's hop-up mid-match, through the command interface (bots unchanged), with a HUD readout that shows it changing in real time.
  2. The comms wheel is redesigned: minimal and easy to read, with every button the same size.
  3. BB impacts kick up a smaller, subtler puff.
  4. The weapon, magazine, ammo and fire-mode panel is smaller and more minimal, and still easy to read.
  5. The scoreboard has no YOU tag.
  6. The hit feed and the bot callouts are one feed, top right by default, with a setting that moves it bottom left.
  7. WON or LOST shows at a round's end before the result, briefly and without getting in the way, and the player can move on at once.
status: open
attempts: 0

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

## TT1 · A simpler tutorial (playtest item 2)
tier: ui
perf: skip
touches: src/tutorial/, src/config/tutorial.ts, src/ui/tutorialShowcase.ts
contract: none
acceptance:
  1. Every tip is shorter and easier to understand.
  2. No tip makes the player wait long before the next one, tips 13–16 above all.
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
  2. The warm-up compiles all of them before the round starts (shown for the compile, then hidden), so none compiles mid-match on Medium, High or Ultra.
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
  3. Fix the top causes until Low and Medium hold 60 FPS on the laptop baseline's scenes, or say what would cost too much and why.
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
  2. The pause between bursts counts down while the line of fire is blocked, bundled with the spacing fix BP2 named (teammates inside each other in tight spots). Re-measured over 48 seeds, and every guard stays green.
  3. Tests cover the cover → search → re-sighting → cover cycle, and the audit's AI-05 and AI-06 gaps.
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

## DC1 · Known issues tidy-up
tier: trivial
perf: skip
touches: docs/KNOWN_ISSUES.md, docs/IDEAS.md, docs/ROADMAP.md
contract: none
acceptance:
  1. Merge the duplicate rows the triage found: the Esc re-lock rows, pistol magazine asks, the spacing rows, and the shader-on-first-use rows.
  2. Move "skip to the last round" to `docs/IDEAS.md`. Close the missing-CHANGELOG row as accepted history.
status: open
attempts: 0

## KI1 · Known issues fix pass (owner, 2026-10-16)
tier: core
perf: required
touches: src/, e2e/, docs/, README.md, CHANGELOG.md
contract: none
acceptance:
  1. Every row in `docs/KNOWN_ISSUES.md` is gone through. A row fixed at its root is deleted, with a test where the
     logic is testable. A row left open keeps or gains its reason: a feature (Beta adds none), the owner's balance or
     playtest call, an accepted limit, needs a real browser or GPU, too risky for the guards, or handed off to a
     Beta 1 playtest block.
  2. Rows owned by the Beta 1 playtest blocks (ST1, MR1, HD1, MV1, BD1, MS1, TT1) are not touched in code; their rows
     name the block.
  3. Stale notes are corrected; DC1's merges and moves are done.
  4. No balance number is retuned; the bot-match guards stay green with no threshold loosened.
  5. A browser check of every public map and mode finds no new error, stall or NaN. The perf gate is green.
status: building
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

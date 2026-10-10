# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its record
(`docs/records/<id>.md`) and its CHANGELOG line remain. The planning thread writes blocks; the build thread sets
`status` and `attempts` once, in its records commit (no status-only commits).

**The owner's 0.1 Dev 4 playtest notes (2026-10-06).** Recorded on his ask, not built yet; they follow the rest
of the paused 0.1 Dev 5 work. His words and the per-item reasoning are in the project's shared
files (`plans/playtest-feedback-0.1-dev-4.md`); `docs/ROADMAP.md` › Playtest notes: 0.1 Dev 4 maps all 26 notes. M80–M91
and M96 are 0.1 Dev 5 fixes and changes, M92–M95 suggested 0.1 Dev 6 features. Notes 5, 20–23 went to 0.3 and 0.4; notes 5, 20, 22 and 23 are now
0.1 Dev 6 (owner's feature picks, 2026-10-06, with Dev 7 folded into Dev 6 the same night; ROADMAP).
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

**The owner's playtest notes on main (2026-10-07).** Recorded on his ask, not built yet. His words, the type and the
defaults per note are in the project's shared files (`plans/playtest-feedback-2026-10-07.md`);
`docs/ROADMAP.md` › Playtest notes: main after G3 maps all eight. M97–M99 join the Dev 4 notes batch (Dev 5 item 6); M100 is the graphics work's (Dev 5
item 5, with the G4 HUD restyle); note 3 was a bug, fixed in BP2; note 2 is already in the game
(Settings › Controls › Aim button). Note 19 of the Dev 4 notes still applies.

## M97 · A Hit marker setting and Replay tutorial (playtest notes 1, 8)
tier: ui
perf: skip
touches: src/ui/hitFeedback.ts, src/config/hits.ts, src/ui/hudSettings.ts, src/ui/crosshairSettings.ts, src/ui/menus/settingsScreen.ts, src/settings/, src/tutorial/, src/ui/menus/titleScreen.ts
contract: none
acceptance:
  1. A "Hit marker" setting (On / Off, **Off by default**) in the settings group that holds the crosshair: Off shows no red X when the player's BB lands; On shows it as today. The hit tick sound is unchanged either way.
  2. A "Replay tutorial" button in Settings starts the tutorial at once, whether or not it was finished before.
  3. Both are saved with the other settings; an old save loads with the marker Off.
status: open
attempts: 0

## M98 · Teams Alpha and Beta, and pick your team (playtest note 4)
tier: core
perf: skip
touches: src/config/teams.ts, src/matchSession.ts, src/game.ts, src/ui/scoreboard.ts, src/ui/roundBanner.ts, src/ui/hitFeed.ts, src/ui/menus/rulesText.ts, src/ui/menus/playView.ts, src/ui/menus/savedChoices.ts, src/sim/
contract: none
acceptance:
  1. The teams are **Alpha** (blue) and **Beta** (orange) everywhere the player reads them (hit feed, scoreboard, banners, minimap, summary, menus, screen reader text); colours and both colour sets are unchanged.
  2. The Match screen has a "Your team" pick (Alpha or Beta), Alpha by default, remembered between visits; solo Extraction doesn't show it.
  3. A full match plays correctly on either team on every map and mode (spawns, ends swapping at half-time in Attack / Defend, records, bots' orders and squad wheel), checked by a test that plays one match per team.
status: open
attempts: 0

## M99 · Replica pictures show the whole replica (playtest note 6)
tier: ui
perf: skip
touches: src/ui/menus/loadoutScreen.ts, src/ui/menus/itemTile.ts, src/ui/menus/menuPictures.ts, src/ui/menus/css/loadout.css
contract: none
acceptance:
  1. Every replica picture in the Loadout's "Your replicas" (and anywhere else a replica tile is drawn) shows the whole replica, muzzle to stock, at every supported window size from 1280 × 720 up.
  2. A browser test fails if a replica picture is cropped.
status: open
attempts: 0

**0.1 Dev 6 (confirmed with the roadmap, 2026-10-06).** M92–M95, the holster and the practice
upgrades, come before the 26 features in `docs/ROADMAP.md` › 0.1 Dev 6, whose blocks are written when that build starts.

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

**The owner's three fixes after W3 (2026-10-09).** His words: "The camo pattern on figures barely shows, the
first-person left arm is plain grey, and bots land hits within a few moments at 5 to 10 metres." One task, one pull
request.

## G11 · Readable camo, a dressed left arm, and a fair moment up close
tier: core
perf: required
touches: src/render/figureCamo.ts, src/render/figureFinish.ts, src/render/figureParts.ts, src/render/figureHuman.ts, src/render/figurePalette.ts, src/render/characterModels.ts, src/render/replicaArms.ts, src/render/replicaBuilder.ts, src/render/handModels.ts, src/render/webgpu/figureNodes.ts, src/render/webgpu/worldTwins.ts, src/config/characters.ts, src/config/replicaFinish.ts, src/config/bots.ts, src/config/graphics.ts, src/config/nav.ts, src/ai/aim.ts, src/ai/botCombat.ts, src/ai/botSenses.ts, src/ai/bot.ts, src/ai/botController.ts, src/ai/routes.ts, src/ai/squadOrders.ts, src/nav/navGrid.ts, src/ai/depotMatchSupport.ts, src/map/g9PlacementQA.test.ts, src/render/g9EffectsQA.test.ts, src/render/g9DressingCost.test.ts, src/render/probeGrid.ts, src/render/probeFile.ts, src/render/bakedLight.ts, pipeline/bake-light.mjs, src/ai/balance/, pipeline/baseline/
contract: none
acceptance:
  1. The team camo on the detailed figure (Medium and up) reads clearly at play distances, near and far, in the art direction, and the Alpha blue and Beta orange teams still read at a glance; the cause of the faint print is found and fixed, not masked.
  2. The first-person left arm wears the same sleeve, glove and skin as the right and the team's kit (camo and armband in view), on WebGL and WebGPU.
  3. Every WebGL change has its WebGPU node twin; `pipeline/webgpu-compare.mjs` on the figure views passes the bar (WebGL2: mean ≤ 0.5 and ≤ 1 % of pixels over 24; a software WebGPU adapter on the pixel share only, owner's ruling 2026-10-09).
  4. Low costs no more than before: no camo on Low figures or sleeves.
  5. The cause of fast bot hits at 5 to 10 m is found (reaction, aim error, first-shot accuracy, spread, convergence) and tuned in data so a player has a fair moment to answer; bots stay a threat. Time to first hit at 5 and 10 m is measured before and after with the headless harness, and win rates are reported as figures, never asserted.
  6. A fast test guards what must never happen: an Easy or Normal bot landing its first hit inside the fair moment at 5 or 10 m, or a bot on Normal and up never hitting a still player up close.
  7. The latent faults the new match flow showed (coordinator's ruling, 2026-10-09) are fixed at the root with the guards' limits unchanged: a bot pushed off its route leg, or cutting a corner at a waypoint, no longer walks a straight line over a ledge (Stack House: rode up a stair's side), a body on a dock's lip snaps to the dock, not the road below (Depot seed 11), and a Follow me teammate no longer routes round the far side of a container while the leader moves (Depot seed 2). Each has a test that fails without its fix; over seeds 1-16, follow worst-distance stays under 8 m and Stack House air time at 2 ticks or less.
status: open
attempts: 0

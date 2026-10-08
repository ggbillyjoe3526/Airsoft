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

## W1 · WebGPU foundation: the node renderer, Auto by default with WebGL as the fallback (WebGPU overhaul, scope `plans/webgpu-overhaul-scope.md`; owner ruling 2026-10-08)
tier: core
perf: required
touches: src/render/renderer.ts, src/render/rendererParts.ts, src/render/rendererStart.ts, src/render/webgpu/, src/render/webgpuProbe.ts, src/config/renderBackend.ts, src/config/rendererPick.ts, src/settings/storage.ts, src/ui/graphicsSettings.ts, src/ui/rendererRow.ts, src/ui/menus/settingsScreen.ts, src/ui/menus/css/rows.css, src/ui/menus/savedChoices.ts, src/game.ts, src/main.ts, vite.config.ts, pipeline/perf-run.mjs, pipeline/perfMatrix.mjs, pipeline/perfMatrix.test.mjs, pipeline/README.md
contract: none (the settings store gains the `renderer` key, by addition)
acceptance:
  1. A public Renderer row (Auto, WebGPU, WebGL) in Settings › Graphics, behind no Dev setting, saved as `renderer` with Auto the default (a migration test reads every older save as Auto). Auto and WebGPU draw a match with `WebGPURenderer` from `three/webgpu` whenever the adapter probe finds a usable adapter (on Auto, a hardware one), on plain node materials (materials patched with `onBeforeCompile` draw unpatched; the GLSL post stack and the retro filter are off on that path until W2–W4, a KNOWN_ISSUES row, fix now). WebGL always draws with the old `WebGLRenderer` path.
  2. With no `navigator.gpu`, a null adapter or a device that can't be made at boot, Auto and WebGPU fall back to the old `WebGLRenderer` path with no console error, and WebGPU picked says so in one line on the row. A test pins that Auto with no adapter (this container, CI and every gate: smoke, perf, baselines) gives the same renderer, and so the same draws, as before W1.
  3. `three/webgpu` is loaded by a dynamic import only after the probe finds an adapter (or the e2e build's `?forceWebGL` asks for the WebGL2 back end), so it is never in the main chunk and a WebGL-only browser never downloads it.
  4. A lost WebGPU device is recovered: the game pauses under the graphics notice, a new device and renderer take over (WebGL if none can be made, with the post stack and retro filter back and the row saying so), and play resumes; the debug overlay's GPU time comes from timestamp queries where the adapter offers them ("n/a" otherwise).
  5. The perf harness records which back end ran (`backend` in its result; a run the node renderer drew names its files after it); an e2e spec sets Renderer = WebGPU with `?forceWebGL`, boots a match on the node renderer's WebGL2 back end and checks that frames render with no errors.
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

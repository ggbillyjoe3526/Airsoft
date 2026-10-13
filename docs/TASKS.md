# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its record
(`docs/records/<id>.md`) and its CHANGELOG line remain. The planning thread writes blocks; the build thread sets
`status` and `attempts` once, in its records commit (no status-only commits).

**The owner's 0.1 Dev 4 playtest notes (2026-10-06).** Recorded on his ask, not built yet; they follow the rest
of the paused 0.1 Dev 5 work. His words and the per-item reasoning are in the project's shared
files (`plans/playtest-feedback-0.1-dev-4.md`); `docs/ROADMAP.md` › Playtest notes: 0.1 Dev 4 maps all 26 notes. M80–M91
and M96 are 0.1 Dev 5 fixes and changes, M92–M95 suggested 0.1 Dev 6 features. Notes 5 and 22 are now the Replica
Update, notes 20, 21 and 23 the Modes Update (owner, 2026-10-12; ROADMAP).
Every block below carries note 19: tune on Normal, then check that Easy, Hard and Pro still scale. `touches` are
first guesses; the build thread confirms them before it starts. The owner ruled on every conflict on 2026-10-06
(ROADMAP, under the playtest table).

**The owner's playtest notes on main (2026-10-07).** Recorded on his ask, not built yet. His words, the type and the
defaults per note are in the project's shared files (`plans/playtest-feedback-2026-10-07.md`);
`docs/ROADMAP.md` › Playtest notes: main after G3 maps all eight. M97–M99 join the Dev 4 notes batch (Dev 5 item 6); M100 is the graphics work's (Dev 5
item 5, with the G4 HUD restyle); note 3 was a bug, fixed in BP2; note 2 is already in the game
(Settings › Controls › Aim button). Note 19 of the Dev 4 notes still applies.

**0.1 Dev 6 (confirmed with the roadmap, 2026-10-06).** M92–M95, the holster and the practice upgrades, are done
(2026-10-13); the blocks for the rest of `docs/ROADMAP.md` › 0.1 Dev 6 are written when that work starts.

## PT1 · The owner's 0.1 Dev 5 playtest fixes (ten notes, 2026-10-13)
tier: core
perf: skip
touches: pipeline/baseline/container-neon-extraction.json, pipeline/webgpu-compare.mjs, src/assets/models/replicaParts/aeg.glb, src/audio/audioEngine.ts, src/audio/dsp.ts, src/audio/sfx.ts, src/audio/soundBank.ts, src/config/audio.ts, src/config/graphics.ts, src/config/hits.ts, src/config/hudText.ts, src/config/movement.ts, src/config/optics.ts, src/config/renderEffects.ts, src/config/renderQuality.ts, src/config/renderView.ts, src/config/sounds.ts, src/config/tutorial.ts, src/config/vault.ts, src/core/escSkip.ts, src/game.ts, src/input/pointerLock.ts, src/matchSession.ts, src/render/bbRenderer.ts, src/render/combatPresentation.ts, src/render/eyepiece.ts, src/render/matchPresentation.ts, src/render/replicaParts.ts, src/render/viewmodel.ts, src/settings/storage.ts, src/sim/accuracy.ts, src/sim/armament.ts, src/sim/character.ts, src/sim/movement.ts, src/sim/simulation.ts, src/sim/vault.ts, src/style.css, src/ui/audioSettings.ts, src/ui/crosshairSettings.ts, src/ui/hitFeedback.ts, src/ui/hitMarkerLook.ts, src/ui/hud.ts, src/ui/hudCss/replica.css, src/ui/loadoutChoice.ts, src/ui/menus/choiceCards.ts, src/ui/menus/css/armory.css, src/ui/menus/css/play.css, src/ui/menus/css/saved.css, src/ui/menus/savedLoadoutsBar.ts, src/ui/playPrompt.ts, src/ui/replicaPanel.ts
contract: none
acceptance:
  1. No menu or HUD text runs out of its button or background at 1280×720, 1920×1080 or 2560×1440 (note 1).
  2. Shots are louder, and Settings › Audio has a Power source volume for the battery motor, gas and spring (note 2).
  3. No BB draws a halo; a glowing BB is lit itself (note 3).
  4. The hit marker is clearly visible, with scale, thickness, outline and colour settings (note 4).
  5. Aiming down the 2x scope keeps the replica in view with the world round it, as the red dot does (note 5).
  6. Neither 2x scope model shows a gap between glass and body (note 6).
  7. Which arm models are drawn is reported to the owner; the Dev switch defaults stay as they are (note 7).
  8. The ammo count never overlaps the replica panel's other parts (note 8).
  9. You can fire while sprinting, less accurately than walking (note 9).
  10. Esc while out skips the round without the pause menu (note 10).
status: open
attempts: 0

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

**0.1 Dev 6 (confirmed with the roadmap, 2026-10-06).** M94–M95, the rest of the practice upgrades, come before the
rest of `docs/ROADMAP.md` › 0.1 Dev 6, whose blocks are written when that build starts (M92, the holster, and M93,
the practice targets, done 2026-10-13).

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


## M104 · Rest your replica on cover (Dev 6 item 40)
tier: core
perf: required
touches: src/sim/coverRest.ts, src/sim/character.ts, src/sim/simulation.ts, src/sim/armament.ts, src/sim/accuracy.ts, src/config/movement.ts, src/config/audio.ts, src/config/renderView.ts, src/config/hudText.ts, src/config/figureRig.ts, src/audio/foley.ts, src/audio/sfx.ts, src/render/viewmodel.ts, src/render/combatPresentation.ts, src/render/riggedFigure.ts, src/ui/hud.ts, src/style.css
contract: GameState and state.events (`Character.coverRest`), stepSimulation (a rest phase between lean and accuracy)
acceptance:
  1. Aiming down sights while still, grounded and upright (standing or crouched) at a flat ledge between waist and
     chest height straight ahead (a crate, low wall, window sill or sandbags) rests the replica on it; turning away,
     moving, letting go of the aim, reloading or leaning lets go smoothly.
  2. Resting is steadier: less spread and less kick, from numbers in config that the game and tests read.
  3. The player sees and hears it: a "Rested" tag in the HUD's style, a settle dip and calmer sway in first person, and
     a quiet settle sound; the rigged figures behind the Dev switches lean over the cover (a placeholder pose).
  4. It works on Depot, Woodland and Neon Heights, measured over each map's walkable points; ramps and walls are no
     ledge.
  5. Bots follow the same rule through the same command (they fire from the hip, so they don't rest yet; the bot part
     is described in the record and HANDOFF).
status: open
attempts: 0

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

**The owner's playtest notes on main (2026-10-07).** Recorded on his ask, not built yet. His words, the type and the
defaults per note are in the project's shared files (`plans/playtest-feedback-2026-10-07.md`);
`docs/ROADMAP.md` › Playtest notes: main after G3 maps all eight. M97–M99 join the Dev 4 notes batch (Dev 5 item 6); M100 is the graphics work's (Dev 5
item 5, with the G4 HUD restyle); note 3 was a bug, fixed in BP2; note 2 is already in the game
(Settings › Controls › Aim button). Note 19 of the Dev 4 notes still applies.

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

## RM7 · The GBB Pistol replaces the Gas Pistol (owner's ask, 2026-10-12)
tier: core
perf: skip
touches: src/assets/models/replicas/pistol.glb, src/assets/models/replicaParts/pistol.glb, src/config/replicas.ts, src/config/renderView.ts, src/render/replicaModels.ts, src/render/replicaRig.ts, src/render/viewmodel.ts, pool.md, stats.md
contract: the replica model file (docs/CC0_ASSETS.md › Replica models: a `SlideLock` animation, by addition)
acceptance:
  1. The Gas Pistol is the GBB Pistol everywhere a player sees its name, with the same numbers (pool ID, stats, fits).
  2. It draws from the model the owner approved (his six reference photos, no logo or lettering), within the file budgets (3,500 triangles held, 300 on a figure, 300 KB); its laser, torch, silencer and extended magazine still fit.
  3. Each shot kicks the slide back over the still barrel and home; on an empty magazine it stays locked back until a reload seats a full one, with Blender models on and off.
  4. Aiming down its small low sights puts the front post on the view's centre, with Blender models on and off.
status: open
attempts: 0

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

## M102 · Vaulting over low obstacles (0.1 Dev 6)
tier: core
perf: required
touches: src/sim/, src/ai/, src/nav/, src/audio/, src/config/, src/map/, src/render/, src/ui/, src/tutorial/, src/matchSession.ts, src/rangeSession.ts, src/style.css
contract: GameState and state.events (Character.vault, footstep kind vault), stepSimulation (the vault phase)
acceptance:
  1. Jump at a low obstacle (owner, 2026-10-12: 0.7 to 0.9 m) takes you over it in a short, committed move with a camera dip, a sound and no clipping; anywhere else Jump is a jump, and crouch cover and railings are never vaulted.
  2. Depot, Woodland and Neon Heights each get a low wall where it opens a route, vaulted both ways.
  3. A vault is loud: bots hear it from further than a sprinting step (owner, 2026-10-13).
  4. Bots vault where it saves them a walk, through the same command as the player.
  5. The tutorial and the controls teach it; the figures hold a placeholder pose behind the Dev switches (the animation gap noted in docs/HANDOFF.md). No slide.
status: open
attempts: 0

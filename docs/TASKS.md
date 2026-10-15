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

## AC1 · Hide the ammo counter (Dev 6 item 46)
tier: ui
perf: skip
touches: src/config/magShare.ts, src/config/matchInfo.ts, src/config/tutorial.ts, src/game.ts, src/magHandoff.ts, src/matchSession.ts, src/rangeSession.ts, src/render/combatPresentation.ts, src/settings/storage.ts, src/ui/coachPanel.ts, src/ui/hud.ts, src/ui/hudCss/replica.css, src/ui/hudSettings.ts, src/ui/replicaPanel.ts
contract: the settings store (key `ammoCounter`, `on` or `off`) and TutorialStep (`countHidden`, said instead of `text` while the counter is off)
acceptance:
  1. Settings › HUD › Ammo counter (Off or On, On when nothing is saved, kept after a reload): Off takes the loaded BB count and the "/ N · M spare" line off the replica panel; each spare magazine still shows as its bar, solid while it holds any BBs and hollow once empty, with no fill level, low stripes or next-magazine caret. On is as before.
  2. With it off the rest plays as before: the reload bar and Reloading, the empty-magazine hint naming the reload key, Last magazine, Out of BBs, Holstered, the dry-fire click, the Mag key's Low on BBs hint and the hand-off; the caught-magazine notice leaves out the BB count ("+1 mag from {name}").
  3. A change on the pause menu applies at once, in a match and in Practice (the range and any map), and to every later match and Practice.
  4. The tutorial follows it: the HUD as set, and with the counter off the Reload step says to keep count yourself instead of "watch your count", redrawn at once if changed mid-step.
  5. Nothing is allocated per frame for it; the panel writes the DOM only when what it shows changes; the main chunk stays at or under 1,250 kB.
status: open
attempts: 0

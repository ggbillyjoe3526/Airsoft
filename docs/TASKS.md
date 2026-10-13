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

## AD1 · Automatic difficulty that adapts to you (Dev 6 item 48)
tier: core
perf: required
touches: src/config/adaptiveDifficulty.ts, src/ai/adaptiveSkill.ts, src/ai/adaptiveRun.ts, src/ai/bot.ts, src/ai/botController.ts, src/ai/balance/adaptive.balance.ts, src/ai/README.md, src/ai/balance/README.md, src/adaptivePicks.ts, src/matchSession.ts, src/game.ts, src/config/dev.ts, src/config/README.md, src/settings/storage.ts, src/settings/adaptiveRating.ts, src/settings/README.md, src/ui/menus/playView.ts, src/ui/menus/menusOptions.ts, src/ui/menus/summaryScreen.ts, src/ui/menus/css/end.css
contract: none
acceptance:
  1. Settings › Dev has an "Adaptive difficulty" switch, off by default; off (or with the Dev tab hidden) every match plays exactly as before, and the fixed levels' numbers never change.
  2. On, in Elimination and Attack / Defend, the other team's bots start at the Opponents level picked and adapt to how you do: up after a match you win, down after one you lose, by more for a clear result (the rounds and your own hits count too), on a scale from Easy to the highest level offered (Hard; Pro with Dev content on). Picking another Opponents level starts it again from that level. Extraction plays the fixed levels; your teammates never adapt.
  3. Within a match it moves gently between rounds from the round just played, never more than a set amount from where the match began; the bots' switches (holding angles, team play, kits) stay the match's level throughout.
  4. Between two levels the bots' numbers blend the two levels' numbers; everything else comes from the level the match plays as (the nearest one).
  5. Every tuning number is in one hand-editable table (config/adaptiveDifficulty.ts), and it eases off a little faster than it climbs.
  6. The Match screen says where the other team starts, and the summary what the match changed. Only a match played to the end without other Dev help moves it; adaptive matches stay out of the records and pay nothing, like the other Dev settings that change play.
  7. Unit tests cover the blend, the steps and limits, the restart on a new level, the drift within a match, the summary's words and that teammates keep their level; a balance figure shows in-between levels land between their neighbours and the rating following a stronger or weaker side.
status: open
attempts: 0

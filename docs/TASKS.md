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

## OT1 · Overtime flag (Dev 6 item 45)
tier: core
perf: required
touches: src/sim/round.ts, src/sim/overtimeFlag.ts, src/sim/events.ts, src/sim/simulation.ts, src/config/modes.ts, src/config/hits.ts, src/config/bots.ts, src/config/adaptiveDifficulty.ts, src/config/botsFile.ts, src/config/calloutsFile.ts, src/config/matchRules.ts, src/config/hudText.ts, src/config/render.ts, src/config/renderView.ts, src/config/audio.ts, src/map/mapTypes.ts, src/map/depot.ts, src/map/woodland.ts, src/map/neonHeights.ts, src/content/, src/ai/bot.ts, src/ai/personality.ts, src/ai/botBrain.ts, src/ai/botMovement.ts, src/ai/botController.ts, src/ai/botCombat.ts, src/ai/callouts.ts, src/ai/depotMatchSupport.ts, src/ai/balance/, src/render/flagRenderer.ts, src/render/matchPresentation.ts, src/audio/sfx.ts, src/ui/, src/core/eventLog.ts, src/matchSession.ts, src/matchFlow.ts, bots.md, callouts.md
contract: GameState (`RoundState.overtimeFlag`, the `overtime` event, RoundEndReason `overtimeFlag`), RoundContext and SimServices (`overtimeFlag`, optional), RoundRules (`overtime`), the map block format (`MapData.overtimeFlag`, optional), bots.md's format (Habits › Watches the flag first), callouts.md's format (the Overtime event)
acceptance:
  1. An Elimination round whose clock runs out with both teams in play and the time-out rule giving nobody the round (level, or the Draw rule) goes to overtime on a map with an overtime flag: the flag goes up at the map's `overtimeFlag` (an `overtime` event) and the round plays on for OVERTIME.time. A player in play within OVERTIME.reach of its foot (and OVERTIME.reachHeight of its floor) touches it and wins the round for their team (`roundOver`, reason `overtimeFlag`); both teams touching it at once is contested and nobody takes it. A team knocked out still loses at once. Nobody touches it in time: the time-out rule decides as before (a draw, played again, or more players left). Attack / Defend and Extraction never have it; a map without the spot plays a level time-out as before.
  2. Depot, Woodland and Neon Heights each have an overtime flag spot near the middle on walkable floor, out of the bushes, that both ends walk to in about the same time from their spawns (the content toolkit's `map.overtimeFlag` check: within MAP_STANDARD.walkSpread, and reached within OVERTIME.time at a run).
  3. Bots go for the flag once it is up, each after its level's `overtimeReaction` (Easy slowest, Pro quickest), straight to its foot; a flanker (its flankChance) goes round one side first when far; a personality that watches the flag first (bots.md › Habits › Watches the flag first: Anchor, Careful) holds cover near it facing it for that long, or until it is the last of its team in play, then goes for it. Fights, cover and a squad order still come first; the flag comes before chasing noises, pings and asking for a magazine.
  4. You see and hear it: a three-blast whistle and the banner "Overtime · touch the flag" when it goes up; the flag rises from its foot (neutral cloth, the reach ring on the floor, contested in the contested colour), the marker over it with its distance and the minimap's flag mark; the scoreboard's clock counts the overtime down under "Overtime" and its strip says what the flag is doing; the round banner says who took the flag; the flag turns the winner's colour. A teammate bot calls it (callouts.md › Overtime). The Rules text, the Time-out choices and the Win by two row (renamed from Overtime) say how it works.
  5. Every number is data (OVERTIME, the bots' overtimeReaction, bots.md, callouts.md, the visuals). Nothing is allocated per tick or per frame; determinism and the bot-match guards hold (rounds may run OVERTIME.time past the clock); the skip and End the round now cover overtime; the balance figures move only by draws becoming decided rounds; the main chunk stays at or under 1,250 kB.
status: open
attempts: 0

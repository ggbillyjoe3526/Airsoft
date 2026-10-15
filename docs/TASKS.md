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


## PG1 · Pings: mark a spot for your team, and your bot teammates act on it (Dev 6 item 24)
tier: core
perf: required
touches: README.md, callouts.md, src/ai/README.md, src/ai/bot.ts, src/ai/botController.ts, src/ai/callouts.ts, src/ai/pings.ts, src/audio/README.md, src/audio/sfx.ts, src/audio/whistle.ts, src/config/README.md, src/config/audio.ts, src/config/bots.ts, src/config/calloutsFile.ts, src/config/controls.ts, src/config/pings.ts, src/game.ts, src/input/README.md, src/input/playerInput.ts, src/matchSession.ts, src/render/combatPresentation.ts, src/render/matchPresentation.ts, src/settings/storage.ts, src/ui/README.md, src/ui/hud.css, src/ui/hudCss/pings.css, src/ui/hudSettings.ts, src/ui/minimap.ts, src/ui/pingMarkers.ts
contract: the settings store (key `pingMarkers`) and callouts.md's format (two events, Going to your ping and Watching your ping, and a Marks table)
acceptance:
  1. In a match, the Ping key (Settings › Controls, middle mouse by default) marks where you look, up to PINGS.range: the floor, a wall or a crate, or an enemy you can see under the crosshair ("Contact", by the bots' sight rules: one in a bush or the dark can't be found this way). Nothing within range, out of play, between rounds or on the practice range: no ping.
  2. The ping shows over the field with its distance (yours in your team's colour, a contact in theirs), pinned to the screen's edge when out of view, and on the minimap; it fades after PINGS.lifetime s of play. One ping per player at a time: a new one replaces the old; a new round clears them all.
  3. Your bot teammates in play take your ping as a point of interest and act on it as their personality plays a noise: a rusher runs there, a flanker may go round, a careful bot walks in clearing corners, an anchor holding short of the middle (or a defender at its post) watches it from there. One under your squad order keeps it and watches the spot; one fighting or in cover ignores it. A bot keeps a ping in mind for up to BOT_BEHAVIOUR.pingMemory s, until it has looked, or until real news of an enemy replaces it.
  4. One teammate answers each ping in the callout feed, Going to your ping or Watching your ping (callouts.md), with what it actually does; the answers come before every call but a hit's, and Talks (×) never makes one less likely.
  5. A bot teammate's sighting call sometimes marks the enemy it sees for you, at the Marks table's chance and at most once per its gap for the team (callouts.md); the mark shows as a contact ping. The marks are presentation only: the callouts still never change play.
  6. Settings › HUD › Ping markers, On by default and saved, hides or shows every ping marker over the field and on the minimap at once; pings and their answers still work with it off.
  7. A soft pip plays when you ping. Nothing is allocated per frame or per tick for pings (a press makes only its pip's sound nodes, as every sound does); the bot-match guards and the simulation's determinism are as they were.
status: open
attempts: 0

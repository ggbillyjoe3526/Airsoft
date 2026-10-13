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

## CL1 · Location callouts: named areas, and bot teammates calling what they see and do (Dev 6 item 22)
tier: core
perf: required
touches: callouts.md, pipeline/build-cached.mjs, src/ai/callouts.ts, src/audio/sfx.ts, src/config/audio.ts, src/config/calloutLines.ts, src/config/callouts.ts, src/config/calloutsFile.ts, src/content/mapRules.ts, src/game.ts, src/map/areas.ts, src/map/depot.ts, src/map/mapTypes.ts, src/map/neonHeights.ts, src/map/woodland.ts, src/matchSession.ts, src/render/combatPresentation.ts, src/render/matchPresentation.ts, src/settings/storage.ts, src/ui/calloutFeed.ts, src/ui/hud.css, src/ui/hudCss/callouts.css, src/ui/hudCss/minimap.css, src/ui/hudSettings.ts, src/ui/minimap.ts
contract: the map block format (MapData.areas, optional), the settings store (key `callouts`), and a new one: callouts.md's format
acceptance:
  1. Every walkable spot of Depot, Woodland and Neon Heights lies in a named area (MapData.areas, first match wins, by floor on Neon Heights; names at most 14 characters; content rule map.areas); the minimap shows the area you, or the teammate you watch, stand in.
  2. Your bot teammates' calls show in a feed at the bottom left, name in the team's colour then the line ("Rook  Contact, Dock!"), newest at the bottom, at most 4, each gone after 6 s of play and cleared at a round's start; the other team's words never show.
  3. callouts.md at the root holds each event's chance and team gap (row order is urgency), the pace, each bots.md personality's Talks (×) and the lines with {area}, {count} and {left}; it is read at start (config/calloutsFile.ts), never throws, reports every unreadable row with its line, and the shipped file reads clean.
  4. Calls come from what the bots already do: a fresh sighting of one or several, a noise while the team sees nobody, a hit by the team (how many are left, the last one, or "tagged" in Extraction), a reload under threat, setting off after someone (pushing, flanking or checking), settling at a hold (once a round), the flag going up (Attack / Defend). Hit players never talk. A personality changes how often a bot talks and which lines it has.
  5. The pace holds whatever the chances: one call per team at a time, at least the team gap apart; one bot's calls the bot gap apart; the same enemy not called again within its gap; a call held back dropped after its wait, the most urgent said first. Unit tests show each rule, and headless bot matches on all three maps never break them.
  6. A teammate's call plays the walkie-talkie squelch in your ear, panned towards where they stand; an enemy's within 15 m plays it from where they stand, muffled by walls. No voices.
  7. Settings › HUD › Callouts, On by default, turns the feed and the squelches off and on at once in a match, and is saved.
  8. Callouts never change play: the director only reads the bots and the state, with a seeded generator of its own; the bot-match guards and the simulation's determinism stay as they were, and it allocates nothing per tick but the lines it says.
status: open
attempts: 0

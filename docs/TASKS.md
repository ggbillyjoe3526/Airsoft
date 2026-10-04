# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

The Esports plan (owner approved 2026-10-04; ROADMAP M36–M41, DECISIONS "M36–M41", the plan in the project's shared
files `research/esports-difficulty-2026-10-04.md`). Everything here is tagged dev with M35's content tag until the
owner says it's done. Any change to `src/ai/perception.ts` or BotWorld's sight is announced to the coordinator
first (M33 changes both).

## M36 · The Pro difficulty level
tier: core
perf: skip
touches: src/config/bots.ts, src/config/content.ts, src/pool/, pool.md, src/stats/, src/settings/storage.ts, src/ui/menus/, src/config/menus.ts, src/matchSession.ts
acceptance:
  1. A fourth difficulty `pro` ("Pro") for opponents and teammates, tagged dev: listed only with the Dev content switch on.
  2. Its BOT_SKILL row: settled aim tighter than Hard, lead about 0.85, `aimErrorStartMetres` above zero, short bursts.
  3. Opponents roll kits as on Hard with partChance about 0.8; the Cyber Pistol rule applies as on Hard.
  4. pool.md's Difficulty table has a Pro row ×2, read by the game; a pool.md without the row still loads.
  5. Records keep `pro.<mode>` rows; saves from before load unchanged (no SAVE_FORMAT change, or an upgrade step if one is needed).
status: open
attempts: 0

## M37 · Pro bots hold angles
tier: core
perf: required
touches: src/ai/, src/nav/, src/map/, src/config/bots.ts
acceptance:
  1. Angles (doorways, wall corners, stair tops; bush edges and tree gaps where a map has them) are worked out per map from its navigation, not hand-placed, and tested per map.
  2. A Pro bot that stops holds an angle, aimed at head height where someone would appear.
  3. Reaction about 0.18–0.28 s to someone appearing within a few degrees of where the bot aims; Hard speed or slower elsewhere.
  4. A headless test fails if any bot, at any difficulty, aims at someone it hasn't seen or heard.
  5. Easy, Normal and Hard play as before (their guards unchanged).
status: open
attempts: 0

## M38 · Pro bots clear corners and play as a team
tier: core
perf: required
touches: src/ai/, src/config/bots.ts
acceptance:
  1. Near the enemy, or after hearing someone, Pro bots walk and slice corners through lean spots instead of running the lane.
  2. A bot whose teammate is hit looks at, and when it can pushes or peeks, where the shot came from within a few seconds.
  3. Two defenders cover one choke from different sides where the map allows (crossfire); bots move in pairs with one covering.
  4. A spot someone peeked from stays pre-aimed for a few seconds; heard positions are shared with teammates (no better than the player's minimap).
  5. Late in an Elimination round the side behind on players pushes; Pro bots reload behind cover.
status: open
attempts: 0

## M39 · Rules picker: Skirmish, Tournament, Pro CQB, Custom
tier: core
perf: skip
touches: src/config/matchRules.ts, src/config/hits.ts, src/config/content.ts, src/sim/round.ts, src/sim/state.ts, src/matchSession.ts, src/game.ts, src/ui/menus/, src/config/menus.ts, src/ui/minimap.ts, src/ui/minimapView.ts, src/config/minimap.ts, src/pool/armory.ts, src/stats/, src/settings/storage.ts, src/config/replicas.ts
acceptance:
  1. A Rules row beside Mode; Skirmish (today's rules) is the default; Tournament, Pro CQB tagged dev; Custom holds every switch.
  2. Tournament: first to 7 with half-time and win-by-two overtime, 2:00 rounds, Elimination time-out won by the side with more players left (draw if equal), minimap teammates only, ricochets count, strict marshal (once the overshooting rule exists), Loadout locked for the match, own Armory kit.
  3. Pro CQB: Tournament plus semi-auto only and realcap 30-BB magazines (3 carried).
  4. Named rulesets get their own records on every difficulty and pay ×2 on Pro; Custom on Pro pays ×1.5 and never counts.
  5. The picker is the field rules presets' machinery: a new ruleset is one data entry.
status: open
attempts: 0

## M40 · Map balance for Pro
tier: core
perf: skip
touches: src/ai/, src/map/
acceptance:
  1. Headless Pro guards per playable map: Attack / Defend attackers 40–60 %, each end 40–60 % of decided Elimination rounds, under 1 round in 10 on time.
  2. Depot unchanged unless its Office lane puts attackers under 40 %; then a window or second door between two rooms, layout tests still passing.
  3. Woodland and the city are checked against the same guards once their navigation lands.
status: open
attempts: 0

## M41 · What got you, Pro tips and tuning
tier: ui
perf: skip
touches: src/ui/, src/config/matchInfo.ts, src/sim/events.ts, src/game.ts, src/config/tutorial.ts, src/config/bots.ts
acceptance:
  1. After you're hit, a card shows where the shot came from, whether that bot was holding the angle, how long you were in view and whether you were moving.
  2. A setting turns it on for every difficulty; on by default only on Pro.
  3. Pro briefing tips (slice corners, short peeks, listen).
  4. Tuning numbers for Pro in one place, ready for the owner's playtest per map.
status: open
attempts: 0

The Extraction plan (owner approved 2026-10-04 20:51 and 20:54 UTC: every default except question 3, one automatic
respawn per run; the plan in the project's shared files `research/extraction-mode-2026-10-04.md`). Everything here is
tagged dev with M35's content tag until the owner says it's done. M33 owns the map framework (MapData gains only an
optional `extraction` block), the Pro thread owns held angles and team play (M37, M38): changes there go through the
coordinator.

## M43 · Extraction: the run, exits, clock and respawn on Depot
tier: core
perf: required
touches: src/config/modes.ts, src/config/extraction.ts, src/config/render.ts, src/config/content.ts, src/map/mapTypes.ts, src/map/depot.ts, src/map/maps.ts, src/sim/extraction.ts, src/sim/round.ts, src/sim/events.ts, src/sim/state.ts, src/matchSession.ts, src/game.ts, src/render/exitRenderer.ts, src/render/matchPresentation.ts, src/ui/scoreboard.ts, src/ui/roundBanner.ts, src/ui/matchStopText.ts, src/ui/runStatus.ts, src/ui/flagMarker.ts, src/ui/minimap.ts, src/ui/hitFeedback.ts, src/ui/recordsView.ts, src/ui/menus/rulesText.ts, src/ui/menus/menus.ts, src/stats/settleMatch.ts, src/style.css, src/audio/, src/core/seed.ts, src/sim/simulation.ts, src/map/playableMode.ts, src/ai/squadFollow.ts, src/config/sounds.ts, src/config/audio.ts, src/newGamePicks.test.ts, src/config/matchRules.ts, src/config/matchRules.test.ts, src/ui/statsRows.ts, src/ui/statsRows.test.ts, docs/
contract: GameState and state.events (RoundState gains `run`; events `respawned`, `exitCount`, `exitOpened`, `runWarning`); MapData gains an optional `extraction` block
acceptance:
  1. A mode `extraction` ("Extraction"), tagged dev, offered only on maps whose data has an `extraction` block (insertions, exits, opponent starts, run time, base opponents); Depot has one.
  2. Squad of 1–3 (the Match pop-up's team size) against base + squad size opponents in play (Depot 3 / 4 / 5); the insertion is picked from the run's seed; exits within 30 m of it are closed for the run; a late exit opens with 3:00 left.
  3. Holding an open exit for 10 s ends the run "extracted"; leaving resets the count, an opponent in play inside pauses it; time out ends it "caught out"; a whistle at 1:00 left.
  4. A hit squad member respawns at the insertion automatically once the hit call ends, once per run; the second hit is out (the player's ends the run "out"); bot teammates follow you by default and after a respawn.
  5. HUD: the run clock, the exit line (count, paused, closed), whether your respawn is spent, exit markers and minimap icons; banner and result screen worded for the run; runs stay out of the records and pay nothing until M47.
  6. Elimination and Attack / Defend play as before (their guards unchanged); a headless run test covers extract, time out, respawn and out.
status: building
attempts: 0

## M44 · Extraction: cases and loot
tier: core
perf: required
touches: src/sim/extraction.ts, src/config/extraction.ts, pool.md, src/pool/, src/map/mapTypes.ts, src/map/depot.ts, src/render/, src/ui/, src/config/controls.ts, src/input/, src/matchSession.ts, src/game.ts, src/save/, src/style.css, src/audio/
acceptance:
  1. Case spots in map data; each run's seed places ammo cans, field cases and one marshal's locker and rolls their contents from a Caches table in pool.md.
  2. A rebindable Use key opens a case by holding it (2 / 4 / 7 s), with a noise bots hear; contents are FC bundles, BB resupplies (used at once) and pool parts drawn like a Shot's (rarity odds, unowned weight), never dev gear without Dev content, never touching pity.
  3. A hit drops what you carry as a case where you fell; finds reach the collection only when you extract, in one save.
  4. The summary reveals the haul with the Armory's rarity colours.
status: open
attempts: 0

## M45 · Extraction: waves and regen points
tier: core
perf: required
touches: src/sim/extraction.ts, src/config/extraction.ts, src/config/bots.ts, src/map/mapTypes.ts, src/map/depot.ts, src/ai/, src/matchSession.ts
acceptance:
  1. Hit opponents re-enter in waves: every 75 s on Normal (100 Easy, 60 Hard) or as soon as all are out, up to the cap; one more in play in the last third.
  2. Regen points are map data; a returner uses one at least 15 m (Depot) from every squad member and out of their sight; tested on every map with an extraction block.
status: open
attempts: 0

## M46 · Extraction: guards, patrols and hunters
tier: core
perf: required
touches: src/ai/, src/config/bots.ts, src/map/, src/sim/extraction.ts
acceptance:
  1. Guards hold cover facing a case's approaches within a leash (M37's angles where present), two on the locker; patrols walk between cases in pairs.
  2. From halfway (Normal) hunters push to where the squad was last seen or heard: the bots' first push behaviour.
  3. Bot teammates take cover facing outwards while you open a case.
  4. Headless balance runs: extract rate and FC a minute per difficulty within bands, guarded by a test.
status: open
attempts: 0

## M47 · Extraction: pay and records
tier: ui
perf: skip
touches: src/pool/armory.ts, pool.md, src/stats/, src/ui/, src/matchSession.ts, src/game.ts
acceptance:
  1. A run pays the FC it extracts with plus 5 a hit, times the difficulty; out or caught out pays hits only.
  2. Records `difficulty.extraction` (runs and extractions), best haul, extraction streak, fastest extraction with a case; older saves load unchanged.
status: open
attempts: 0

## M48 · Extraction on Woodland and Neon Heights
tier: core
perf: required
touches: src/map/, src/ai/
acceptance:
  1. Each map's extraction block (insertions, exits, cases, regens, opponent starts), Woodland 15 min with 4 / 5 / 6 opponents, the city 10 min.
  2. The data tests and balance runs of M45 and M46 pass on each.
status: open
attempts: 0

## M49 · Supply weekends and dated events
tier: ui
perf: skip
touches: pool.md, src/pool/, src/config/, src/ui/
acceptance:
  1. A recurring Supply weekend (Friday to Sunday by the device clock) and a dated event table in data, each a case-odds modifier shown on the Mode pop-up.
status: open
attempts: 0

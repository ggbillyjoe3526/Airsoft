# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M35 · Public and dev content tags: dev content only with the Dev content switch on
tier: core
perf: skip
touches: src/config/content.ts, src/config/dev.ts, src/settings/dev.ts, src/config/modes.ts, src/config/bots.ts, src/config/matchRules.ts, src/map/maps.ts, pool.md, src/pool/pool.ts, src/pool/contentPool.ts, src/pool/armory.ts, src/pool/botKit.ts, src/pool/loadoutModel.ts, src/matchSession.ts, src/game.ts, src/ui/recordsView.ts, src/ui/optionPicker.ts, src/ui/menus/choiceDialog.ts, src/ui/menus/menus.ts, src/ui/menus/armoryScreen.ts, src/ui/menus/summaryScreen.ts, src/config/menus.ts, src/ui/devSettings.ts, src/newGamePicks.ts, src/stats/settleMatch.ts, src/pool/testSupport.ts, src/ui/testSupport.ts, e2e/, docs/
contract: pool.md's asset tables gain an Access column (public or dev; blank reads as public); Asset, MAPS, MATCH_MODES and DIFFICULTIES entries gain `tag: ContentTag`; the settings store gains `dev.devContent` (a new field, no version change); MatchSetup gains `devContent` and `devContentUsed`
acceptance:
  1. Every map, mode, difficulty and pooled asset carries a tag, public or dev (`ContentTag`, config/content.ts); choice lists (team size and the other Match pop-up options) may carry one, untagged meaning public; pool.md has an Access column the game reads, with a bad value leaving the row out
  2. One Dev tab switch, Dev content (off by default, `dev.devContent`; a save holding the Woodland thread's `dev.mapsInDevelopment` carries over), applying only while Dev settings is ticked; `isAvailable(tag, devContent)` is the one check every menu and system uses
  3. With it off, dev content is not shown anywhere (owner, 18:57): dev maps (and the Coming soon list), modes, difficulties and choices are hidden, dev gear is hidden from the Loadout and the Armory's collection (kept in the save, picks remembered), a saved dev pick plays as the default, bots never carry dev gear, and Unlock all gear lends no dev gear; with it on, all of it is offered looking like the rest (no badge)
  4. Dev gear never drops from Shots, whatever the switch
  5. A match that uses any dev content (map, mode, either difficulty, the player's kit or a bot's) stays out of the records and pays no Field Credits; New game says so beforehand and the summary says why
  6. Today everything is public; the decision is recorded in DECISIONS
status: gates
attempts: 1

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

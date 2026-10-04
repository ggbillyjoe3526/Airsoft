# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M32 · Cyber Pistol: a Legendary-only chase replica (owner's design)
tier: core
perf: required
touches: pool.md, stats.md, src/config/replicas.ts, src/config/sounds.ts, src/config/bots.ts, src/config/menus.ts, src/config/dev.ts, src/pool/pool.ts, src/pool/collection.ts, src/pool/loadoutModel.ts, src/pool/armory.ts, src/pool/botKit.ts, src/audio/sfx.ts, src/render/combatPresentation.ts, src/render/replicaModels.ts, src/config/replicaFinish.ts, src/render/viewmodel.ts, src/ui/menus/loadoutScreen.ts, src/ui/menus/armoryScreen.ts, src/matchSession.ts, src/game.ts, src/style.css, CHANGELOG.md, docs/
contract: pool.md's format (two optional columns, Tiers and Drop %, and the tag built-in-power); stats.md's Replicas table (a cyber row); MatchSetup (an optional chaseOwned list)
acceptance:
  1. pool.md has the Cyber Pistol (000019, key cyber) with Tiers `Legendary` and Drop % 0.25; a bad tier name or Drop % is reported with its line and the row skipped; blank cells change nothing
  2. Carried at Legendary it has the approved numbers: 1.00 J on 0.25 g, 14 BBs/s, 0.30° spread, 0.06° kick, 50 BBs × 3, 1.1 s reload, 0.28 s draw, Semi (default) / Burst / Auto, on target to about 33 m out of the box and short of a tuned AEG at best
  3. Shots: each item is the Cyber Pistol on its own 0.25 % chance, always Legendary; the rest stay equally likely; a pool with no chase rows draws exactly as before; the ten-Shot guarantee holds
  4. It never exists below Legendary: Unlock all gear lends it at Legendary only, bots carry it at Legendary, as it comes is Legendary
  5. Customise shows Built-in battery and its own magazine and no part choices (Optic, Grip, Laser, Barrel, Muzzle greyed); hop-up and BB weight still turn
  6. On Hard, once the player owns it (or Unlock all gear is on), 5 % of matches (seeded) give one opponent the Cyber Pistol as their primary, on Auto, keeping their secondary; never on Easy or Normal, never for teammates
  7. Its shots, dry fire and magazine sound its own (quiet, electronic, no AEG motor), heard by bots as far as any replica; every replica a character carries has its sounds, even when the player doesn't carry it
  8. Its first-person model is its own chunky pistol in mint, hot pink and black, in the replicas' procedural style; the Armory shows it as a chase item with its odds
status: building
attempts: 0

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

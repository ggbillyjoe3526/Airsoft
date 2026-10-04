# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## FA11b · Session plan, result text, test wall time, kept map meshes and the smoke summary
tier: core
perf: required
touches: src/core/sessionPlan.ts, src/core/buildTiming.ts, src/ui/matchStopText.ts, src/matchFlow.ts, src/game.ts, src/main.ts, src/matchSession.ts, src/rangeSession.ts, src/render/renderer.ts, src/render/mapMeshCache.ts, src/ai/depotMatchSupport.ts, vite.config.ts, .github/workflows/check.yml, pipeline/
contract: none (`MatchSession.advance` / `draw` / `afterTick` unchanged; the sessions take their map meshes from `Renderer.mapMeshes`)
acceptance:
  1. CORE-05 (2): `nextSessionAction(flags)` in `core/sessionPlan.ts` decides what Play does; `Game.play` acts on it; `sessionPlan.test.ts` has a row for every reachable combination (36, checked against an enumeration) and the graphics-lost case
  2. CORE-05 (3): the result and pause screen text come from `ui/matchStopText.ts` through `MatchSession.resultView` / `pauseLine`; `Game.pause` only shows them (`matchStopText.test.ts`); part (1), `GameSettings`, is deferred with its reason in DECISIONS and a KNOWN_ISSUES row
  3. CORE-23: the table test above; the renderer-free `MatchSession` test is skipped with its reason (DECISIONS, KNOWN_ISSUES)
  4. CORE-15: the five long `depotMatch.*` files measured; the custom-match guard split by mode into two files (every seed and guard kept); `isolate: false`; projects `fast` and `slow` (`npx vitest run --project fast` for workers, the gate and CI run both); check.yml and pipeline/README carry the measured numbers
  5. CORE-33: `performance.measure` per match build phase and one `?perf` console line; the Renderer keeps the last map's meshes (`MapMeshCache`): the same map reuses them, freed on another map, a look that rebuilds them while released, a context swap and the renderer's dispose (`mapMeshCache.test.ts`, `buildTiming.test.ts`)
  6. The gate's smoke failure summary names each failing test's describe path, project and line and prints the error's locator / expectation / call-log lines (`pipeline/smokeReport.test.mjs`)
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

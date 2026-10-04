# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

The Esports plan (owner approved 2026-10-04; ROADMAP M36–M41, DECISIONS "M36–M41", the plan in the project's shared
files `research/esports-difficulty-2026-10-04.md`). Everything here is tagged dev with M35's content tag until the
owner says it's done. Any change to `src/ai/perception.ts` or BotWorld's sight is announced to the coordinator
first (M33 changes both).

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
touches: src/ai/, src/map/, src/config/bots.ts
acceptance:
  1. Headless Pro guards per playable map: Attack / Defend attackers 40–60 %, each end 40–60 % of decided Elimination rounds, under 1 round in 10 on time.
  2. Depot unchanged unless its Office lane puts attackers under 40 %; then a window or second door between two rooms, layout tests still passing.
  3. Woodland and the city are checked against the same guards once their navigation lands.
  4. Held angles (M37) also cover stair tops on layered floors and bush edges and tree gaps where a map has foliage, tested on the maps that have them.
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


## M33h · Weapon torch
tier: core
perf: required
touches: pool.md, stats.md, src/pool/, src/config/, src/sim/, src/input/, src/ai/perception.ts, src/ai/botBrain.ts, src/ai/botTorch.ts, src/map/nightSight.ts, src/map/torchLight.ts, src/render/, src/audio/, src/ui/, src/matchSession.ts, src/game.ts, src/newGamePicks.ts, src/save/, e2e/, docs/
contract: a fitted Weapon Torch (pool 000020, slot `light`, Access dev) is switched with the Weapon torch key (T); on a night preset it lights a cone the holder and bots see further in and gives the holder away; the day preset builds nothing for it; real lights per quality stay fixed (the spot takes one of `poolLights`).
acceptance:
  1. pool.md has a Lights table with 000020 Weapon Torch (Starter yes, In Shots no, Tiers Common, Access dev); existing saves get it; with Dev content off there is no Light slot, no torch in any match and Depot matches count and pay as today.
  2. T (rebindable) switches the fitted torch on and off with a click; it is off at spawn and when hit; bots on a night field with Dev content on carry it and switch it by state without strobing; seeded bot kits are unchanged.
  3. Bots see a target 40 m away when it stands in a lit beam, or when its own lit torch faces them; nothing changes on day maps or with the torch off.
  4. Night rendering: own torch is one real SpotLight on Medium and High (pools get one fewer point light, no shader rebuild on toggle); other torches and Low use cheap instanced cone, glare and hit spot; Woodland Low stays within 100 draw calls and 150k triangles; Depot by day is unchanged on every preset.
  5. The viewmodel is lit by the night preset (and by the torch when on); the torch is modelled on all three replicas in first and third person.
status: open
attempts: 0

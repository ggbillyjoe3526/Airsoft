# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## FA8 · Visual overhaul: figures, replicas, attachments, hands and effects
tier: core
perf: required
touches: src/config/render.ts, src/config/graphics.ts, src/config/characters.ts, src/config/replicaFinish.ts, src/render/figureFinish.ts, src/render/characterModels.ts, src/render/characterRenderer.ts, src/render/matchPresentation.ts, src/matchSession.ts, src/render/handModels.ts, src/render/replicaFinish.ts, src/render/replicaModels.ts, src/render/viewmodel.ts, src/render/combatPresentation.ts, src/render/bbRenderer.ts, src/render/impactGrit.ts
contract: QualitySettings and QUALITY (fields added additively, as FA2's contract line allows: figureDetail, replicaDetail, handDetail, bbGlow, impactGrit, laserBeam; a value on every preset, a Custom row each, a `graphics.<field>` store key each)
acceptance:
  1. Third-person figures and kit (row 17, Player detail): on `high` the figures get a shaped head, goggle rims with a glossy lens, a glossy helmet shell, gloves with a thumb, boots with soles, cuffs, pouch lids, edge highlights and baked occlusion, in one draw call a figure as before (gloss per vertex, one program); `low` builds exactly today's figure; under 2× Low's triangles; team tape is never shaded; the HIT! sign keeps its on-screen size past 6 m (figureDetail.test.ts, effectsDetail.test.ts); with M29b, a silencer on a figure's rifle shows in place of its flash hider on `high` (its front at the muzzle), rebuilt when parts change between rounds (figureDetail.test.ts)
  2. First-person replicas (Replica detail): on `high` the AEG and pistol take a moulded speckle (shared roughness and normal DataTextures), bevelled and edge-lit boxes, worn edges, real rail slots and the extra parts (selector, sights, serrations, grip panels); `low` draws today's triangles (AEG 10,844, pistol 7,944) and makes no texture; High is under 1.35× Low (replicaDetail.test.ts)
  3. Attachments: every part is drawn by name from one per-part builder table (`REPLICA_PART_TABLES`), magazines by kind (standard with a witness window, hi-cap with its wheel, low-cap steel), optics with glass, the laser with a glowing lens; a later part is one table entry (replicaDetail.test.ts); M29b's barrels (Long, Tight-Bore) and silencers (AEG, pistol) are table entries drawn on Low as M29b drew them and modelled on High, the muzzle mount on the fitted barrel's end and the BB exit point on the fitted device's front face at every detail level (replicaDetail.test.ts, viewmodel.test.ts)
  4. Hands (row 18, Hand detail): on `high` a knuckle pad, joint seams, a rubber strap and metal buckle and a sleeve fold; under 400 extra triangles a hand and under 2,800 in all (REN-10's budget kept); `low` unchanged (replicaDetail.test.ts)
  5. BB glow (row 19): a camera-facing additive glow at every BB in flight, one instanced draw sharing the puffs' program, its texture made only when first turned on; BBs shaded two-tone (effectsDetail.test.ts)
  6. Impact grit (row 20): a seeded few chips of the surface's tint thrown towards the shooter's side, falling and gone after their lifetime, and a faint ring puff; pooled, one draw each, nothing thrown or made while off (effectsDetail.test.ts)
  7. Laser beam (row 23): a fading line from the Red Laser's lens, off on every preset (config/render.test.ts, replicaDetail.test.ts)
  8. Low keeps today's cost: every FA8 field is `low`/off on Low (config/render.test.ts) and the measured draw calls, triangles and textures on Low are not above the base build's; Medium and High's change is recorded in DECISIONS
status: gates
attempts: 2

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

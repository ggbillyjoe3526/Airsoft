# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.
## M33g · Night sight for bots: in the dark they see less far, by the light the target stands in (an engine feature any night map has)
tier: core
perf: required
touches: src/map/nightSight.ts, src/map/mapTypes.ts, src/map/woodland.ts, src/config/bots.ts, src/ai/perception.ts, src/ai/botSenses.ts, src/ai/bot.ts, src/ai/botController.ts, src/ai/depotMatchSupport.ts, src/matchSession.ts, docs/
contract: MapData gains an optional `lights` (map light pools, map/nightSight.ts; additive, daylight maps have none); BotWorld and BotControllerOptions take `sight` (SightConditions: foliage plus the night field) in place of M33e's `foliage`; WorldQuery and the level ray are unchanged
acceptance:
  1. On any map with `night`, a bot makes someone out from at most 40 m in a light pool, 25 m in the open and 10 m under the trees (`NIGHT_SIGHT`, the target's spot decides), and never beyond `viewDistance`
  2. Ground counts as under the trees from the map's tree blocks alone (a grid built once when the match loads, nothing per tick); a map with no trees has no canopy
  3. Daylight maps (Depot, the range) see exactly as before
  4. Woodland lists its camp fires and fort lanterns as light pools; the renderer will draw them in M33f from the same data
  5. Bots still play full matches on Woodland; nothing new is allocated per tick
status: building
attempts: 1

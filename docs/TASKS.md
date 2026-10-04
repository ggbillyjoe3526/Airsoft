# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.
## M33e · Bushes: they hide you from sight, but BBs and people pass through (an engine feature any map can have)
tier: core
perf: required
touches: src/map/foliage.ts, src/map/mapTypes.ts, src/map/woodland.ts, src/config/bots.ts, src/config/render.ts, src/config/minimap.ts, src/ai/perception.ts, src/ai/botSenses.ts, src/ai/bot.ts, src/ai/botController.ts, src/ai/depotMatchSupport.ts, src/matchSession.ts, src/render/foliageMeshes.ts, src/render/mapMeshes.ts, src/render/matchPresentation.ts, src/ui/minimap.ts, docs/
contract: MapData gains an optional `foliage` (bushes, map/foliage.ts; additive, Depot and the range have none); BotWorld and BotControllerOptions gain an optional `foliage`; BotBehaviour gains `foliageSeeThrough`; WorldQuery and the level ray are unchanged (bushes are no surface)
acceptance:
  1. A bot can't see someone deeper than `foliageSeeThrough` in or behind a bush; it still sees someone at a bush's edge, beside it, or a head over a low bush; within `closeAwareness` a bush hides no one
  2. BBs, players and bots pass straight through bushes: no collider, no level-ray surface, the nav grid walkable under them
  3. Any map with `foliage` gets its bushes drawn (one mesh, casting and receiving shadows) and marked on the minimap; maps without (Depot, the range) are unchanged
  4. Woodland has at least 50 bushes, each standing on the ground inside the fence, off the lanes, out of every block and apart from the others
  5. Bots still play full matches on Woodland; Low keeps its draw call and triangle budgets
status: building
attempts: 1

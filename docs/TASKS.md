# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M33c · Sloping ground: a heightfield terrain under a map's blocks, for Woodland's slope, hill and creek
tier: core
perf: required
touches: src/map/terrain.ts, src/map/mapTypes.ts, src/config/sounds.ts, src/config/render.ts, src/config/ballistics.ts, src/config/materials.ts, src/config/minimap.ts, src/sim/levelRay.ts, src/physics/physicsWorld.ts, src/nav/navGrid.ts, src/render/terrainMeshes.ts, src/render/mapMeshes.ts, src/render/lighting.ts, src/render/matchPresentation.ts, src/render/combatPresentation.ts, src/audio/soundMaterials.ts, src/ui/minimap.ts, src/matchSession.ts, src/rangeSession.ts, docs/
contract: MapData gains an optional `terrain` (a heightfield, map/terrain.ts; additive, Depot and the range have none); the impact materials gain `earth` (a sound cue, a dust tint, no ricochet); LevelRay gains the terrain (internal to sim/levelRay.ts and physics)
acceptance:
  1. terrainHeightAt reads the same two triangles per cell that the mesh, the physics collider and the level ray use: a point on the ground is on all four
  2. A BB, a sight line or a shot ray stops on the ground (levelRay agrees with Rapier on a terrain map); ground hits are `earth`: no ricochet, the earth tick and dust
  3. Players and bots walk up and down slopes no steeper than a ramp; the nav grid's floor follows the ground
  4. The ground is drawn as one vertex-coloured mesh that receives shadows; the shadow camera and the minimap cover it (lighter where it is higher)
  5. Maps without terrain (Depot, the range) behave and draw exactly as before; Low keeps its draw call and triangle budgets
status: building
attempts: 1

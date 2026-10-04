# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M34b · Floors over floors: a layered nav grid and a two-storey test building
tier: core
perf: required
touches: src/nav/, src/ai/, src/map/testYard.ts, src/map/surfaces.ts, src/audio/soundMaterials.ts
acceptance:
  1. The nav grid holds one node per floor over a cell; Depot, Ramp Yard and Test Yard build the same grid as before (hash test).
  2. Every point query (`nodeAt`, `floorAt`, `isWalkableAt`, `nearestWalkable`, `clearLine`, `dropOnLine`) takes a height and answers for the floor at that height.
  3. Routes run between floors by stairs, and a drop blocks the floor it edges, not the floor under it.
  4. Stack House (two storeys, two stairs, balcony edges) as a fixture: seeded 3v3 bot matches climb, fight upstairs and walk off down the stairs, nobody falls off an edge.
  5. Depot's seeded match guards unchanged; no per-tick allocation added to route search.
  6. ARCHITECTURE, ROADMAP and DECISIONS describe the layered grid.
status: building
attempts: 1

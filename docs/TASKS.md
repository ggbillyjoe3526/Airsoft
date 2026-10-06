# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## G8 · Depot re-dressed
tier: core
perf: required
touches: src/render/, src/map/, src/config/dressing.ts, src/config/graphics.ts, docs/ARCHITECTURE.md, docs/KNOWN_ISSUES.md, docs/REVIEWS.md, docs/METRICS.md, docs/TASKS.md
contract: the map block format (MapData.dressing added, optional and look only); nothing else
acceptance:
  1. Set dressing read from map data (`MapData.dressing`) by engine code any map can use, and given to Depot: dirt banked at block feet, litter and loose junk against faces, puddles (their mesh flagged `userData.reflective`, wet and glossy without reflections), sparse seeded container logos, wall sprays and warning signs, small glow strips, a background skyline, chimney smoke, dust motes tinted for the map and dust kicked up by sprinting and landing feet. A map without `dressing` draws exactly as before.
  2. Nothing new collides, gives cover, blocks sight or hides a player: on Depot the physics colliders, the nav grid, the cover spots and bot sight are identical with and without the dressing. Every attached piece (signs, strips) stays inside its block's bounds plus the decal offset; every loose piece stands on a floor, is no taller than 0.3 m, sits against a face (within 0.5 m), never under a block, clear of every lane, spawn, dead zone, the flag and the Extraction spots, and never narrows a passage or doorway below 1.6 m (tested against Depot's lanes and spawns).
  3. Low draws exactly what it drew before: no new mesh, draw call, triangle, texture or shader. Medium and High: at most four more draw calls (junk and strips, puddles, smoke, kicked dust while it flies), at most 15 000 more triangles on Depot, the decal atlas 1024 × 1536 (from 1024 × 1024); each cost stated in the code.
  4. Smoke and kicked dust are pooled with fixed buffers and allocate nothing per frame; under Reduced motion the smoke stands still, no dust is kicked up and the motes stay hidden; every new geometry, material and texture is freed with the map or the match.
  5. Placement is deterministic: the same map and `dressing.seed` give the same dressing every time; another seed gives another.
status: building
attempts: 0

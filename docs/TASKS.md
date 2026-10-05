# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

The Extraction plan (owner approved 2026-10-04 20:51 and 20:54 UTC: every default except question 3, one automatic
respawn per run; the plan in the project's shared files `research/extraction-mode-2026-10-04.md`). Everything here is
tagged dev with M35's content tag until the owner says it's done. M33 owns the map framework (MapData gains only an
optional `extraction` block), the Pro thread owns held angles and team play (M37, M38): changes there go through the
coordinator.

## M34f · Neon Heights art (the city look)
tier: core
perf: required
touches: src/map/mapTypes.ts, src/map/neonHeights.ts, src/config/render.ts, src/config/materials.ts, src/render/mapMeshes.ts, src/render/proceduralTextures.ts, src/render/cityTextures.ts, src/render/cityProps.ts, src/render/mapSigns.ts, src/render/mapDecals.ts
acceptance:
  1. Engine features any map can use, driven by map data: a block's finish (painted plaster, metal cladding, tiles, asphalt, paving) and paint colour; city props (arcade cabinet, vending machine, stall, planter, booth, van) as honest boxes with their detail inside them; flat painted markings on floors (MapSign facing '+y', kind 'paint', never glowing); look-only decor blocks (MapData.decor) that play never reads. A map that uses none of them builds exactly as before (Depot and Woodland pinned).
  2. Neon Heights painted with them by Day and Night: pastel buildings in mint, magenta, cyan and amber on slate, an asphalt avenue with markings, paved yards and lanes, tiled rooms, city props in place of the site props, neon trim; by Night a city sky glow and fewer stars through its lighting overrides.
  3. Play is unchanged: every block's box, ricochet material and walkable floor are the same as before (pinned), so the Neon Heights balance and Pro guards hold; the city's own textures are drawn only when it loads.
  4. Low stays within 100 draw calls and 150k triangles on Neon Heights; screenshots by Day and Night, Low and Medium, for the owner.
status: critic
attempts: 3

## M48 · Extraction on Woodland and Neon Heights
tier: core
perf: required
touches: src/map/, src/ai/
acceptance:
  1. Each map's extraction block (insertions, exits, cases, regens, opponent starts), Woodland 15 min with 4 / 5 / 6 opponents, the city 10 min.
  2. The data tests and balance runs of M45 and M46 pass on each.
status: open
attempts: 0

## M49 · Supply weekends and dated events
tier: ui
perf: skip
touches: pool.md, src/pool/, src/config/, src/ui/
acceptance:
  1. A recurring Supply weekend (Friday to Sunday by the device clock) and a dated event table in data, each a case-odds modifier shown on the Mode pop-up.

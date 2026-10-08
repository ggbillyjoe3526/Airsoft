# src/map

Map data and map helpers. Maps are plain data (`mapTypes.ts`); one source builds the colliders, the nav grid and the
meshes. The format, coordinates and Extraction block are in `docs/ARCHITECTURE.md › Map data`.

- `maps.ts`: the list of maps (`MAPS`, `mapData(id)`, `loadDevMaps`). `devMaps.ts` holds the dev maps' data as a chunk
  of its own; a map that goes public moves its import to `maps.ts`.
- `depot.ts` (plan coordinates turned to world ones), `woodland.ts` (terrain, bushes, night), `neonHeights.ts` (city,
  storeys, signs), `range.ts` (the practice range, built from `config/range.ts`). Set dressing: `depotDressing.ts`.
- `woodlandExtraction.ts`, `neonHeightsExtraction.ts` and the shared `extractionBlock.ts`: each map's Extraction block.
  `playableMode.ts` falls back to Elimination where a mode's data is missing.
- `surfaces.ts` (walkable heights), `terrain.ts` (heightfield), `foliage.ts` (bushes: concealment, not cover),
  `groundSurfaces.ts` (ground patches that footsteps and the terrain read).
- `lightingChoice.ts` (the Day | Night pick, saved as `lighting.<map id>`), `nightSight.ts` and `torchLight.ts` (what
  bots make out in the dark), `bakes/` (baked light probe files, written by `node pipeline/bake-light.mjs`).
- Tuning: `config/materials.ts` (block materials), `config/range.ts`, `config/bake.ts`, `config/dressing.ts`.
- Tests: `mapData.test.ts` and one file per map; `bakes/bakes.test.ts` names the bake command when a probe file is
  stale. `testYard.ts` and `testSupport.ts` are test fixtures.
- Changing it: `MapData` fields are only added, and optional. A new map is registered in `maps.ts` (or `devMaps.ts`)
  with a content tag. `src/testSetup.ts` registers every map before each unit test file.

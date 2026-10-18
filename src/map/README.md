# src/map

Map data and map helpers. Maps are plain data (`mapTypes.ts`); one source builds the colliders, the nav grid and the
meshes. The format, coordinates and Extraction block are in `docs/ARCHITECTURE.md › Map data`.

- `maps.ts`: the list of maps (`MAPS`, `mapData(id)`, `loadDevMaps`). `devMaps.ts` holds the dev maps' data as a chunk
  of its own; a map that goes public moves its import to `maps.ts`.
- `depot.ts` (plan coordinates turned to world ones), `woodland.ts` (terrain, bushes, night), `neonHeights.ts` (city,
  storeys, signs), `range.ts` (the practice range, built from `config/range.ts`). Set dressing, one file per map, read
  only by `render/dressing/mapDressing.ts`: `depotDressing.ts`, `woodlandDressing.ts`, `neonHeightsDressing.ts`, and the range's
  `rangeDressing.ts` (M81: also its props and the wall kept clear round its distance boards). Each has one low wall
  built to be vaulted (M102, `config/vault.ts` `VAULT_WALL_HEIGHT`), checked by `vaultSpots.test.ts`.
  `ms1QA.test.ts` checks MS1's map detail: Woodland's cabin roof, lanterns, bush sizes and brighter night, and Neon
  Heights' signs.
- `woodlandExtraction.ts`, `neonHeightsExtraction.ts` and the shared `extractionBlock.ts`: each map's Extraction block.
  `playableMode.ts` falls back to Elimination where a mode's data is missing.
- `surfaces.ts` (walkable heights), `terrain.ts` (heightfield), `foliage.ts` (bushes: they hide you and stop BBs deep in, FO1;
  `firstLeaves` finds a BB's way through one, `leafSurface` where the leaves it knocks out show),
  `groundSurfaces.ts` (ground patches that footsteps and the terrain read; `groundGridOf` builds each map's grid once),
  `underfoot.ts` (`surfaceUnder`: the ground under a pair of feet, the one answer the audio plays and the simulation's
  `WorldQuery.surfaceUnder` gives the bots, NP1).
- `areas.ts` (CL1): `areaAt`, the named area at a spot (`MapData.areas`), for the bots' callouts and the minimap's label.
- Practice (M94): `practicePlaces.ts` (the range or a map, saved as `practicePlace`), `practiceSpots.ts` (where its
  targets stand on a map, from the map's lanes, starts and overlooks) and `practiceLayout.ts` (which of the range's kinds
  stands at each, and the timed challenge's START plate; tuning `config/practice.ts`).
- `lightingChoice.ts` (the Day | Night pick, saved as `lighting.<map id>`), `nightSight.ts` and `torchLight.ts` (what
  bots make out in the dark), `bakes/` (baked light probe files, written by `node pipeline/bake-light.mjs`, each loaded through
  `bakes/files.ts` in a chunk of its own).
- Tuning: `config/materials.ts` (block materials), `config/range.ts`, `config/practice.ts`, `config/bake.ts`,
  `config/dressing.ts`.
- Tests: one file per map; the rules every map keeps (on the floor, ramps, blocks, team colours, sightlines, walk
  times) are the content toolkit's map checks, `content/mapChecks.ts`; `bakes/bakes.test.ts` names the bake command when a probe file is
  stale. `testYard.ts` and `testSupport.ts` are test fixtures.
- Changing it: `MapData` fields are only added, and optional. A new map is registered in `maps.ts` (or `devMaps.ts`)
  with a content tag. `src/testSetup.ts` registers every map before each unit test file.

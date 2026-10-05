# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M52 · Night readability (Audit 2 REN PR 1: REN-02, REN-05, REN-08)
tier: core
perf: required
touches: src/config/render.ts, src/config/graphics.ts, src/render/lighting.ts, src/render/lighting.test.ts, src/render/nightSwatch.test.ts, src/render/lightingPreset.test.ts, src/map/neonHeightsArt.test.ts, docs/KNOWN_ISSUES.md, docs/DECISIONS.md
contract: none (`LightingPreset` shape unchanged). M52 changes the night presets' light data and Medium's night shadow fit; nightSight and lightPools are not changed.
acceptance:
  1. The night preset is candidate B (owner decision 5: hemi 0x3a4c78 / 0x2a2620 × 1, key 0xc8d4ff × 1, exposureScale 1.3) and the `LightingPreset` shape is unchanged.
  2. `render/nightSwatch.test.ts` passes, and fails with the old preset: earth reads (5,2,5), earth's red equals its blue, a skin reads 25; neon stays within 12 per channel and the team colours keep their hue by day and by night.
  3. Under a night preset Medium's shadow map follows the view on a field wider than the view window (owner decision 7): Woodland's texels go from 10.2 to 3.9 cm and move in whole texels; by day, and at night on Neon Heights and Depot (already finer), Medium keeps the whole field, and Low has no shadows (lighting.test.ts, nightReadability.test.ts).
  4. KNOWN_ISSUES row 21 names the lamp point-light cause and is kept per the owner (decision 6); rows 22, 34, 162 and 167 are closed.
status: gates
attempts: 1

# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file in its records
commit, before its pull request merges (CI's scope gate finds the block in the branch's history): its REVIEWS line, its
ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## G5 · Renderer and presets: Ultra, frame-rate choices and the post stack
tier: core
perf: required
touches: src/config/render.ts, src/config/render.test.ts, src/config/renderView.ts, src/config/renderQuality.ts, src/config/renderLighting.ts, src/config/renderSurfaces.ts, src/config/renderEffects.ts, src/config/graphics.ts, src/config/graphics.test.ts, src/config/post.ts, src/config/post.test.ts, src/render/renderer.ts, src/render/renderer.test.ts, src/render/post/, src/render/qualityStepDown.ts, src/render/qualityStepDown.test.ts, src/ui/menus/savedChoices.ts, src/ui/menus/savedChoices.test.ts, src/ui/graphicsSettings.ts, src/ui/graphicsSettings.test.ts, src/ui/menus/menus.test.ts, src/game.ts, pipeline/perf-run.mjs, pipeline/perf-budget.json, pipeline/baseline/, pipeline/README.md
contract: QualitySettings, QUALITY, QualityChoice (a new preset `ultra`; new fields added, none renamed); the settings store's `frameRateCap` (same key, one more value)
acceptance:
  1. `QUALITY.ultra` exists above High: 4096 shadow map at the softest radius, render scale 1 with `maxPixelRatio` 2, the most dust motes the buffer holds, 8 night pool lights, every post effect on at full quality. The picker, `?quality=ultra`, `QUALITY_FIELDS`, Custom and the blurbs include it; `TIER_QUALITY` never picks it.
  2. Every cost field rises or holds along Low ≤ Medium ≤ High ≤ Ultra (test).
  3. Frame-rate choices are 30, 60, 120, 144, 240 and Unlimited, saved under `frameRateCap` as before; Unlimited is the default; every value an older build saved reads back as itself, and any other number as the nearest choice (test).
  4. New `QualitySettings` fields `ambientOcclusion` (off, half, full resolution), `bloom`, `temporalAA`, `lightShafts`, `reflections`, `lensFinish`, each on every preset, with a Custom row (a sentence-case note and a cost) and a `graphics.<field>` key.
  5. The post chain per preset (a pure plan, tested): Low none (no composer, the frame drawn exactly as before), Medium bloom and output, High half-resolution AO, light shafts, TAA, bloom and output, Ultra full-resolution AO, reflections, light shafts, TAA, bloom, output and the lens finish (grain and edge fringe). WebGL2 only.
  6. TAA: a jittered projection, reprojection from depth and the previous view-projection, neighbourhood clamping, a light sharpen; the first-person replica is drawn after the post chain on the canvas, so it never smears.
  7. Reflections are drawn only on surfaces flagged reflective (the map's glass meshes, or any mesh with `userData.reflective`); with none in the scene the pass draws nothing and allocates nothing.
  8. Every post target and pass is disposed on a quality change, a lost context and the antialiasing context swap, made again after, and resized with the window and the render scale (tests with a stub renderer).
  9. `pipeline/perf-run.mjs --preset ultra` runs Ultra and `--preset all` includes it; a `desktop` env measures a real GPU without CPU throttling and `--viewport` sets the size; the container baselines for Medium, High and Ultra are recorded.
  10. `src/config/render.ts` is split by concern into files under about 600 lines (renderView, renderQuality, renderLighting, renderSurfaces, renderEffects) and re-exports every public name it had, so no importer changes; no change in behaviour (the lead's request, taken over from M78).
status: building
attempts: 0

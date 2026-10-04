# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file: its REVIEWS
line, its ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M27 · Walk-off route searches rationed to one per tick
tier: core
perf: required
touches: src/sim/elimination.ts, src/sim/elimination.test.ts, src/sim/character.ts, src/sim/simulation.ts, docs/KNOWN_ISSUES.md
contract: GameState (a field on Character is allowed), stepSimulation (its phase order is unchanged)
acceptance:
  1. A hit no longer runs the victim's walk-off route search inside the hit itself: the search happens in the elimination step over the following ticks, at most one route search per tick across all victims (two hits in one tick: one search that tick, one the next; a test counts the searches)
  2. A victim reaches its dead zone as before (the existing elimination and depot match tests pass unchanged); while its route is not found yet it stands calling, which the 1.4 s call already covers
  3. No new per-tick allocation: the route array and the pending flag live on the character and are reused
  4. The KNOWN_ISSUES row about the walk-off route search inside the tick is removed
status: done
attempts: 1

## M28 · Impact puffs start at half size
tier: trivial
perf: skip
touches: src/render/impactPuffs.ts, src/config/render.ts, docs/KNOWN_ISSUES.md
contract: none
acceptance:
  1. A puff's first drawn frame is at least 50 % of its full size (today about 28 %), so a close-range hit shows a puff at once
  2. The puff's full size and lifetime are unchanged (its tuning values stay in config)
  3. The KNOWN_ISSUES row about the first frame of a puff is removed
status: open
attempts: 0

## FA2 · Quality presets and the Custom graphics option
tier: core
perf: required
touches: src/config/render.ts, src/config/graphics.ts, src/settings/storage.ts, src/ui/menus/savedChoices.ts, src/ui/menus/settingsScreen.ts, src/ui/menus/menus.ts, src/ui/graphicsSettings.ts, src/ui/debugOverlay.ts, src/style.css, src/render/gpuCheck.ts, src/render/gpuTimer.ts, src/render/renderer.ts, src/render/proceduralTextures.ts, src/render/mapMeshes.ts, src/render/characterModels.ts, src/render/characterRenderer.ts, src/render/flagRenderer.ts, src/render/rangeTargetsRenderer.ts, src/render/matchPresentation.ts, src/render/combatPresentation.ts, src/render/qualityStepDown.ts, src/core/framePacer.ts, src/matchSession.ts, src/rangeSession.ts, src/game.ts, src/main.ts, docs/KNOWN_ISSUES.md
contract: QualitySettings and QUALITY (fields added: renderScale, antialias, figureShadows, textureSize, anisotropy, dustMotes; shadowMapSize widened; QualityChoice adds 'custom'), the settings store keys (additive: graphics.<field>, frameRateCap, showFps; a migration chain at version 1)
acceptance:
  1. REN-20, REN-01, REN-23, REN-13, REN-09: every preset sets every QualitySettings field; Low renders at 0.8 render scale with no MSAA, 256² textures, no anisotropy and no dust, and is never dearer than before on any row; Medium and High differ from the preset below on at least three rows visible on a DPR-1 screen; shadowRadius is documented and costed as free (config/render.test.ts)
  2. REN-07: figures, the flag cloth and the range targets receive shadows when `figureShadows` is on (Medium, High) and stop on Low, live (characterModels.test.ts)
  3. REN-16, CORE-25: a frame-rate cap (Off, 30, 60, 120, 144) skips draws by a due-time schedule that holds the cap on a 60, 120 or 144 Hz screen; the simulation still steps every frame (framePacer.test.ts)
  4. UI-06: Settings → Graphics shows Quality (Low, Medium, High, Custom), the frame-rate cap, Show FPS and one Custom row per QualitySettings field with its cost; changing a row turns the picker to Custom (or the preset it now equals) and applies at once; the rows come from one table (config/graphics.ts) so a later field is one entry (config/graphics.test.ts, e2e boot quality step)
  5. Settings store: the Custom rows save as `graphics.<field>`, read back validated (a stale or hand-edited value is dropped), and a migration chain walks old versions to the current one (settings/storage.test.ts)
  6. REN-03: the first start picks a preset from the GPU's renderer string (software Low, integrated or unknown Medium, discrete High; a table test of real strings); an automatic pick that stutters (over 5 % of frames past 20 ms in two windows running) steps down once, between rounds, with a HUD notice, and is never saved (gpuCheck.test.ts, qualityStepDown.test.ts)
  7. REN-04, REN-21, REN-24: changing antialiasing mid-session makes a new context on a new canvas (the old one disposed and its context forced lost); when that fails the row says it applies on the next load; the row says when the browser gave no multisampling, the filtering row when the card caps anisotropy
  8. REN-18: the GPU probe makes one context (the flagged one) when it is granted, two when refused (gpuCheck.test.ts counts them)
  9. REN-17: the debug overlay shows the quality in force, the frame split into simulation, draw and GPU time (EXT_disjoint_timer_query_webgl2, one query reused), and the antialiasing asked and given (gpuTimer.test.ts)
  10. Low's perf (draw calls, triangles, GPU memory) is no worse than its baseline; the KNOWN_ISSUES rows FA2 closes are reworded or removed
status: gates
attempts: 1

## FA3 · Render cost fixes and per-preset perf baselines
tier: core
perf: required
touches: src/config/render.ts, src/config/graphics.ts, src/render/atmosphere.ts, src/render/replicaSheen.ts, src/render/renderer.ts, src/render/combatPresentation.ts, src/render/impactPuffs.ts, src/render/bbRenderer.ts, src/render/handModels.ts, src/render/lighting.ts, src/render/mapMeshes.ts, src/render/dustMotes.ts, src/matchSession.ts, src/rangeSession.ts, src/game.ts, pipeline/perf-run.mjs, pipeline/gate.mjs, pipeline/perf-budget.json, pipeline/README.md, pipeline/baseline/, docs/KNOWN_ISSUES.md
contract: QualitySettings and QUALITY (one field added, shadowFollowsView, as the FA2 contract line allows: a value on every preset, a Custom row, a store key)
acceptance:
  1. REN-05: the sky dome draws after the opaque field (renderOrder above 0, depth-tested, no depth write), so only sky pixels shade it (atmosphere.test.ts)
  2. REN-06: the replica sheen lives on the Renderer, is prefiltered once per context and shared by every match, freed when the setting goes off (Low) and not remade while off, and dropped without freeing after a lost context (replicaSheen.test.ts)
  3. REN-14: the surface textures are drawn and uploaded in the title screen's idle time, one texture per idle moment, stopping if the set is dropped (renderer.test.ts)
  4. REN-22: the puff pools and the BB renderer upload nothing while nothing is in flight (impactPuffs.test.ts, bbRenderer.test.ts)
  5. REN-10: a gloved hand is under 2,500 triangles (was 7,012) (handModels.test.ts)
  6. REN-08: on High the sun's shadow map follows the view: a fixed square round the ground ahead, moved in whole texels, under 2 cm a texel at 2048² on Depot (2.9 cm for the whole field); the normal bias is a fixed share of the texel on every fit; Medium keeps the whole-field map (lighting.test.ts)
  7. REN-19: BB streaks are camera-facing quads of a fixed angular width at head and tail; the existing streak-path tests pass on the quads' centre lines (bbRenderer.test.ts, tracerLine.test.ts)
  8. REN-15: `perf-run.mjs --preset all` runs Low, Medium and High and records `baseline/container.json`, `container-medium.json`, `container-high.json`; `--env laptop` drops the SwiftShader flags and uses the installed Chrome in a window; the laptop run is documented in pipeline/README.md; a leftover server on the perf port is refused, not measured
  9. KNOWN_ISSUES rows 22 (dust cap scaled by the pixel ratio, dustMotes.test.ts), 89 (the dock and ramps cast shadows, mapMeshes.test.ts), 100 and 133 are struck or reworded
  10. The frozen-frame A/B against the base build (audit 3.3 method) shows no preset dearer and Low not dearer; draw calls and triangles within the budget on all three presets
status: gates
attempts: 1

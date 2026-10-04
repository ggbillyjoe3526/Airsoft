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

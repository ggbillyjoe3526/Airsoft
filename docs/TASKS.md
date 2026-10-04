# Tasks

Open tasks only, one block each (format in `pipeline/README.md`). A task that lands leaves this file: its REVIEWS
line, its ROADMAP row and the CHANGELOG line are the record. The planning thread writes blocks; the build thread
keeps `status` and `attempts` current.

## M30 · BB flight model from fluid dynamics: real drag, Magnus lift from the hop-up's spin, wind
tier: core
perf: required
touches: src/config/ballistics.ts, src/sim/air.ts, src/sim/ballistics.ts, src/sim/bbs.ts, src/sim/ricochet.ts, src/sim/hopUp.ts, src/sim/wind.ts, src/sim/state.ts, src/sim/simulation.ts, src/matchSession.ts, src/rangeSession.ts, src/ai/depotMatchSupport.ts, src/ai/botCombat.ts, src/render/bbRenderer.ts, src/render/dustMotes.ts, src/render/combatPresentation.ts, src/config/render.ts, src/config/tutorial.ts, src/config/replicas.ts, docs/KNOWN_ISSUES.md
contract: GameState (a `wind` field is allowed); stepSimulation (its phase order is unchanged; the wind is worked out just before BBs fly); M29 owns what leaves the muzzle (energy, velocity, BB mass) and reads none of this
acceptance:
  1. Drag is real sphere drag: ½·ρ·Cd·A·v² with Cd from the Reynolds number (a published sphere fit), ρ and μ from the air's temperature and pressure; no game scale on it (a test checks the table against the formula and the air against 1.204 kg/m³ and 1.81e-5 Pa·s)
  2. Hop-up lift is Magnus lift from a spinning BB: the dial sets the backspin, CL follows the spin ratio ω·r / v, the spin decays under the air's torque (faster on a lighter BB), and the axis follows the barrel so the lift is the same whichever way a shot is fired (tests)
  3. Wind: one breeze per match from its seed, 0.3–1.8 m/s from any direction with gentle gusts, level; BBs feel drag and lift against the air, so a crosswind drifts them downwind more and more with distance (tests: a few cm at 10 m, a torso's width at 34 m in 1.5 m/s); players never feel it; the practice range has one too
  4. The factory dials keep their reach within a couple of metres (rifle ~38 m on target, pistol ~26 m), the BB-weight trade-off still holds, and the Loadout's readouts (hopUpReach, flightTime) fly the same model in still air
  5. One flight step a tick with a second-order integrator: within 1 cm of a 100-substep flight at 50 m; the per-BB step costs no more than before (benchmark in the PR) and allocates nothing
  6. Bots lead targets with the BB's flight time under drag (flightTimeEstimate, within 5% of the full model), not distance / muzzle speed; the KNOWN_ISSUES row about under-leading is removed; bots don't allow for wind; the headless match guards stay green
  7. The dust in the air drifts with the wind, so it can be read; nothing on the HUD
status: done

## M29a · Weapon performance data: stats.md, tier scaling, the Performance sheet
tier: core
perf: required
touches: stats.md, pool.md, src/config/statsFile.ts, src/config/gameStats.ts, src/config/replicas.ts, src/config/attachments.ts, src/config/optics.ts, src/config/lasers.ts, src/config/menus.ts, src/pool/pool.ts, src/pool/kit.ts, src/pool/loadoutModel.ts, src/ui/performanceSheet.ts, src/ui/menus/loadoutScreen.ts, src/ui/menus/armoryScreen.ts, src/style.css, docs/
contract: pool.md's format (Power % moves to stats.md); a new contract, stats.md's format
acceptance:
  1. Every performance number of the two replicas, the power sources, optics, grips, lasers and magazines is read from `stats.md` at the repository's root (a guide at its top, tables by Key or pool ID); the game's numbers as shipped are unchanged, and a cell it can't read keeps the built-in number with its line in `errors` (a test fails on any)
  2. A higher tier improves what stats.md's Tier scaling says: a Legendary replica has 15 % less spread, reload and draw and 7.5 % more energy and rate of fire; a battery's tier its rate of fire, a gas's its energy; parts as before
  3. A battery sets the rate of fire only (Standard 0 %, the new 11.1 V LiPo Battery 000015 +15 %, from Shots); Red and Black Gas add 10 % and 20 % energy and the same to the recoil
  4. A replica's energy stops at its class's site limit (rifle 1.20 J, pistol 1.00 J), and the sheet says "site limit" when it does
  5. The Customise screen shows a Performance sheet (energy, muzzle speed in m/s and fps on 0.20 g, BB weight, rate of fire, on-target range, time to 20 m, spread, recoil, magazines, reload, draw, aim raise), each change against the replica as it comes marked better or worse; it follows the BB weight and hop-up sliders
  6. Each gear slot shows "energy · rate of fire · magazine"; the Armory shows what each copy's tier adds (dispensed tiles and the collection list)
  7. Bots carry each replica as it comes: the headless match guards pass unchanged
status: accepted
attempts: 1

## FA2 · Quality presets and the Custom graphics option
tier: core
perf: required
touches: src/config/render.ts, src/config/graphics.ts, src/settings/storage.ts, src/ui/menus/savedChoices.ts, src/ui/menus/settingsScreen.ts, src/ui/menus/menus.ts, src/ui/graphicsSettings.ts, src/ui/debugOverlay.ts, src/style.css, src/render/gpuCheck.ts, src/render/gpuTimer.ts, src/render/renderer.ts, src/render/proceduralTextures.ts, src/render/mapMeshes.ts, src/render/characterModels.ts, src/render/characterRenderer.ts, src/render/flagRenderer.ts, src/render/rangeTargetsRenderer.ts, src/render/matchPresentation.ts, src/render/combatPresentation.ts, src/render/qualityStepDown.ts, src/core/framePacer.ts, src/matchSession.ts, src/rangeSession.ts, src/game.ts, src/main.ts, docs/KNOWN_ISSUES.md
contract: QualitySettings and QUALITY (fields added: renderScale, antialias, figureShadows, textureSize, anisotropy, dustMotes; shadowMapSize widened; QualityChoice adds 'custom'), the settings store keys (additive: graphics.<field>, frameRateCap, showFps; read through FA5's one `migrate` path as version-1 additions)
acceptance:
  1. REN-20, REN-01, REN-23, REN-13, REN-09: every preset sets every QualitySettings field; Low renders at 0.8 render scale with no MSAA, 256² textures, no anisotropy and no dust, and is never dearer than before on any row; Medium and High differ from the preset below on at least three rows visible on a DPR-1 screen; shadowRadius is documented and costed as free (config/render.test.ts)
  2. REN-07: figures, the flag cloth and the range targets receive shadows when `figureShadows` is on (Medium, High) and stop on Low, live (characterModels.test.ts)
  3. REN-16, CORE-25: a frame-rate cap (Off, 30, 60, 120, 144) skips draws by a due-time schedule that holds the cap on a 60, 120 or 144 Hz screen; the simulation still steps every frame (framePacer.test.ts)
  4. UI-06: Settings → Graphics shows Quality (Low, Medium, High, Custom), the frame-rate cap, Show FPS and one Custom row per QualitySettings field with its cost; changing a row turns the picker to Custom (or the preset it now equals) and applies at once; the rows come from one table (config/graphics.ts) so a later field is one entry (config/graphics.test.ts, e2e boot quality step)
  5. Settings store: the Custom rows save as `graphics.<field>`, read back validated (a stale or hand-edited value is dropped), and they go through the store's one `migrate` path (FA5's), dropped with a newer build's object (settings/storage.test.ts)
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
touches: src/config/render.ts, src/config/graphics.ts, src/settings/storage.ts, src/ui/menus/savedChoices.ts, src/ui/menus/settingsScreen.ts, src/ui/menus/menus.ts, src/ui/graphicsSettings.ts, src/ui/debugOverlay.ts, src/style.css, src/render/gpuCheck.ts, src/render/gpuTimer.ts, src/render/renderer.ts, src/render/proceduralTextures.ts, src/render/mapMeshes.ts, src/render/characterModels.ts, src/render/characterRenderer.ts, src/render/flagRenderer.ts, src/render/rangeTargetsRenderer.ts, src/render/matchPresentation.ts, src/render/combatPresentation.ts, src/render/qualityStepDown.ts, src/core/framePacer.ts, src/matchSession.ts, src/rangeSession.ts, src/game.ts, src/main.ts, src/render/atmosphere.ts, src/render/replicaSheen.ts, src/render/impactPuffs.ts, src/render/bbRenderer.ts, src/render/handModels.ts, src/render/lighting.ts, src/render/dustMotes.ts, pipeline/perf-run.mjs, pipeline/gate.mjs, pipeline/perf-budget.json, pipeline/README.md, pipeline/baseline/, docs/KNOWN_ISSUES.md
note: touches is the union of FA2's and FA3's files: both land on fa-wip-b, so the scope check runs against origin/main over the two tasks' diff together (FA3's own files: atmosphere, replicaSheen, impactPuffs, bbRenderer, handModels, lighting, dustMotes and the pipeline/ entries)
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
  10. Low is not dearer: the frozen-frame A/B against the base build (audit 3.3 method) and the perf run show Low's frame, triangles and texture memory down and its draw calls unchanged; Medium and High stay within their draw-call and triangle budgets with fewer triangles than the base (High's extra software cost is FA2's 1024² textures, by design)
status: gates
attempts: 1

## FA8 · Visual overhaul: figures, replicas, attachments, hands and effects
tier: core
perf: required
touches: src/config/render.ts, src/config/graphics.ts, src/config/characters.ts, src/config/replicaFinish.ts, src/render/figureFinish.ts, src/render/characterModels.ts, src/render/characterRenderer.ts, src/render/matchPresentation.ts, src/matchSession.ts, src/render/handModels.ts, src/render/replicaFinish.ts, src/render/replicaModels.ts, src/render/viewmodel.ts, src/render/combatPresentation.ts, src/render/bbRenderer.ts, src/render/impactGrit.ts
note: fa-wip-g is built on FA2/FA3's branch (fa-wip-b); until that merges, the scope check against origin/main also lists FA2/FA3's own files (their block's touches), none of them changed by FA8
contract: QualitySettings and QUALITY (fields added additively, as FA2's contract line allows: figureDetail, replicaDetail, handDetail, bbGlow, impactGrit, laserBeam; a value on every preset, a Custom row each, a `graphics.<field>` store key each)
acceptance:
  1. Third-person figures and kit (row 17, Player detail): on `high` the figures get a shaped head, goggle rims with a glossy lens, a glossy helmet shell, gloves with a thumb, boots with soles, cuffs, pouch lids, edge highlights and baked occlusion, in one draw call a figure as before (gloss per vertex, one program); `low` builds exactly today's figure; under 2× Low's triangles; team tape is never shaded; the HIT! sign keeps its on-screen size past 6 m (figureDetail.test.ts, effectsDetail.test.ts)
  2. First-person replicas (Replica detail): on `high` the AEG and pistol take a moulded speckle (shared roughness and normal DataTextures), bevelled and edge-lit boxes, worn edges, real rail slots and the extra parts (selector, sights, serrations, grip panels); `low` draws today's triangles (AEG 10,844, pistol 7,944) and makes no texture; High is under 1.35× Low (replicaDetail.test.ts)
  3. Attachments: every part is drawn by name from one per-part builder table (`REPLICA_PART_TABLES`), magazines by kind (standard with a witness window, hi-cap with its wheel, low-cap steel), optics with glass, the laser with a glowing lens; a later part is one table entry (replicaDetail.test.ts)
  4. Hands (row 18, Hand detail): on `high` a knuckle pad, joint seams, a rubber strap and metal buckle and a sleeve fold; under 400 extra triangles a hand and under 2,800 in all (REN-10's budget kept); `low` unchanged (replicaDetail.test.ts)
  5. BB glow (row 19): a camera-facing additive glow at every BB in flight, one instanced draw sharing the puffs' program, its texture made only when first turned on; BBs shaded two-tone (effectsDetail.test.ts)
  6. Impact grit (row 20): a seeded few chips of the surface's tint thrown towards the shooter's side, falling and gone after their lifetime, and a faint ring puff; pooled, one draw each, nothing thrown or made while off (effectsDetail.test.ts)
  7. Laser beam (row 23): a fading line from the Red Laser's lens, off on every preset (config/render.test.ts, replicaDetail.test.ts)
  8. Low keeps today's cost: every FA8 field is `low`/off on Low (config/render.test.ts) and the measured draw calls, triangles and textures on Low are not above the base build's; Medium and High's change is recorded in DECISIONS
status: gates
attempts: 1

# Opus 5.5 implementation handoff — Airsoft FPS audit (2026-10-02)

This file is standalone. It gives Opus everything needed to implement the audit's recommendations without reading `AUDIT_REPORT.md`, though that report has the evidence behind each change.

## 1. Context

- **Project**: a browser first-person airsoft shooter, single player versus bots. TypeScript strict, Three.js r0.186, Rapier `@dimforge/rapier3d-compat` 0.21, Vite 8, Vitest 5. Desktop Chrome/Firefox/Edge only. No multiplayer, ever (owner decision). Static hosting, `base: './'`.
- **Audited commit**: `ae0b87d` on `main`, 2026-10-02. All checks pass: `npm run typecheck`, `npm test` (37 files, 294 tests), `npm run build` (rapier chunk 4.33 MB, three 589 kB, index 149 kB; budgets enforced by `vite.config.ts`).
- **Architecture in one line**: `src/game.ts` composes input → `PlayerCommand` map → `stepSimulation` (60 Hz fixed step over plain data in `src/sim`) → events → presentation (`src/render`, `src/audio`, `src/ui`). Bots (`src/ai`) write the same commands. Physics is Rapier kinematic controllers on trimesh level colliders (`src/physics/physicsWorld.ts`). Bot navigation is a 2D grid + A* (`src/nav/navGrid.ts`). Randomness is seeded (`src/sim/rng.ts`, `?seed=`).
- **Where the project is going**: Phase 3 M11 "Depot rework to the field checklist" is next (`docs/HANDOFF.md`), then Phase 4 (art, VFX, menus, settings screen, onboarding), then beta.
- **Project rules that bind you** (`CLAUDE.md`): fixed technical decisions are not to be changed (Three.js, Rapier compat, Vite, Vitest, Pointer Lock, TypeScript strict); no new dependency without a stated reason; every substantial change goes through the critic agent (`.claude/agents/critic.md`) and gets a line in `docs/REVIEWS.md`; decisions go in `docs/DECISIONS.md` with a date and reason; never create or move git tags; work is pushed to `main` during the v0.1 cycle; one milestone per session; rewrite `docs/HANDOFF.md` at session end.
- **Audit verdict in one line**: the simulation and AI are solid and fast (≈0.1 ms per tick for a 3v3, flat heap over 30 simulated minutes); the risks are an unwritten flat-floor assumption right before the map rework, no automated check of the browser shell, and an unmeasured GPU budget.

## 1a. Owner answers (2026-10-02, after the audit) and the defaults taken

| Question | William's answer | Default applied in this handoff |
|---|---|---|
| Elevation | "Maps may have elevations but aren't present yet; may appear in the Depot rework. Propose these changes for the rework." | C-01 branch (b) is in scope. Its full spec is **C-05** below; do C-05 before the Depot layout work. |
| Reference machine | Playtests on a desktop: RTX 5090, 9950X3D, 64 GB. No laptop. | The 60 FPS-on-iGPU target in `CLAUDE.md` §6 cannot be checked on the owner's machine. C-04 stays (presets + overlay numbers) so a weaker machine has a way down; note in `docs/DECISIONS.md` that the iGPU target is unverified and not blocking until someone with an iGPU laptop measures it. |
| Rapier compat (base64) | Doesn't know the term. | Leave as is (D-01). Plain meaning for the record: the physics engine is packed inside a text file, which makes the download ~1.2 MB bigger than it has to be; it is within budget and a fixed decision. |
| Licence | Doesn't know. | Leave undeclared (D-03). Plain meaning: without a licence file nobody else may legally reuse the code, which is fine for a private project. Revisit only if the repo is made public on purpose. |
| `?nolock` in test builds | Doesn't know. | Take C-02 step 2 as written: the switch exists only when building with `VITE_ALLOW_NOLOCK=1`, which only the smoke test does. Normal builds are unchanged. |
| Fast/slow test split | Doesn't know. | Do W-06 when convenient; `npm run check` (the critic's command) keeps running everything, so the critic gate is unchanged. |

## 2. Rules for Opus

1. One change ID per commit. Commit message starts with the ID, e.g. `C-02: browser smoke test`.
2. After every change: `npm run typecheck`, `npm test`, `npm run build`. All three must pass before the commit.
3. Do not touch the systems listed under "Preserve" (§7) except where a change spec names them.
4. If the code you find contradicts a spec here (a file moved, a symbol renamed, a behaviour already changed), stop that change, note the discrepancy in the commit or in `docs/HANDOFF.md`, and move on to the next change. Do not improvise a different fix.
5. No new runtime dependency. Dev dependencies only where a spec names one (`@playwright/test` in C-02).
6. Keep diffs minimal: the spec's files, plus the docs the project's rules require (`DECISIONS.md`, `KNOWN_ISSUES.md`, `HANDOFF.md`, `README.md` for new scripts).
7. Run the critic for C-01, C-02, C-04 and each C-05 commit. C-03 is a config file and can skip it.

## 3. Master execution order

| Phase | Changes | Notes |
|---|---|---|
| 1. Critical stabilisation | C-01 (record the decision + spread debounce), then C-05 (elevation support) | Decision is taken (§1a). C-05 lands before any Depot layout change, with its own test map, so the rework starts on a nav layer that understands height. |
| 2. Performance (instrument, don't optimise) | C-04 | Gives the owner numbers; no rendering behaviour changes by default. |
| 3. Architecture and debt | C-02, C-03 | Browser smoke test, then CI that runs it. |
| 4. Future-proofing | W-01 … W-07 (when touched) | Do each only inside the milestone that already edits that file. |
| 5. Optional | D-xx list | Owner's call. |

Dependencies: C-05 depends on C-01 step 2 (the debounce) and must precede the Depot layout rework. C-03 depends on C-02 (the workflow runs the smoke script). C-04's quality presets need no UI; Phase 4's settings screen will consume them later. C-01's debounce is independent of the decision outcome.

## 4. Full change specs (Fix Now / Fix Soon)

### C-01 — Elevation policy before the Depot rework, plus an in-air spread debounce

- **Objective**: Make the flat-floor assumption explicit before M11 touches Depot, and remove the one cliff that a single lost ground contact creates.
- **Current problem and evidence**: Six places assume the floor is the y = 0 plane: `src/nav/navGrid.ts:33–79` builds a 2D grid from block top heights only and `findPath` (`:170–186`) writes `goal.y` into every waypoint; `src/ai/cover.ts:30–52` classifies cover by block top relative to a flat floor and `:204–208` builds eye points as `from.y + eyeHeight`; `src/map/depot.ts:224` puts flags and lane points at y = 0; `src/sim/elimination.ts:48` plans walk-offs on the same grid; `src/sim/accuracy.ts:11–14` multiplies spread by `cfg.accuracy.air` (×4.5) the moment `c.grounded` is false; `src/ai/depotMatch.test.ts` guards that nobody in play ever leaves the ground. `docs/KNOWN_ISSUES.md` already says "if the guard fails after the M11 Depot rework, debounce the air multiplier". `docs/IDEAS.md`/`HANDOFF.md` mention ramps, stairs and vaulting.
- **Root cause**: The first map is flat and the nav layer was correctly scoped to it; the scope of v0.1 maps was never written down.
- **Proposed implementation**:
  1. Ask the owner (question is in `AUDIT_REPORT.md` §10 Q1). Record the answer in `docs/DECISIONS.md` dated, as one of:
     - (a) "v0.1 maps are flat: floor at y = 0, ledges ≤ 0.15 m or ≥ full cover height." Then no nav work is needed. Add the same sentence to the Depot header comment in `src/map/depot.ts`.
     - (b) "Elevation is in scope." Then, as a separate milestone before M11, extend `NavGrid` with a per-cell `floorY: Float32Array`, computed in `buildNavGrid` as the highest block top under the cell that a capsule can stand on; make neighbours walkable only when `|floorY[a] − floorY[b]| ≤ cfg.maxStep` (new config, default the Rapier autostep height from `src/config/physics.ts`); make `findPath` emit `floorY` of the cell for `y`; update `cover.ts` eye heights to use the cell floor under `from`; add a ramp fixture to `src/nav/navGrid.test.ts`. This is the larger branch and should be its own spec once the owner says yes; do not start it on the strength of this document alone.
  2. Independently of (a)/(b), debounce the air multiplier: add `airSpreadDelay: number` (seconds, default 0.1 = 6 ticks) to `MovementConfig.accuracy` in `src/config/movement.ts`; add `airTime: number` to `Character` in `src/sim/character.ts` (reset to 0 in `createCharacter` and `respawnCharacter`); in `src/sim/accuracy.ts` `stepAccuracy`, advance `c.airTime += dt` while `!c.grounded` else reset to 0, and in `targetSpreadScale` use `a.air` only when `c.airTime >= cfg.accuracy.airSpreadDelay` **or** the character jumped this tick (movement sets `c.grounded = false` on a jump at `src/sim/movement.ts:99–101`; set `c.airTime = cfg.accuracy.airSpreadDelay` there so a deliberate jump is penalised at once).
- **Affected files**: `docs/DECISIONS.md`, `src/map/depot.ts` (comment), `src/config/movement.ts`, `src/sim/character.ts`, `src/sim/accuracy.ts`, `src/sim/movement.ts`, `src/sim/accuracy.test.ts`, `docs/KNOWN_ISSUES.md` (remove the "one-tick loss of ground contact" row).
- **Dependencies**: none.
- **Migration notes**: `Character` gains a field; `createCharacter` is the only constructor (`src/sim/character.ts`), tests that build characters go through it.
- **Risks**: Bots fire while briefly airborne without the penalty for up to 0.1 s; immaterial. A deliberate jump keeps the immediate penalty.
- **Test plan**: In `src/sim/accuracy.test.ts`: (1) one tick ungrounded → spread unchanged; (2) `airSpreadDelay` seconds ungrounded → `a.air`; (3) jump this tick → `a.air` at once; (4) grounded again → `airTime` is 0. Existing `depotMatch.test.ts` ground guard stays as is under (a).
- **Acceptance criteria**: decision recorded; tests above pass; `npm run check` green; KNOWN_ISSUES row removed.
- **Priority**: Fix Now. **Confidence**: Confirmed (code), the debounce is Likely to matter only under (b).

### C-02 — Headless browser smoke test of the production build

- **Objective**: Catch a broken boot, start screen, HUD or renderer automatically, before Phase 4 makes presentation the main work.
- **Current problem and evidence**: `src/game.ts` (391 lines) has no tests; `src/render` has 465 test lines for 2569 source lines (maths helpers only); `src/ui` 115 for 1016; `src/audio` 11 for 407; `src/input/pointerLock.ts` none. No Playwright or similar dependency. The audit ran a Playwright script against `vite preview` with `/?nolock&seed=1`: boot in 923 ms, zero page errors, HUD readable after play, so the harness is known to work. `?nolock` is currently dev-only: `src/main.ts:14` `allowUnlocked: import.meta.env.DEV && params.has('nolock')`.
- **Root cause**: Tests were aimed at gameplay rules through Phase 1–3, which was right.
- **Proposed implementation**:
  1. Add dev dependency `@playwright/test` (reason for the change summary: "browser smoke test of the built game; Chromium only"). Add `playwright.config.ts` at the root with `testDir: 'e2e'`, Chromium project only, `webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true }`, args `['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']` so it runs on CI without a GPU.
  2. Make unlocked play available to the built app behind an explicit env: in `src/main.ts` change the condition to `(import.meta.env.DEV || import.meta.env.VITE_ALLOW_NOLOCK === '1') && params.has('nolock')`. Document in `README.md` that `VITE_ALLOW_NOLOCK=1 npm run build` is for tests only. (If the owner answers §10 Q5 with "dev server instead", point `webServer` at `npm run dev -- --port 4173` and skip this step.)
  3. `e2e/boot.spec.ts`: open `/?nolock&seed=1`; collect `pageerror` and `console` `error` messages; expect `.start-play` visible within 30 s and `#loading` gone; expect the start screen's goal text non-empty; click `.start-play`; wait 3 s; expect the HUD to contain a digit ammo count (`.hud` or the ammo element; read `document.body.innerText` and match `/AEG RIFLE\s+\d+/`); hold mouse button 1 s, press `r`; wait 2 s; expect zero collected errors; attach one screenshot.
  4. Scripts: `"test:browser": "playwright test"`, and `"check:all": "npm run check && npm run test:browser"`. Leave `check` unchanged so the critic's loop is not slowed.
- **Affected files**: `package.json`, `package-lock.json`, `playwright.config.ts`, `e2e/boot.spec.ts`, `src/main.ts`, `README.md`, `.gitignore` (add `playwright-report/`, `test-results/`).
- **Dependencies**: none. C-03 depends on this.
- **Migration notes**: Playwright needs `npx playwright install chromium` once per machine; say so in README. Do not add it to `postinstall`.
- **Risks**: SwiftShader is slow (≈4 fps); keep waits generous and assert on DOM text, never on frame counts. Pointer lock is never requested on the nolock path, so the real lock flow stays manual-test only; say so in the spec's header comment.
- **Test plan**: run `npm run test:browser` locally; then temporarily break `src/main.ts` (throw before `Game.create`) and confirm the spec fails on "Failed to start"; revert.
- **Acceptance criteria**: spec green on the built app; `npm run check` unchanged in behaviour and time; README documents the two commands.
- **Priority**: Fix Soon. **Confidence**: Confirmed.

### C-03 — CI workflow running the project's own checks

- **Objective**: Run `npm run check` (and the smoke test) on every push to `main` and on pull requests.
- **Current problem and evidence**: no `.github/` directory; `package.json:15` has `check` but nothing invokes it outside a session.
- **Root cause**: solo project, no PR flow yet.
- **Proposed implementation**: `.github/workflows/check.yml`: trigger on `push` to `main` and `pull_request`; `ubuntu-latest`; `actions/checkout@v4`; `actions/setup-node@v4` with `node-version: 22` and `cache: npm`; `npm ci`; `npm run check`; then (after C-02) `npx playwright install --with-deps chromium` and `VITE_ALLOW_NOLOCK=1 npm run build && npm run test:browser`; upload `test-results/` as an artifact on failure. Concurrency group per ref with cancel-in-progress.
- **Affected files**: `.github/workflows/check.yml`, `README.md` (one line).
- **Dependencies**: C-02 for the browser step; the `check` step can ship first.
- **Migration notes**: none; does not change the push-to-main policy.
- **Risks**: Vitest's match soaks take ~45 s locally; CI runners are slower, so set the job timeout to 20 minutes.
- **Test plan**: the workflow is green on the commit that adds it.
- **Acceptance criteria**: green run visible on GitHub Actions for `main`.
- **Priority**: Fix Soon. **Confidence**: Confirmed.

### C-04 — Render instrumentation and quality presets (no default behaviour change)

- **Objective**: Give the owner a way to measure the frame on an integrated GPU and A/B the expensive render settings, before the Phase 4 art pass adds cost and before the settings screen exists.
- **Current problem and evidence**: `src/render/renderer.ts:22–27` uses MSAA, DPR cap 1.5, ACES, PCF shadows; `src/config/render.ts:13–18` fixes `maxPixelRatio: 1.5`, `shadows: true`, `shadowMapSize: 2048`; `src/render/lighting.ts:58` sets the 2048² map and leaves `shadow.autoUpdate` at its default (shadow pass every frame); `src/render/viewmodel.ts` is a second render pass. The debug overlay (`src/ui/debugOverlay.ts`, provider in `src/game.ts:153–160`) shows FPS, frame ms, ticks/s, seed and counts but nothing from `renderer.info`. `CLAUDE.md` §6 requires 60 FPS on an iGPU; no measurement is recorded anywhere.
- **Root cause**: no instrument, no knob.
- **Proposed implementation**:
  1. In `src/config/render.ts` add
     ```ts
     export type QualityPreset = 'low' | 'medium' | 'high';
     export const QUALITY: Record<QualityPreset, { maxPixelRatio: number; antialias: boolean; shadows: boolean; shadowMapSize: 1024 | 2048 }> = {
       low:    { maxPixelRatio: 1,   antialias: false, shadows: false, shadowMapSize: 1024 },
       medium: { maxPixelRatio: 1,   antialias: true,  shadows: true,  shadowMapSize: 1024 },
       high:   { maxPixelRatio: 1.5, antialias: true,  shadows: true,  shadowMapSize: 2048 },
     };
     export const DEFAULT_QUALITY: QualityPreset = 'high';
     ```
     and remove `maxPixelRatio`, `antialias`, `shadows`, `shadowMapSize` from `RENDER` (so there is one source of truth). `high` equals today's values, so the default render is unchanged.
  2. `Renderer` constructor takes the preset (`new Renderer(container, quality)`), applies `antialias`, `setPixelRatio`, `shadowMap.enabled`; `addLighting` in `lighting.ts` takes `shadowMapSize`. `Game.create`'s options gain `quality?: QualityPreset`; `src/main.ts` reads `?quality=low|medium|high` (dev and prod; it is harmless) and falls back to `DEFAULT_QUALITY`.
  3. Debug overlay provider in `game.ts` adds `draw calls: renderer.info.render.calls`, `triangles: renderer.info.render.triangles`, `programs: renderer.info.programs?.length`, `geometries/textures: renderer.info.memory.geometries / .textures`, and `quality: <preset>`. Note `renderer.info` is reset per `render()` call and the view model renders second; read it after the main pass or set `renderer.info.autoReset = false` and reset it yourself at frame start (prefer the latter so both passes are counted).
  4. Also apply F-06 here since `renderer.ts` is being edited: in `Renderer.resize` (`:65–71`) call `setPixelRatio(Math.min(window.devicePixelRatio, preset.maxPixelRatio))` before `setSize`.
  5. Record in `docs/DECISIONS.md` that presets exist, the default is `high`, and the settings screen (Phase 4) will expose them; ask the owner to record FPS per preset on their iGPU laptop in the same entry.
- **Affected files**: `src/config/render.ts`, `src/render/renderer.ts`, `src/render/lighting.ts`, `src/game.ts`, `src/main.ts`, `src/ui/debugOverlay.ts` (only if the provider type needs widening), `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` (one line).
- **Dependencies**: none.
- **Migration notes**: `RENDER.antialias` etc. are referenced only in `renderer.ts` and `lighting.ts` (grep before removing).
- **Risks**: Changing `antialias` requires a new `WebGLRenderer`, so the preset is boot-time only; fine, the settings screen can reload or re-create later. Shadow map size changes need `light.shadow.map?.dispose(); light.shadow.map = null` if ever changed at runtime; not needed now.
- **Test plan**: `npm run check`; in the browser `?quality=low` shows `shadows` off and DPR 1 on the overlay; `?quality=high` shows today's numbers; a unit test that `QUALITY.high` equals the former `RENDER` values (pin the numbers).
- **Acceptance criteria**: default visuals unchanged (screenshot compare by eye at `?seed=1`), overlay shows draw calls and preset, F-06 fixed, decision recorded.
- **Priority**: Fix Soon. **Confidence**: Likely that this is where the frame budget goes; Confirmed that there is no instrument today.

### C-05 — Elevation support for the Depot rework (ramps and raised floors)

- **Objective**: Let the Depot rework use ramps and raised floor areas without breaking bot routes, walk-offs, cover search or the accuracy rules, at the smallest change that keeps the current grid design.
- **Current problem and evidence**: see C-01. In addition: `src/nav/navGrid.ts:33–79` stamps blocking boxes using absolute heights (`bottom(b) >= cfg.bodyHeight`, `top(b) <= cfg.maxLedge`), so a 1 m platform is a wall and a block sitting on that platform is tested against y = 0; `src/ai/cover.ts:30–41` keeps only blocks whose bottom is within `floorGap` of y = 0; `src/map/mapTypes.ts` has only axis-aligned boxes (`kind` is a visual family; "every kind collides as a solid box"); `src/config/physics.ts:10–12` autostep 0.35 m (reliably ~0.15 m with the capsule, `maxWalkableLedge`), max slope 45°; `src/physics/physicsWorld.ts:50` builds every block as a trimesh, so a sloped collider is already supported by the physics side.
- **Design rules (record in `docs/DECISIONS.md`)**:
  1. Walkable surfaces are the tops of `floor` blocks (at any height) and the tops of `ramp` blocks. Nothing else is walkable by design (crate tops stay unreachable, as today).
  2. **No overlapping walkable surfaces**: a point (x, z) has at most one floor height. No mezzanine with walkable space beneath it, no bridge over a lane. This keeps one height per nav cell; a layered grid or recast is the upgrade path if that rule ever has to go.
  3. Ramps slope at most 30° (rise ≤ 0.577 per metre) so a 0.2 m cell steps ≤ 0.12 m, under `maxWalkableLedge` (0.15 m). Stairs are drawn as steps but collide as the ramp underneath (visual only), so nothing depends on autostep.
  4. Height changes between adjacent cells larger than `maxWalkableLedge` are not walkable edges (a platform edge is a drop you can fall off but not route over).
- **Proposed implementation** (four commits, in this order):
  - **C-05a Map data and collider**: in `src/map/mapTypes.ts` add `kind: 'ramp'` with `rise: '+x' | '-x' | '+z' | '-z'` on `MapBlock` (the top surface goes from `center.y - size.y/2` at the low edge to `center.y + size.y/2` at the high edge). `src/physics/physicsWorld.ts`: build a ramp as a wedge trimesh (6 vertices, 8 triangles) with `FIX_INTERNAL_EDGES`. `src/render/mapMeshes.ts`: a wedge geometry for the visual, same texture family as `floor`. Add `surfaceHeightAt(block, x, z): number | undefined` to a new `src/map/surfaces.ts` (floor: top; ramp: linear interpolation along `rise`; undefined outside the block's footprint). Unit test the ramp height at its low edge, centre and high edge.
  - **C-05b Nav grid with floor heights**: `NavGrid` gains `floorY: Float32Array` (NaN = no surface). In `buildNavGrid`: for each cell take the highest `surfaceHeightAt` over floor and ramp blocks at the cell centre; a cell with no surface is not walkable. Stamp blocking boxes **relative to the cell floor**: a block blocks a cell when its footprint (grown by clearance) covers the cell and `bottom(b) < floorY + bodyHeight` and `top(b) > floorY + maxLedge` (this is the current test with `floorY` in place of 0, computed per cell inside the stamp loop instead of per block). Replace the implicit 8-neighbour walkability in `astar` and the cell walk in `clearLine` (`:121–142`) with a shared `canStep(g, a, b)` = both walkable and `|floorY[a] − floorY[b]| ≤ maxStep` (new `NavGridConfig.maxStep`, default `PHYSICS.maxWalkableLedge`). `findPath` (`:170–230`) emits `floorY` of the emitted cell as `y`, and the final goal point uses `floorY` at the goal cell rather than `goal.y`. `nearestWalkable` unchanged. Tests in `src/nav/navGrid.test.ts`: a ramp between two floor levels is routable; a 1 m platform without a ramp is not; string-pulled waypoints carry the surface height; the existing flat-map tests pass unchanged (`floorY` is 0 everywhere on today's Depot).
  - **C-05c Cover, lanes and walk-offs**: `src/ai/cover.ts` `floorBlocks` takes the nav grid and keeps a block when its bottom is within `floorGap` of `floorY` at the block centre (and the top thresholds are measured from that floor). Candidate spots (`findCover` random samples and corner spots) set `position.y = floorY(cell)` and eye heights from that. `src/sim/elimination.ts` already routes on the grid, so walk-offs get heights for free; `deadZoneTarget` y comes from the map data. Add one test in `src/map/depot.test.ts` (or a new `mapData.test.ts`) that every spawn, dead-zone spot, lane point and flag spot lies within 0.05 m of the nav floor at its (x, z), so map data cannot drift from the surfaces. Update `BotController.huntPoint` to return the cell's `floorY` as y.
  - **C-05d Guards**: in `src/ai/depotMatch.test.ts` replace the "nobody leaves the ground" guard with "nobody is off the ground for more than `airSpreadDelay` (C-01) consecutive ticks while in play, and nobody's y goes below the lowest floor or above the highest floor + 2 m". Add a small ramp test map (extend `src/map/testYard.ts` or a fixture in `src/sim/testSupport.ts`) and one headless match test on it: bots reach a goal on the upper level, the walk-off reaches a dead zone on the lower level.
- **Affected files**: `src/map/mapTypes.ts`, `src/map/surfaces.ts` (new), `src/physics/physicsWorld.ts`, `src/render/mapMeshes.ts`, `src/nav/navGrid.ts`, `src/config/nav.ts`, `src/ai/cover.ts`, `src/ai/botController.ts`, `src/sim/testSupport.ts` or `src/map/testYard.ts`, tests in `src/nav`, `src/map`, `src/ai`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` (nav paragraph), `docs/KNOWN_ISSUES.md`.
- **Dependencies**: C-01 step 2 (debounce) first. The Depot layout rework (M11) starts only after C-05d is green.
- **Migration notes**: Today's Depot has only `floor` at y = 0 and boxes on it, so after C-05b `floorY` is 0 everywhere and every existing nav, cover and match test must pass unchanged; treat any change in those numbers as a bug in C-05, not a retune.
- **Risks**: Rapier's ground probe (`probeGround`, `castShape`) on a 30° slope reports a normal within `maxSlopeClimb` (45°), so grounding holds; verify with the ramp match test, because a lost ground contact on slopes would trip the accuracy rule even with the debounce. Bot aim uses straight-line lead in 3D already (`src/ai/aim.ts`), so height differences need no change there. The 2D distance checks in the brain (`Math.hypot(x, z)`) under-estimate distance on steep ramps by a few percent; acceptable.
- **Test plan**: `npm run check`; the new nav, surface, map-data and ramp-match tests; a manual run on the ramp test map via `?map=` if such a switch exists, otherwise temporarily in dev.
- **Acceptance criteria**: all existing tests unchanged and green; ramp fixture tests green; design rules recorded; `docs/ARCHITECTURE.md` says the grid stores one floor height per cell and why.
- **Priority**: Fix Now (precondition of M11). **Confidence**: Confirmed for the problem; the design is the auditor's proposal and the owner has asked for it.

## 5. Fix When Touched (one paragraph each)

- **W-01 (F-07) WebGL context loss**: when the shell/start screen is next edited (Phase 4), add `canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.pause(); startScreen.showResult('Graphics reset', 'Click to resume'); })` in `game.ts` and nothing on restore (three.js rebuilds its state). Test with `WEBGL_lose_context` in DevTools.
- **W-02 (F-08) Storage schema version**: with the first new persisted setting, add `src/settings/storage.ts` exposing `load(key, validate, fallback)` and `save(key, value)` wrapped in try/catch, and one `airsoft.settings` object with `version: 1` that absorbs `airsoft.sensitivity`, `airsoft.difficulty`, `airsoft.mode` (read the old key when the new object lacks the field, then stop writing the old key). Keep `airsoft.keyBindings` as is; its loader already tolerates garbage.
- **W-03 (F-09) Audio node churn**: when suppressors or the audio pass arrive, in `src/audio/sfx.ts` keep one `PannerNode` per character id in a `Map` (update `positionX/Y/Z` instead of creating), and for one-shot chains call `source.addEventListener('ended', () => chain.disconnect())`. Measure node counts with the Web Audio DevTools panel before and after.
- **W-04 (F-10) Shader warm-up**: when F-04 instrumentation shows a hitch on first fade or first flag round, call `await renderer.compileAsync(scene, camera)` after the scene is built in `Game.create`, with the flag object visible and one figure material set `transparent` for that call, then restore.
- **W-05 (F-17) Shell split**: when building the Phase 4 settings screen, move start screen, pickers, pause/resume, pointer-lock orchestration and persistence out of `src/game.ts` into `src/shell/` (`GameShell` owning a `Game`), leaving `Game` as loop + wiring. Do it as the first step of that milestone, not as a standalone refactor.
- **W-06 (F-18) Test split**: when test wall time annoys, rename the match soaks to `*.match.test.ts`, exclude them in `vitest.config`'s default `include`, and add `test:all`. Keep `check` running `test:all` so the critic gate keeps the guards.
- **W-07 (F-13) Frozen armament on elimination**: if a playtester notices the reload bar freezing during a walk-off, set `victim.armament.reload = 0` and `recoil = 0` in `eliminate` (`src/sim/elimination.ts:33`). One line; cosmetic.

## 6. Defer / Leave Alone (one line each)

- D-01 (F-05) Rapier compat chunk size: owner question; only reopen if the 1.2 MB matters.
- D-02 (F-15) Lint/format tool: add Biome when a second contributor appears or at beta.
- D-03 (F-16) Licence: owner adds a LICENSE file or `"license": "UNLICENSED"` + `"private": true`.
- D-04 (F-11) Round-start route burst: within budget; revisit only past ~10 bots per team.
- D-05 (F-12) In-tick walk-off path search: already in KNOWN_ISSUES; measured ≤ 3 ms warm.
- D-06 (F-14) Sim-time dilation under overrun: correct design; keep.
- D-07 Config cross-imports (bots→movement, hits→modes, render→audio): known, harmless at this size.
- D-08 `probeGround`/event `vec3` allocations: young-gen churn only; heap is flat over 30 min; leave until a browser profile says otherwise.

## 7. Preserve (do not change in these changes)

Fixed-step loop and `fixedStepper`; `PlayerCommand` interface and the per-tick `events` array; seeded RNG; trimesh colliders with `FIX_INTERNAL_EDGES`; merged map meshes; instanced BBs and puffs; change-only HUD writes; headless match guard tests (their thresholds are documented in DECISIONS); the chunk budgets in `vite.config.ts`; the docs discipline.

## 8. Post-implementation validation

Commands, after all of phases 1–3:

```
npm run typecheck
npm test
npm run build
npm run test:browser          # C-02
git log --oneline -6          # one commit per change ID
```

Expected: typecheck clean; 294 + new tests green; build green with chunk sizes within ±5% of rapier 4,333 kB / three 589 kB / index 149 kB (C-04 adds a few hundred bytes); smoke test green; CI run green on GitHub.

**Manual playtest checklist** (Chrome, then Firefox):

1. `npm run preview`, open `/`, click to play, pointer locks; Esc pauses; click resumes (Chrome may need a second click within 1 s, that is known).
2. Play one Elimination round: fire, reload, get hit, walk off, spectate, round restarts.
3. Switch to Attack/Defend from the start screen; flag raises; marker shows.
4. Open the debug overlay (Backquote or F3 by default): FPS, draw calls, triangles and `quality` are shown. Note FPS at `?quality=low|medium|high` on the iGPU laptop and record it in DECISIONS.
5. Drag the window between two monitors with different scaling: image stays sharp, crosshair size stays constant (F-06).
6. Sprint, jump, land: spread (crosshair gap) does not flash wide on landing except after a real jump (C-01).

**Performance checks**: `?quality=high` FPS on the reference iGPU ≥ 60 with the overlay open in a 3v3; if not, note the preset that reaches it. Draw calls per frame recorded once (expect low hundreds).

**Browser matrix**: Chrome and Edge (Chromium) for everything; Firefox for pointer lock, audio and the smoke-equivalent manual run; Safari out of scope.

# Airsoft FPS — Full-project audit (Fable 5.1, 2026-10-02)

Audited commit: `ae0b87d` ("Docs: handoff for the next session (M11 Depot rework)"), branch `main`, 82 commits between 2026-09-28 and 2026-10-02.
Read-only audit: no tracked file was modified; everything the audit produced lives in `/audit/`.

Stack as inferred from the repository (the prompt left these to be filled in):

| Question | Answer (evidence) |
|---|---|
| Engine / framework | Three.js r0.186.1 + Rapier `@dimforge/rapier3d-compat` 0.21.0, Vite 8.3.1, Vitest 5.0.2, TypeScript 5.9.3 strict (`package.json`, `tsconfig.json`) |
| Language | TypeScript, plain CSS, one HTML page |
| Target browsers | Desktop Chrome, Firefox, Edge; mobile out of scope (`CLAUDE.md` §3) |
| Multiplayer | No, owner decision 2026-09-30 (`CLAUDE.md` §3, `docs/DECISIONS.md`) |
| Hosting | Static files; `base: './'` so any folder works (`vite.config.ts:24`); no deploy pipeline or CI in the repo |
| Six-month heading | Phase 3 M11 Depot rework next, then Phase 4 presentation/settings/onboarding, then beta (`docs/HANDOFF.md`, `docs/ROADMAP.md`) |

---

## 1. Executive summary

The project is in good shape for a five-day-old solo prototype. The simulation is a fixed 60 Hz step over plain data, bots and the player share one command interface, randomness is seeded, and 294 tests, including headless bot-only matches with real Rapier physics, guard the gameplay rules. Typecheck, tests and production build all pass. The headless simulation (bots + physics + sim) costs about 0.1 ms per tick for a 3v3 and 0.25 ms for a 6v6, with no heap growth over a simulated 30-minute match. The production build boots in headless Chromium with zero console errors.

**Top five findings**

1. **The whole bot and movement stack assumes a flat floor at y = 0**, and the next milestone (M11 Depot rework) is the moment that assumption gets either confirmed or broken. The nav grid is 2D, cover search and lane points take y from the character or the config, and the headless guard that "nobody leaves the ground" will fail on the first ramp. Decide flat-or-not before M11 (F-01).
2. **There is no browser-level test and no CI**, so a change that breaks boot, pointer lock, rendering, or the start screen is caught only by a human playtest. The 391-line composition root `src/game.ts` has zero tests. A headless Chromium smoke test ran fine during this audit, so the cost of adding one is low (F-02, F-03).
3. **The 60 FPS target on integrated graphics is unverified** and the renderer takes the expensive defaults everywhere: MSAA, DPR up to 1.5, a 2048² PCF shadow map re-rendered every frame, ACES tone mapping. Nothing in the repo measures a frame on a real GPU; a quality setting does not exist yet (F-04).
4. **The Rapier compat chunk is 4.3 MB raw / 1.65 MB gzip**, 92% of the download, because the WASM is inlined as base64. It is a fixed technical decision and well under the 30 MB budget, so this is a question for the owner, not a fix (F-05).
5. **Three small robustness gaps in the browser shell**: device pixel ratio is read once and never re-applied on resize or monitor move; nothing handles a WebGL context loss beyond three.js's default; localStorage keys carry no schema version ahead of the Phase 4 settings screen (F-06, F-07, F-08).

**Top three high-leverage changes** (details in §7)

- Add a Playwright boot smoke test plus a GitHub Actions workflow running `npm run check` and the smoke test. Cheap now, and it is the only thing that will catch presentation-layer regressions during the Phase 4 art and menu work.
- Write down the elevation policy for Depot (flat, or ramps/stairs) and, if elevation is coming, plan the nav grid for it before M11 rather than after.
- Add a `quality` entry to `config/render.ts` (shadow map size, shadows on/off, MSAA, DPR cap) and surface it on the debug overlay now, so iGPU frame cost can be measured before Phase 4 builds the settings screen around it.

Nothing found is a "stop the line" bug. No security or licensing problem beyond the missing LICENSE file and `license` field (§10).

---

## 2. Coverage and method

### 2.1 What was read

Read in full: `package.json`, `package-lock.json` (summary), `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `.gitattributes`, `CLAUDE.md`, `README.md`, `.claude/agents/critic.md`, every file in `docs/` (ARCHITECTURE, ASSETS, DECISIONS, HANDOFF, IDEAS, KNOWN_ISSUES, REVIEWS, ROADMAP, VISION), `src/main.ts`, `src/game.ts`, all of `src/core`, `src/config`, `src/sim`, `src/physics`, `src/nav`, `src/input`, `src/ai` (non-test), `src/ui`, `src/audio`, and in `src/render`: renderer, cameraRig, lighting, mapMeshes, proceduralTextures, combatPresentation, matchPresentation, bbRenderer, impactPuffs, bbPathsDebug, characterRenderer, characterModels, flagRenderer, spectatorCamera, screenMarker, viewmodel. `src/map/depot.ts` header, data tables and tail; `src/map/testYard.ts` skimmed.

Skimmed only (searched for allocations, dispose and three.js object creation rather than read line by line): `src/render/replicaModels.ts` (369 lines), `src/render/handModels.ts` (194 lines), `src/style.css` (839 lines, grepped for `@import`, `url(`, `@font-face`, `animation`). Test files: `src/ai/depotMatch.test.ts` read in full as the headless match harness; the other 36 test files were listed and their `describe` names read, not their bodies.

Not read: nothing else in the tree is source. There are no binary assets, no shaders, no workers, no service worker, no `.github/`.

### 2.2 Lines of code by layer (`wc -l`, source / test)

| Layer | Source | Tests |
|---|---|---|
| config | 1364 | 17 |
| core | 73 | 67 |
| sim | 1746 | 2130 |
| nav | 310 | 116 |
| ai | 1901 | 1622 |
| physics | 180 | 344 |
| map | 317 | 441 |
| render | 2569 | 465 |
| audio | 407 | 11 |
| input | 445 | 164 |
| ui | 1016 | 115 |
| game.ts / main.ts | 391 / 26 | 0 |
| style.css | 839 | – |

### 2.3 Commands run and results (Node 22.22.0, Linux container, no GPU)

| Command | Result |
|---|---|
| `npm ci` | exit 0, installed from the lockfile only (no dependency change) |
| `npm run typecheck` (`tsc --noEmit`) | exit 0, no errors |
| `npm test` (`vitest run`) | 37 files, 294 tests, all passed, 43.75 s wall |
| `npm run build` (`tsc --noEmit && vite build`) | exit 0 in 862 ms. `dist/index.html` 0.72 kB, `index-*.css` 9.84 kB (gzip 2.80), `index-*.js` 149.23 kB (gzip 52.07), `three-*.js` 588.69 kB (gzip 148.14), `rapier-*.js` 4,332.81 kB (gzip 1,669.30). No source maps. Both chunk budgets (rapier 4500 kB, default 800 kB) pass. |
| `npm audit` | 0 vulnerabilities |
| `npm ls --depth=0` | 6 direct dependencies, 70 packages in the lockfile |
| `npm outdated` | typescript 5.9.3 (latest 7.0.2, pinned by `docs/DECISIONS.md`), vite 8.3.1 → 8.3.2, vitest 5.0.2 → 5.0.3 |
| Lint / format | No linter or formatter is configured (no eslint, biome or prettier in `package.json`); nothing to run |
| `git log` | 82 commits; 16 on 09-28, 39 on 09-30, 16 on 10-01, 11 on 10-02 |
| Static greps | `addEventListener` 18 adds / 12 removes, all in constructors and `dispose`, none in per-frame code. Timers: only `requestAnimationFrame`. `Math.random`: audio only (`src/audio/sfx.ts`, presentation). `console.`: `src/main.ts` error path only. No `visibilitychange`, no `webglcontextlost` handler in `src/`. |
| Rapier WASM size | `node_modules/@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm` is 3,082,103 bytes; base64 inlined into `rapier.mjs` (4,340,292 bytes), which is what the 4.33 MB chunk carries |
| Headless benchmark (scratch Vitest config outside the repo, `--expose-gc`, reusing the `playMatch` pattern from `src/ai/depotMatch.test.ts`) | See §2.4 |
| Headless Chromium smoke (Playwright from the container, `vite preview` of the production build, `?nolock&seed=1`) | Boot to start screen in 923 ms; `#loading` removed; WebGL 2 context via SwiftShader; zero `pageerror`, zero console messages, zero failed requests; transfers: rapier 1606 kB, three 144 kB, index 51 kB, css 3 kB. Clicking "Click to play", holding fire, walking and reloading for ~15 s produced a correct HUD ("AEG RIFLE 54 Reloading HIT! You called your hit BLUE YOU 0 2:25 ORANGE 0") and a rendered frame (screenshot checked). rAF rate 4.1 fps under SwiftShader, not representative of any GPU. |

### 2.4 Headless benchmark numbers

All with Depot, real Rapier, bots on every character, measured per tick as `bots.think + stepSimulation + bots.observe`, first 2 s excluded. Single run per row; treat as order-of-magnitude.

| Scenario | mean | p50 | p99 | max | ticks > 4 ms | rounds / shots / hits |
|---|---|---|---|---|---|---|
| 3v3 elimination, 300 s, seed 11 | 0.110 ms | 0.076 | 0.568 | 5.33 | 2 of 17,879 | 5 / 143 / 18 |
| 3v3 Attack/Defend, 300 s, seed 7 | 0.107 ms | 0.082 | 0.469 | 3.37 | 0 | 9 / 256 / 36 |
| 3v3 elimination, 1800 s, seed 23 | 0.076 ms | 0.062 | 0.220 | 3.52 | 0 of 107,879 | 6 / 207 / 25 |
| 6v6 elimination, 180 s, seed 5 | 0.251 ms | 0.208 | 1.018 | 2.75 | 0 | 8 / 574 / 73 |

Breakdown for the 3v3 baseline: `stepSimulation` mean 0.090 ms (max 2.5), `bots.think` mean 0.019 ms (max 5.2, the round-start route-planning burst), `bots.observe` ≈ 0. Max live BBs 7 (10 in the 6v6) against a pool of 256.

Heap: after a double forced GC, `heapUsed` went from 23.6 MB at t = 60 s to 18.3 MB at t = 1800 s with bots on, and stayed at 18.3 MB over 600 s with bots off. **No retained growth in sim + AI + physics.** (A first run sampling after a single GC showed a slow climb to 27.6 MB; the double-GC run shows that was collector lag, not a leak.)

Construction: `new PhysicsWorld(DEPOT)` 88 ms cold / 3–5 ms warm; `buildNavGrid(DEPOT)` 7 ms cold / 0.4 ms warm; cover block extraction < 1 ms. `findPath` corner-to-corner on Depot: cold first call 19.7 ms (JIT), warm mean 1.1 ms, p99 2.5 ms, max 3.1 ms.

### 2.5 What could not be measured

- Real frame time, GPU time, shader compile stalls, and the 60 FPS target on integrated graphics (no GPU in the container; SwiftShader numbers are meaningless).
- Audio behaviour (Web Audio nodes exist headless but nothing measures them).
- Firefox and Edge behaviour (only Chromium is installed).
- Pointer lock behaviour (automated browsers cannot take it; the `?nolock` path was used).
- Brotli sizes (no brotli binary; gzip only).

---

## 3. Architecture (as found)

```
index.html ─ src/main.ts ─ Game (src/game.ts, composition root)
                             ├─ input/   keyboard, pointerLock, keyBindings, playerInput → PlayerCommand
                             ├─ sim/     stepSimulation(state, commands, ctx, dt) at 60 Hz
                             │           movement → lean → accuracy → elimination → footsteps → armament → bbs → round/flag
                             ├─ physics/ PhysicsWorld: Rapier kinematic controllers + trimesh level colliders (mover + query)
                             ├─ nav/     2D nav grid (0.2 m cells) + A* + string pulling
                             ├─ ai/      BotController → per-bot brain (advance/fight/cover/search/flag), perception, aim, cover
                             ├─ render/  Renderer (three.js) + presentation classes that read state + events
                             ├─ audio/   Sfx: procedural Web Audio, driven by events
                             └─ ui/      DOM HUD, start screen, pickers, debug overlay (change-only writes)
```

Key properties, all confirmed in code:

- **Fixed step with time clamp**: `src/game.ts:343` clamps frame dt to `SIM.maxFrameDt` (0.25 s); `src/core/fixedStepper.ts:16–26` runs at most `maxTicks` (5) per frame and **drops the remainder** when it overruns, so the sim slows down rather than spiralling. The round clock is sim time, so a sustained overrun lengthens rounds in wall time (design trade-off, documented in the file header).
- **One command interface**: `PlayerInput.fillCommand` and `BotController.think` both write `PlayerCommand`s into one map consumed by `stepSimulation` (`src/game.ts:355–358`).
- **Events, not callbacks**: `state.events` is filled by the sim and cleared each tick; presentation (`combatPresentation`, `matchPresentation`, `Sfx`, HUD) consumes it in `afterTick`. Bots consume the same events in `observe`.
- **Determinism**: `sim/rng.ts` mulberry32, seed from `?seed=` or `crypto.getRandomValues` (`src/main.ts:12`); `Math.random` appears only in audio. Bots own a separate seeded RNG.
- **Presentation never mutates sim state** except two explicit composition-root calls (`restartMatch`, difficulty swap), both commented as such.
- **Config is data**: 1364 lines of typed config; three cross-config imports exist (bots → movement, hits → modes, render → audio) and are already listed in KNOWN_ISSUES.

---

## 4. Major findings

Format: ID, title, category · severity · confidence · priority, location, problem, evidence, root cause, impact, affected systems, recommendation, validation. "Design trade-off" marks items where the current behaviour is a reasonable choice.

### F-01 — Flat-floor assumption across nav, cover, lanes and accuracy, right before the Depot rework
Architecture · **High** · **Confirmed** · **Fix Now (as a decision; implementation only if elevation is in scope)**

- **Location**: `src/nav/navGrid.ts:33–79` (`buildNavGrid`, 2D cells keyed by x/z only), `src/nav/navGrid.ts:186` (`findPath` writes `y: goal.y` into every waypoint), `src/ai/cover.ts:30–52` (`floorBlocks` classifies cover purely by block top height relative to a flat floor), `src/ai/cover.ts:204–208` (eye heights are `from.y + eyeHeight`), `src/map/depot.ts:224` (flags and lane points at `y = 0`), `src/sim/elimination.ts:48–50` (walk-off route on the same 2D grid), `src/ai/depotMatch.test.ts` "no one leaves the ground" guard, `docs/KNOWN_ISSUES.md` row "A one-tick loss of ground contact would flash the spread to its in-air value".
- **Problem**: Every system that reasons about where a character can go or see assumes one floor plane. Ramps, stairs, a mezzanine or even a 0.3 m raised platform would make the nav grid plan through or under them, cover classification mis-tier blocks, bot eye lines originate at the wrong height, and the in-air spread multiplier (×4.5) flicker on every step down.
- **Evidence**: `buildNavGrid` has no notion of y beyond block top heights; `findPath` emits `goal.y` for all points; `docs/IDEAS.md` and `docs/HANDOFF.md` mention ramps/stairs/vaulting and "doorway clearance in the M11 Depot rework"; KNOWN_ISSUES already predicts the air-multiplier failure "if the guard fails after the M11 Depot rework".
- **Root cause**: The first map is a flat yard; the nav layer was correctly scoped to it (DECISIONS: nav grid instead of recast). Nobody has yet written down whether elevation is in scope for v0.1.
- **Impact**: If M11 adds elevation without a plan, the nav/cover/accuracy layers need a coordinated change under time pressure, and the 1,622 lines of AI tests lose their ground truth. If M11 stays flat, nothing needs to change and the layer stays simple.
- **Affected systems**: nav, ai (cover, brain, controller, hunt points), sim/elimination, sim/accuracy, map data, tests.
- **Recommendation**: Before M11, record in `docs/DECISIONS.md` one of: (a) "v0.1 maps are flat; ledges ≤ 0.15 m or ≥ cover height" (already half-stated in KNOWN_ISSUES), or (b) elevation is in scope, in which case plan a layered or height-sampled nav grid (cell stores floor height, walkable if the step between neighbours ≤ autostep) and make `findPath` emit sampled y, before touching Depot. Either way, add a debounce (a few ticks) to the in-air spread multiplier so one lost ground contact never spikes spread; it is cheap and removes a known cliff.
- **Validation**: Decision recorded; if (b), `navGrid.test.ts` gains a ramp fixture and `depotMatch.test.ts`'s ground guard is replaced by a "no character falls through or floats" guard.

### F-02 — No browser-level test; the composition root has no tests
Testing · **Medium** · **Confirmed** · **Fix Soon**

- **Location**: `src/game.ts` (391 lines, 0 tests), `src/main.ts`, `src/render/*` (465 test lines against 2569 source, mostly maths helpers), `src/ui/*` (115 test lines, pure helpers only), `src/audio/sfx.ts` (11 test lines), `src/input/pointerLock.ts` (0 tests).
- **Problem**: Boot, pointer lock flow, start screen, HUD wiring, renderer resize, audio unlock and the match-over flow are verified only by a human in a browser. The critic process cannot catch a regression there either, because it also runs only `check`.
- **Evidence**: `package.json:9–15` scripts; no Playwright/puppeteer dependency; `docs/KNOWN_ISSUES.md` row "Automated browsers can't take pointer lock" shows the `?nolock` flag exists precisely to enable this and is unused by any test. During this audit a Playwright script against `vite preview` booted the production build, clicked play, fired, walked, reloaded and read the HUD text in ~15 s with zero errors, so the harness cost is small.
- **Root cause**: Phase 1–3 priorities; tests were (rightly) aimed at gameplay rules.
- **Impact**: Phase 4 (art, VFX, menus, settings) is almost entirely presentation-layer work; it is exactly the layer with no automated check. Expensive later.
- **Affected systems**: build/test pipeline, game.ts, ui, render.
- **Recommendation**: Add `@playwright/test` as a dev dependency with one spec: build, `vite preview`, open `/?nolock&seed=1`, assert `.start-play` appears, no `pageerror`, click play, wait 5 s, assert the HUD shows an ammo count and the round clock advanced, take one screenshot artefact. Run it from `npm run check:browser`, keep `npm run check` as is. This needs the dev-only `nolock` flag to remain available in preview builds or a `VITE_` env switch; see OPUS_HANDOFF C-02.
- **Validation**: spec passes locally; breaking `src/main.ts` fails it.

### F-03 — No CI: `npm run check` runs only when someone remembers
Build/deploy · **Medium** · **Confirmed** · **Fix Soon**

- **Location**: repository root (no `.github/`), `package.json:15` (`check` script exists).
- **Problem**: The critic gate and the owner both rely on the session running `check`; nothing runs it on push. The 4.5 MB chunk budget plugin in `vite.config.ts:8–22` only bites on a local build.
- **Evidence**: `ls -a .github` → not found. Git history shows all commits land directly on `main` by policy (`CLAUDE.md` §7).
- **Root cause**: Solo project, no PRs yet.
- **Impact**: Low today; grows the moment the `alpha`/`beta` branch model from `CLAUDE.md` §7 starts, or a second contributor appears.
- **Recommendation**: One workflow file: Node 22, `npm ci`, `npm run check`, later plus the browser smoke. Ten lines; no change to the repo policy of pushing to `main`.
- **Validation**: Workflow green on the next push.

### F-04 — Frame cost on integrated graphics is unmeasured and all rendering defaults are the expensive ones
Rendering / performance · **Medium** · **Likely** (needs profiling) · **Fix Soon** (instrument), **Defer** (settings UI, Phase 4)

- **Location**: `src/render/renderer.ts:22–27` (`antialias: true`, DPR cap 1.5, ACES tone mapping, PCF shadows), `src/config/render.ts:13–18` (`maxPixelRatio: 1.5`, `shadows: true`, `shadowMapSize: 2048`), `src/render/lighting.ts:58–62` (one directional light, 2048² map fitted to the whole map box, `shadow.autoUpdate` left at the default `true` so the shadow pass renders every frame), `src/render/viewmodel.ts` (second render pass for the view model with its own scene), `src/render/characterRenderer.ts:74` (per-figure cloned `MeshStandardMaterial`), `src/render/flagRenderer.ts:43` (`DoubleSide` `MeshStandardMaterial`).
- **Problem**: At 1080p with DPR 1.5 the main pass is 2880 × 1620 MSAA, plus a 2048² shadow pass of the entire map and all figures, plus the view-model pass, every frame. On an Intel iGPU this is plausibly 8–16 ms of GPU time before any game logic. Nothing in the repo measures it; the debug overlay shows FPS and sim ticks but not GPU or draw-call counts.
- **Evidence**: file references above; `src/ui/debugOverlay.ts` keys are FPS, ticks/s, seed, counts (no `renderer.info` numbers). `CLAUDE.md` §6 sets "stable 60 FPS on a mid-range laptop with integrated graphics" as a definition of done for Phase 1; no document records a measurement.
- **Root cause**: Early prototype; art pass still ahead; no iGPU in the owner's test loop recorded.
- **Impact**: If the target is already missed, Phase 4 art and VFX make it worse and the discovery arrives at beta, the most expensive time.
- **Affected systems**: render, config/render, ui/debugOverlay, future settings screen.
- **Recommendation**: (1) Add `renderer.info.render.calls/triangles` and `renderer.info.memory` to the debug overlay. (2) Add a `quality` block in `config/render.ts` with two or three presets (shadow map 1024/2048, shadows on/off, antialias, DPR cap 1/1.5) read once at Renderer construction, togglable via a `?quality=` URL parameter so the owner can A/B on an iGPU laptop today. (3) When the owner has numbers, consider `sun.shadow.autoUpdate = false` plus a manual `needsUpdate` only when a character moved, which halves shadow cost on static frames (do not do this blind, figures move most frames). Phase 4 then exposes the presets in settings.
- **Validation**: Debug overlay shows draw calls; `?quality=low` reduces shadow map size (check via `renderer.info`); owner records FPS at each preset on one iGPU machine in `docs/DECISIONS.md`.

### F-05 — Rapier compat chunk dominates the download (4.3 MB raw, 1.65 MB gzip)
Assets/loading · **Low** · **Confirmed** · **Defer** (owner question; fixed decision)

- **Location**: `vite.config.ts:5,32–38` (rapier chunk group and 4500 kB budget), `node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs` (3.08 MB WASM inlined as base64).
- **Problem**: 92% of the initial download is one chunk, decoded from base64 on every cold load; the compat package exists to avoid needing `.wasm` MIME handling, which Vite serves fine.
- **Evidence**: build output in §2.3; smoke test transfer sizes (rapier 1606 kB of 1804 kB total).
- **Root cause**: Fixed technical decision (`CLAUDE.md` §3). The chunk is split and cacheable, so repeat loads are cheap.
- **Impact**: Roughly one extra second on a 20 Mbit connection on first load, plus base64 decode time. Within the 30 MB budget. Design trade-off.
- **Recommendation**: Leave as is for v0.1. If the owner ever wants to cut it, switching to `@dimforge/rapier3d` (plain WASM, same API, loaded with `?url` or Vite's default WASM support) removes ~1.2 MB raw and the decode step; raise it as a question, not a change.
- **Validation**: n/a.

### F-06 — Device pixel ratio is set once and never re-applied
Rendering / browser compat · **Low** · **Confirmed** · **Fix When Touched** (next time `renderer.ts` is edited; it is a two-line change)

- **Location**: `src/render/renderer.ts:23` (`setPixelRatio` in the constructor), `src/render/renderer.ts:65–71` (`resize` sets size and aspect only).
- **Problem**: Dragging the window to a monitor with a different DPR, or changing OS scaling, leaves the canvas at the old ratio: either blurry or over-rendered.
- **Evidence**: no other `setPixelRatio` call in `src/`; `resize` is the only handler on `window.resize`.
- **Root cause**: Oversight.
- **Impact**: Cosmetic/perf on multi-monitor desktops.
- **Recommendation**: Call `setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio))` inside `resize` before `setSize`.
- **Validation**: Manual: move the window between a 100% and 150% monitor; the HUD crosshair gap (CSS px) must stay the same size and the scene must stay sharp.

### F-07 — No handling of WebGL context loss beyond three.js's default
Rendering / robustness · **Low** · **Speculative** · **Fix When Touched** (Phase 4 shell work)

- **Location**: `src/game.ts` (no `webglcontextlost` listener), three.js `WebGLRenderer` registers its own `webglcontextlost`/`webglcontextrestored` and rebuilds state on restore.
- **Problem**: On restore, three.js re-creates programs and re-uploads textures from their source data. Procedural textures (`src/render/proceduralTextures.ts`) and `InstancedMesh` buffers have CPU-side data so they should recover; but the game keeps simulating while the canvas is blank and the user gets no message. Untested.
- **Recommendation**: When touching the shell: on `webglcontextlost` call `pause()` and show "Graphics reset, click to resume" on the start screen; on restore just resume. Optional: skip entirely for v0.1.
- **Validation**: Chrome DevTools → Rendering → "Emulate WebGL context loss" (or `WEBGL_lose_context`).

### F-08 — localStorage has no schema version ahead of the Phase 4 settings screen
Persistence · **Low** · **Confirmed** · **Fix When Touched** (first new persisted setting)

- **Location**: `src/input/keyBindings.ts:7, 93` (`airsoft.keyBindings` JSON, tolerant parse, resets if any action is unbound), `src/ui/startScreen.ts` (`airsoft.sensitivity` number), `src/ai/difficultyChoice.ts` (`airsoft.difficulty`), `src/ui/modeChoice.ts` (`airsoft.mode`); every read is in try/catch and validated.
- **Problem**: Four independent keys with no version. The settings screen will add several more (audio, quality, accessibility). Renaming an action or changing the sensitivity scale silently loads stale values.
- **Impact**: Low now; the current code is defensive. Cheap now, fiddly later.
- **Recommendation**: When the first Phase 4 setting lands, introduce one `airsoft.settings` object with a `version` field and a tiny `settings/storage.ts` with `load<T>(key, validate)`/`save`; migrate the four keys lazily (read old key if new one is absent). Keep the existing per-key validation.
- **Validation**: unit test: loading `{version: 0}` yields defaults; loading the current format round-trips.

### F-09 — Audio creates one `PannerNode` (plus filter/gain for suppressed shots) per positional sound and relies on GC to free them
Audio · **Low** · **Likely** (needs profiling) · **Fix When Touched** (suppressors / audio pass)

- **Location**: `src/audio/sfx.ts:326–340` (`output` creates a panner per call), `:313–323` (`muffled` creates filter + gain per suppressed shot), `:101–154` (every event calls `output`); nothing calls `disconnect`.
- **Problem**: A full-auto AEG at ~13 rps from three bots is ~40 panners/s, each with oscillator/buffer sources that end themselves. Browsers do collect ended source nodes and unreferenced panners, but the graph churn is a known cause of audio-thread hiccups on weaker machines, and Firefox is slower to collect. KNOWN_ISSUES already flags the suppressed path.
- **Impact**: Unknown until measured; no complaint on record.
- **Recommendation**: When the audio pass or suppressors arrive: a small pool of panners keyed by emitting character (bots and player have stable ids; update position instead of re-creating), and `disconnect()` on `ended` for one-shot chains. Measure with `chrome://media-internals` or the Web Audio DevTools panel first.
- **Validation**: node count in the Web Audio inspector stays flat during a bot-only round.

### F-10 — First-use shader compiles can hitch mid-match
Rendering · **Low** · **Speculative** · **Fix When Touched** (Phase 4 presentation)

- **Location**: `src/render/flagRenderer.ts:43,52,58` (cloth `MeshStandardMaterial` with `DoubleSide`, hidden until Attack/Defend starts), `src/render/characterRenderer.ts:150–152` (toggling `material.transparent` sets `needsUpdate`, and three.js includes transparency in its program cache key so the first fade compiles a program variant).
- **Problem**: A material whose program is first compiled during play causes a one-frame stall of tens of ms on iGPUs. Both cases first occur mid-session (first elimination fade, first flag round).
- **Recommendation**: Call `renderer.compileAsync(scene, camera)` (three ≥ r0.152) with every material variant present once at start, or keep the flag object in the scene scaled to zero for the first frame. Only worth doing once F-04 instrumentation shows a hitch.
- **Validation**: Chrome performance trace shows no `linkProgram` after the first second of play.

### F-11 — Round-start work is bursty: route planning for all bots lands in one tick
AI / performance · **Low** · **Confirmed** (headless) · **Leave Alone** (within budget)

- **Location**: `src/ai/botController.ts:374–390` (`pathsPerTick: 1` ration, `src/config/bots.ts:225`), `bots.think` max 5.2 ms in the 3v3 baseline, 3.4 ms in the 1800 s run; `findPath` warm p99 2.5 ms.
- **Assessment**: The ration already bounds this to one search per tick; the max tick cost stays under 6 ms headless, and the 6v6 scaled sub-linearly (p99 1.0 ms). Fine for 3v3 and 6v6. Design trade-off kept.
- **Note for later**: `pickRetakers` (`botController.ts:168`) is O(bots²) per tick and `firstCharacterHit` (`src/sim/bbs.ts:22`) is O(characters) per live BB; both are trivially small at these counts. Revisit only if team sizes grow past ~10.

### F-12 — Walk-off route search runs synchronously inside the elimination tick
Sim / performance · **Low** · **Confirmed** · **Leave Alone** (already in KNOWN_ISSUES)

- **Location**: `src/sim/elimination.ts:48`.
- **Assessment**: Measured `findPath` warm max 3.1 ms on Depot, a few hits per round; already documented. The one new fact: a cold first call measured 19.7 ms, but bots have warmed `findPath` long before the first hit, so this does not apply in play.

### F-13 — Eliminated characters keep a frozen `armament` (reload timer, recoil) until respawn
Sim · **Low** · **Confirmed** · **Leave Alone** (cosmetic, intended)

- **Location**: `src/sim/simulation.ts:123–136` (eliminated characters skip `stepArmament`), `respawnCharacter` creates a fresh armament.
- **Assessment**: A player hit mid-reload sees the reload bar freeze during the walk-off; on respawn everything is fresh. Harmless; a one-line `armament.reload = 0` on elimination would tidy the HUD if it ever bothers anyone.

### F-14 — Sim time dilates under sustained overrun (design trade-off)
Game loop · **Low** · **Confirmed** · **Leave Alone**

- **Location**: `src/core/fixedStepper.ts:19–23` (`accumulator = 0` when ticks exceed `maxTicks`), `src/game.ts:343` (`maxFrameDt` 0.25 s).
- **Assessment**: Correct spiral-of-death protection. A machine that cannot do 60 ticks/s plays a slower game, and round clocks run in sim time. For a single-player game this is the right call and the debug overlay already shows ticks/s so the owner can see it happening. Keep.

### F-15 — No lint or format tool
Developer iteration · **Low** · **Confirmed** · **Defer** (beta, or whenever a second person touches the code)

- **Location**: `package.json` devDependencies.
- **Assessment**: `tsc --strict` with `noUncheckedIndexedAccess`, `noUnusedLocals` and friends already catches most of what eslint would. The code is consistently formatted by hand. Adding Biome (one dev dependency, one config, no plugins) is the cheapest option when wanted. Not a correctness risk.

### F-16 — No LICENSE file and no `license` field
Licensing · **Low** · **Confirmed** · **Question for the developer**

- **Location**: repository root; `package.json` has no `license` field (`npm` warns on publish only).
- **Assessment**: Dependencies are all MIT/Apache-2.0 (three MIT, rapier Apache-2.0, vite/vitest/typescript MIT/Apache-2.0); `docs/ASSETS.md` is correctly empty because everything is generated in code. The project's own licence is simply undeclared. Decide whether the repo is "all rights reserved" (add `"private": true` plus `"license": "UNLICENSED"`) or open (add a LICENSE file).

### F-17 — Config cross-imports and `game.ts` growth
Architecture / debt · **Low** · **Confirmed** · **Fix When Touched**

- **Location**: `src/config/bots.ts` imports `MOVEMENT`; `src/config/hits.ts` holds `HITS` and `ROUNDS` and imports `FLAG` from `modes`; `src/config/render.ts` imports `audio` (all already in KNOWN_ISSUES). `src/game.ts` at 391 lines owns input, start screen, difficulty/mode pickers, debug keys, match restart, and the frame loop.
- **Assessment**: Fine today. Phase 4 adds a settings screen, menus and onboarding, which will naturally land in `game.ts`. Pull "shell" concerns (start screen, pickers, persistence, pause/resume, pointer lock orchestration) into a `shell/` or `app/` module when the settings screen is built, leaving `Game` as the loop plus wiring. Do not refactor ahead of that.

### F-18 — Test suite wall time is dominated by the headless match soaks
Developer iteration · **Low** · **Confirmed** · **Fix When Touched**

- **Location**: `npm test` 43.75 s for 294 tests; `src/ai/depotMatch.test.ts` and siblings run 150 s simulated matches over multiple seeds (timeouts up to 30 s each).
- **Assessment**: Correct tests to have; they just make the inner loop slow. When it starts to annoy: tag the match soaks (`describe.concurrent` or a `test.match.*.ts` include pattern) and give `npm test` a `--exclude` for them with `npm run test:all` for the gate. Vitest already runs files in parallel so the win is bounded by the slowest file.

---

## 5. Findings register

| ID | Title | Category | Severity | Confidence | Priority |
|---|---|---|---|---|---|
| F-01 | Flat-floor assumption vs M11 rework | Architecture | High | Confirmed | Fix Now (decision) |
| F-02 | No browser-level test; `game.ts` untested | Testing | Medium | Confirmed | Fix Soon |
| F-03 | No CI | Build/deploy | Medium | Confirmed | Fix Soon |
| F-04 | iGPU frame cost unmeasured; expensive render defaults | Rendering/perf | Medium | Likely | Fix Soon (instrument) / Defer (UI) |
| F-05 | Rapier compat chunk 4.3 MB | Assets/loading | Low | Confirmed | Defer (question) |
| F-06 | DPR not re-applied on resize | Rendering | Low | Confirmed | Fix When Touched |
| F-07 | No context-loss handling | Rendering | Low | Speculative | Fix When Touched |
| F-08 | No storage schema version | Persistence | Low | Confirmed | Fix When Touched |
| F-09 | Audio node churn | Audio | Low | Likely | Fix When Touched |
| F-10 | Mid-match shader compile hitch | Rendering | Low | Speculative | Fix When Touched |
| F-11 | Round-start route burst | AI/perf | Low | Confirmed | Leave Alone |
| F-12 | In-tick walk-off search | Sim/perf | Low | Confirmed | Leave Alone |
| F-13 | Frozen armament while eliminated | Sim | Low | Confirmed | Leave Alone |
| F-14 | Sim time dilates under overrun | Game loop | Low | Confirmed | Leave Alone (trade-off) |
| F-15 | No lint/format tool | Dev iteration | Low | Confirmed | Defer |
| F-16 | No LICENSE / license field | Licensing | Low | Confirmed | Question |
| F-17 | Config cross-imports; `game.ts` growth | Architecture | Low | Confirmed | Fix When Touched |
| F-18 | Slow test wall time (match soaks) | Dev iteration | Low | Confirmed | Fix When Touched |

---

## 6. Optimisation report

**Confirmed (measured headless)**

- Simulation + AI + physics: ~0.1 ms/tick (3v3), ~0.25 ms/tick (6v6), p99 under 1.1 ms, max under 6 ms. At 60 Hz that is < 1% of the frame budget. **Do not optimise the sim.**
- Heap: flat over 30 simulated minutes after forced GC. No leak in sim/AI/physics. The per-tick allocations listed in KNOWN_ISSUES (`probeGround` hits, event `vec3`s, `castRay` result objects) are short-lived and collected; they are young-generation churn, not growth.
- Startup: `PhysicsWorld(DEPOT)` 88 ms cold, nav grid 7 ms, build 862 ms, production boot to start screen 923 ms in headless Chromium (SwiftShader, local server).
- Bundle: 1.80 MB gzip total, 1.65 MB of it Rapier (F-05). `index` chunk 52 kB gzip, `three` 148 kB gzip.

**Likely (code evidence, no measurement)**

- GPU: MSAA at DPR 1.5 + 2048² PCF shadow pass every frame + view-model pass (F-04) is the largest unknown and the only plausible way the 60 FPS target is missed.
- Audio graph churn under full-auto fire from several bots (F-09).
- First-use shader compiles mid-match (F-10).

**Needs profiling (cannot be judged from code)**

- Draw calls per frame: map is 5 merged meshes (one per texture, `src/render/mapMeshes.ts:123–128`), BBs and puffs are instanced, but each character figure has several meshes with cloned materials and each replica/hand model is many primitives. Add `renderer.info` to the overlay (F-04) to get the number.
- Firefox audio and pointer-lock paths (`src/audio/sfx.ts` has a listener fallback; `src/input/pointerLock.ts:36–37` has a `unadjustedMovement` fallback). Both untested here.

**Explicitly not worth doing**

- `spawnBB`'s linear `find` over 256 slots (`src/sim/ballistics.ts:54`), `pickRetakers` O(n²), `firstCharacterHit` O(n·m): all measured inside the 0.1 ms tick.
- Replacing the nav grid with recast for performance: `findPath` is ~1 ms warm; the only reason to change it is elevation (F-01), not speed.

---

## 7. Root causes and high-leverage improvements

1. **The presentation layer is the untested layer, and it is where the next two phases happen.** One Playwright smoke test and one CI workflow (F-02, F-03) turn "did I break boot?" into a green tick. Cost: an afternoon. It also lets the critic agent verify presentation changes instead of scoring them from code.
2. **One unwritten decision (flat floors) sits under six subsystems.** Writing it down before M11 (F-01) either confirms the current simple design or starts the nav work early, when it is cheap.
3. **The 60 FPS target has no instrument.** Draw-call/triangle counts on the overlay plus a `?quality=` switch (F-04) give the owner a measurement loop on an iGPU laptop before the art pass adds cost.

Secondary: a `settings/storage.ts` with a version (F-08) and a `shell/` split of `game.ts` (F-17) are both best done as the first step of the Phase 4 settings screen rather than now.

---

## 8. Strong decisions to preserve

- Fixed-timestep simulation over plain data, with the player and bots sharing `PlayerCommand`, events cleared per tick, and presentation reading state only. This is why 294 tests and a 1800 s headless soak are even possible.
- Seeded RNG everywhere in the sim, `Math.random` only in audio, `?seed=` replay and the seed on the debug overlay.
- Headless bot-only Depot matches as guard tests (capture rate, friendly fire, spawn exit, ground contact). Keep them even though they are slow (F-18 says how to keep them out of the inner loop).
- Trimesh level colliders with `FIX_INTERNAL_EDGES` and the "never add cuboid level colliders" rule.
- Merged map meshes per texture with `matrixAutoUpdate = false`, instanced BBs and puffs, change-only DOM writes in the HUD, module-level scratch vectors in hot AI code.
- Vendor chunk splitting with enforced budgets in `vite.config.ts`.
- Defensive storage and pointer-lock code (every read in try/catch, re-lock failure explained to the player).
- The docs discipline: DECISIONS with dates and reasons, KNOWN_ISSUES classified, HANDOFF rewritten per session, critic scores logged. Most of this audit's "known" items were already in KNOWN_ISSUES, which is the best sign of a healthy process.

---

## 9. Runtime unknowns

- Real frame time and GPU time on the target iGPU laptop at each quality level.
- Whether shader compiles cause visible hitches on first fade / first flag round.
- Audio-thread behaviour under sustained full-auto fire in Firefox.
- Firefox pointer-lock re-lock behaviour after Esc (KNOWN_ISSUES says untested).
- Behaviour after a WebGL context loss.
- Long-session (hours) memory in the browser, including three.js and Web Audio objects, which the headless soak does not cover. The sim itself is clean.

---

## 10. Questions for the developer

1. **Elevation**: are ramps, stairs, platforms or vaulting in scope for v0.1's Depot rework or any v0.1 map? (Drives F-01.)
2. **Target machine**: which integrated-graphics laptop is the 60 FPS reference, and has a frame time ever been recorded on it? (Drives F-04.)
3. **Rapier compat**: happy to keep the base64-inlined compat build for v0.1, or should the plain WASM package be evaluated for the 1.2 MB saving? (F-05, fixed decision, so only you can reopen it.)
4. **Licence**: what licence should the repository carry? (F-16.)
5. **`?nolock` in preview builds**: is it acceptable to keep the unlocked-play flag available in production builds behind an explicit `VITE_ALLOW_NOLOCK` env (needed for a browser smoke test against the real build), or should the smoke test run against the dev server instead?
6. **Test split**: would a fast `npm test` (unit only) plus `npm run test:all` (with the match soaks) fit how you work with the critic gate?

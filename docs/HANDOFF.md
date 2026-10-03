# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · M18a (comfort and controls). The owner asked to wrap up here; M18b is next._

## Where we are

- **Phase 4 merged on `main`:** M12a–c weapon handling, M11 Depot rework, M15 menus, M15b (#18, #21), M13 audio (#19),
  M19 match info (#24), M17a Loadout slots and BBs (#25), M17b attachments (#26), and the owner's feature picks in the
  roadmap (#20, #22). The owner asked (2026-10-03) for all remaining Phase 4 milestones to be built, then to wrap up.
- **M18a is built** (its pull request; see REVIEWS for the critic): invert mouse, hold or toggle for aim and sprint
  (`AIM_MODES`, `SPRINT_MODES` in `config/controls.ts`, the rules in `PlayerInput`), fire and aim as rebindable
  actions with mouse buttons as binding codes (`Mouse0` … `Mouse4`, fed by `PointerLock` into `Keyboard.press/release`),
  sensitivity as cm/360 at a typed DPI plus "same as CS2 / Valorant" (`input/sensitivity.ts`, `ui/controlsSettings.ts`),
  and Reduced motion on the Accessibility tab (`config/accessibility.ts`, `Viewmodel.setMotion`, the lean roll in
  `cameraRig`), defaulting to the system's prefers-reduced-motion.
- **Next: M18b** (ROADMAP), then M20 custom matches, M21 practice range, M22 squad orders, M14 art pass, M16 tutorial.

## M18b: the plan so far (nothing built)

- **Colour-blind options:** Blue `#3d8bff` vs Orange `#ff8a2a` already stay far apart under simulated protanopia,
  deuteranopia and tritanopia (Machado 2009 matrices, CIE Lab ΔE 122 / 138 / 95) but differ little in lightness
  (L 59 vs 69). Plan: a Team colours picker, Standard and High contrast (dark blue vs light amber, ΔL > 30), with a
  unit test running that simulation over every set. Team colours flow through `TEAM_COLORS` / `TEAM_CSS`
  (`matchPresentation`, `flagRenderer`, `hitFeed`, `scoreboard`, `statsTable`, the viewmodel's team colour): pass the
  picked set in at Play rather than a global. Orange low-ammo also equals the Orange team colour. The spare-magazine
  gauges need a shape for "next" (a caret) and a pattern for "low" (stripes), always on (KNOWN_ISSUES).
- **Sound cues (opt-in):** a ring of direction wedges around the centre with a different shape per kind (steps, shots,
  hit calls), fed by the same events `Sfx.onEvent` gets; skip your own sounds and teammates' footsteps; pooled DOM.
- **Browser basics:** `visibilitychange` hidden → release the lock (or pause unlocked play); `webglcontextlost` →
  `preventDefault`, pause, show "Graphics reset", Three re-uploads on `webglcontextrestored` (test with
  `WEBGL_lose_context` in Playwright); a title-screen warning for a software renderer (SwiftShader, llvmpipe, Microsoft
  Basic Render Driver, or a `failIfMajorPerformanceCaveat` probe failing). The smoke test runs on SwiftShader, so the
  warning will show there (assert it). Fullscreen: a Graphics row and a rebindable key (F11 belongs to the browser).

## Working notes and gotchas

- **Settings tabs:** Controls is `ui/controlsSettings.ts`, Accessibility `ui/accessibilitySettings.ts` (M18b adds its
  rows there and removes the LATER rows from `SETTINGS_LATER`), Crosshair and Audio have their own modules.
- **Input:** read fire and aim through the bindings (`kb.isDown('fire')`), never the mouse directly. A toggled aim
  reads `canAimDownSights` (sim/aiming.ts), passed to `PlayerInput.update` each frame.
- **Loadout:** read `Armament.handling` for the fitted numbers (magazine, reload, draw, raise), never `replica.magSize`.
  Readouts on the Loadout screen come from the sim; keep them computed.
- **Lifecycle:** Play builds the session before asking for the mouse lock (audio unlock needs the click). Nothing is
  drawn while a menu is up. `PointerLock.request()` holds back `pointerlockerror` while a request is in flight.
- **Menus:** one screen at a time (`Menus.go`); text is set in capitals by CSS. `BUILD_LABEL` moves with each tag.
- **Parallel pull requests conflict** in `docs/DECISIONS.md`, `docs/REVIEWS.md`, `docs/KNOWN_ISSUES.md`, `docs/ROADMAP.md`,
  `game.ts`, `matchSession.ts`, `playerInput.ts` and the viewmodel. Merge `main` in and keep both sides, `main`'s first.
- **Checks:** `npm run check` (type check, tests, build). In a cloud container, run the smoke test with a temporary copy
  of `playwright.config.ts` whose `launchOptions.executablePath` is `/opt/pw-browsers/chromium` (don't commit it). The
  `e2e` build and the dev server expose `window.airsoft` (the Game). Playwright can't press side buttons: dispatch a
  `MouseEvent` with `button: 3` on `document` in unlocked play.
- **Ending a match quickly in a scratch script:** set `airsoft.state.round.score` to 4–4 and one team's characters'
  `status` to `'out'`.
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.

# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · branch `m12b-optics-ads` (Phase 4 M12b, critic 9.1 on attempt 3)._

## Where we are

- **Phase 3 is done and tagged** (`v0.1-alpha.3`). Phase 4 order (owner): M12a → M12b → M11 → M13 → art → menus and
  settings → tutorial. M12a is merged (PR #10).
- **The owner played M12a** and had one note: the crosshair tightened too slowly and smoothly when stopping; he wants an
  "instant lock". Fixed as the first commit here (`accuracy.steadyTime` 0.05 s, `lockTime` 0.015 s; the slower
  `settleTime` stays for `carryTime` after a sprint or a landing, tracked by `Character.shakeCarry`).
- **M12b is built** on `m12b-optics-ads` (pull request open for the owner): `config/optics.ts` (the red dot, zoom 1.25,
  `AIMING`), `Armament.optics` per slot with `fitOptic` (kept by `respawnCharacter`), `ReplicaConfig.opticMount` and
  `look.aimHold`, `sim/aiming.ts` (`stepAiming` before movement; aiming counts as walking), right button in
  `PointerLock.aimHeld`, `PlayerInput.aimSensitivity` (a multiple), `Renderer.setZoom`, the viewmodel's aiming hold and
  optic / flip-up sight parts (`RIFLE_OPTIC` in `replicaModels.ts`), the HUD red dot, and the Optic picker and Aiming
  sensitivity slider on the start screen. The game fits the picked optic at each round start (`ui/opticChoice.ts`).

## Next

1. **The owner's M12b playtest** (PLAYTEST.md: Movement, Optics and aiming down sights). Tune the zoom, raise time and
   default aiming sensitivity from his notes.
2. **M11 Depot rework** once the owner approves the layout sketch (a parallel thread is reworking it to be less
   symmetrical, with obvious lanes), then **M13** audio.

## Working notes and gotchas

- **The aimed view:** the aiming hold puts the optic's axis on the viewmodel camera's axis, and the HUD draws the dot at
  the screen centre. If the optic or the hold moves, keep `aimHold[1] = -RIFLE_OPTIC.axisUp` (a viewmodel test checks it).
  The receiver fills the bottom of the aimed view in greybox; the art pass can slim it.
- **Parallel pull requests conflict** in `docs/DECISIONS.md` and `docs/REVIEWS.md` (both append at the end). Merge
  `main` in and keep both sides, `main`'s lines first.
- **Measuring bots:** copy the top of `src/ai/depotMatch.test.ts` (up to the first `describe`) into a scratch test,
  add a test that writes JSON with `writeFileSync`, run it with `-t`, then delete it. Never commit it.
- **Bot-tuning numbers go stale:** re-measure the Attack / Defend guard after every attempt that touches bot behaviour
  (the instant lock changes bot accuracy too; all guards stayed green).
- **Checks:** `npm run check` (type check, tests, build). `npm run check:all` adds the browser smoke test (run
  `npx playwright install chromium` once per machine). In a cloud container with a preinstalled Chromium, run Playwright
  with a temporary copy of the config whose `launchOptions.executablePath` points at it (don't commit it). The smoke
  test now fits the red dot and aims; its screenshots (hip and aimed) land in `playwright-report/data/`.
- **Browser:** `npm run dev`, open `/?nolock` (dev or `build:e2e` only); `window.airsoft` is the Game.
- **Editing on the owner's PC:** there is no Python there; write small `.cjs` edit scripts with a quoted heredoc, or use
  the Edit tool.
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.

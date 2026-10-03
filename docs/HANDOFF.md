# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · branch `claude/project-thread-vkfuxy` (Phase 4 M12c, the owner's M12b notes; critic 9.0 on attempt 3)._

## Where we are

- **Phase 3 is done and tagged** (`v0.1-alpha.3`). Phase 4 order (owner): M12a → M12b → M11 → M13 → art → menus and
  settings → tutorial. M12a (PR #10) and M12b (PR #11) are merged.
- **The owner played M12b** ("red dot works great") and sent six notes; **M12c** answers them on this branch (pull
  request open for the owner): a **Loadout** box on the start screen (the optic and a hop-up dial per replica), shown on
  the title and result screens but not the pause screen (`ui/loadoutChoice.ts`); BB streaks that never reach back past
  the muzzle (`render/bbRenderer.ts`); both replicas held with no inward cant so BBs fly out along the barrel
  (`render/tracerLine.test.ts` checks it); and hop-up as `ReplicaConfig.hopUpMax` × a dial (`Armament.hopUps`,
  `setHopUps`, `sim/hopUp.ts` for the readout). Rifle factory 65% (on target to ~38 m), pistol 55% (~25 m); bots use
  the factory dials. Numbers in DECISIONS.

## Next

1. **The owner's M12c playtest** (PLAYTEST.md: BBs leaving the muzzle, Hop-up). Tune the factory dials from his notes.
2. **M11 Depot rework** (layout sketch approved by the owner, 2026-10-03: asymmetric, three lanes). A parallel thread
   ("Depot rework build") is building it on its own branch; it didn't touch replicas or ballistics, this branch didn't
   touch map files. Then **M13** audio.

## Working notes and gotchas

- **The barrel line:** BBs are drawn from the muzzle, blending onto the eye line, so on screen they run from the muzzle
  to the crosshair. That matches the barrel only while `look.hold.yaw` is 0 (no cant). The rifle keeps 0; the pistol
  has a slight 0.1 rad left lean at the owner's request (capped at 0.12 by `tracerLine.test.ts`).
- **Hop-up and bot balance:** the factory dials changed every BB's arc (the AEG was a fixed 0.14 lift, now 0.195).
  Re-measure the Attack / Defend guard after any hop change (all guards stayed green here).
- **The aimed view:** keep `aimHold[1] = -RIFLE_OPTIC.axisUp` (a viewmodel test checks it).
- **Parallel pull requests conflict** in `docs/DECISIONS.md` and `docs/REVIEWS.md` (both append at the end). Merge
  `main` in and keep both sides, `main`'s lines first.
- **Measuring bots:** copy the top of `src/ai/depotMatch.test.ts` (up to the first `describe`) into a scratch test,
  add a test that writes JSON with `writeFileSync` (Vitest hides `console.log` here), run it with `-t`, then delete it.
- **Checks:** `npm run check` (type check, tests, build). `npm run check:all` adds the browser smoke test. In a cloud
  container with a preinstalled Chromium, run Playwright with a temporary copy of the config whose
  `launchOptions.executablePath` points at it (`/opt/pw-browsers/chromium`; don't commit it).
- **Browser:** `npm run dev`, open `/?nolock` (dev or `build:e2e` only); `window.airsoft` is the Game (private methods
  such as `pause()` are callable from a script for screenshots).
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.

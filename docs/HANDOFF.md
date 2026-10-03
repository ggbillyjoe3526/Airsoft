# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · branch `claude/project-thread-1nyjk6` (Phase 4 M15 menus). The owner stopped work for
now at the end of this session ("wrap everything up cleanly")._

## Where we are

- **Phase 3 is done and tagged** (`v0.1-alpha.3`). On `main` since the tag (all merged 2026-10-03): M12a, M12b and
  M12c weapon handling, the pistol's slight left lean (#13) and the **M11 Depot rework** (#14).
- **M15 menus** (pulled forward by the owner ahead of M13, to his own design; concept sketch approved) is on this
  branch as pull request #15 for the owner (critic 9.1): title screen → New game (Mode and Difficulty pop-ups, Loadout and Settings
  screens), pause menu (Resume / Settings / Quit to title screen), result (Play Again / Change setup / Title screen),
  headings in capitals, unbuilt items greyed with LATER, render quality as a saved setting. Code in `src/ui/menus/`,
  placeholder data in `src/config/menus.ts`. Concept sketch: https://claude.ai/artifact/R6WwSeS2sXSAdqzzZBGSQt.

## Next (when the owner comes back)

1. **The owner merges the M15 pull request** (#15, if not done yet).
2. **The owner's playtest of the new Depot and the new menus** (PLAYTEST.md: "The Depot (M11 rework)" and
   "Menus (M15)"). His Depot feedback is still awaited; his M12c notes (hop-up good, pistol too straight) are done.
   Fix what he finds first.
3. **Then M13, the audio rework** (ROADMAP Phase 4, order M12 → M11 → M15 → M13 → M14 → M16). `ReplicaConfig.power`
   (electric / gas) is there for sound profiles by power source. Volume settings then fill the Audio tab's LATER rows.

## Working notes and gotchas

- **Menus:** one screen at a time (`Menus.go`); `menuNav.ts` decides Back and which menu opens when play stops.
  The loadout is only reachable through New game, so never mid-match; Quit to title screen ends the match
  (`Game.quitToTitle`). Text is set in capitals by CSS, so the code keeps normal case (and tests' accessible names
  use case-insensitive matches). `BUILD_LABEL` in `config/menus.ts` moves with each release tag (CLAUDE.md §7).
- **The barrel line:** BBs are drawn from the muzzle, blending onto the eye line. The rifle keeps hold yaw 0; the
  pistol leans 0.1 rad, and `tracerLine.test.ts` caps it.
- **Parallel pull requests conflict** in `docs/DECISIONS.md` and `docs/REVIEWS.md` (both append at the end). Merge
  `main` in and keep both sides, `main`'s lines first.
- **Measuring bots:** copy the top of `src/ai/depotMatch.test.ts` (up to the first `describe`) into a scratch test,
  add a test that writes JSON with `writeFileSync` (Vitest hides `console.log` here), run it with `-t`, then delete it.
- **Checks:** `npm run check` (type check, tests, build). `npm run check:all` adds the browser smoke test. In a cloud
  container with a preinstalled Chromium, run Playwright with a temporary copy of the config whose
  `launchOptions.executablePath` points at it (`/opt/pw-browsers/chromium`; don't commit it).
- **Browser:** `npm run dev`, open `/?nolock` (dev or `build:e2e` only); `window.airsoft` is the Game (private methods
  such as `pause()` are callable from a script for screenshots; set `unlockedPlay = false` first).
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.

# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · branch `claude/match-info-29vkrt` (match info, critic 9.0)._

## Where we are

- **Phase 4 so far:** M12a–c, M11, M15, M15b and M13 audio are merged. The owner asked (2026-10-03) for all remaining
  Phase 4 milestones to be built; the Loadout (M17a, M17b) is being built on its own branch in parallel.
- **M19 match info** (this branch, critic 9.0 at attempt 1; M18 before the owner's second batch, #22, renumbered it).
  It also covers the second batch's additions: the hold-Tab scoreboard, round and match numbers, local records.
  - Stats: `stats/matchStats.ts` (from tick events, in `MatchSession.afterTick`), tables from `ui/statsRows.ts` (pure)
    and `ui/statsTable.ts`; the board over the field is `ui/matchBoard.ts` (Tab held, between rounds, match over).
  - Hit feed `ui/hitFeed.ts`, teammate markers `ui/teammateMarkers.ts` (both driven by `MatchPresentation`).
  - Summary screen `ui/menus/summaryScreen.ts` before the result; records `stats/records.ts` under `airsoft.records`,
    added once per finished match by `Game.pause` (`MatchSession.takeMatchResult`).
  - Crosshair: `ui/crosshair.ts` (element, style, load), Settings → Crosshair `ui/crosshairSettings.ts`, tuning in
    `config/matchInfo.ts`. The default is the old crosshair.
- **Next (ROADMAP order):** M18 comfort and accessibility, M20 custom matches, M21 practice range, M22 squad orders,
  M14 art, M16 tutorial.

## Working notes and gotchas

- **Settings tabs:** match info added its own Crosshair tab (`SETTINGS_TABS`), away from Controls, which M18 fills.
  The scoreboard is a new rebindable action (`scoreboard`, Tab).
- **Parallel pull requests conflict** in `docs/DECISIONS.md`, `docs/REVIEWS.md`, `docs/KNOWN_ISSUES.md` (all append at
  the end), `docs/ROADMAP.md` and the menus. Merge `main` in and keep both sides, `main`'s lines first.
- **Checks:** `npm run check` (type check, tests, build). In a cloud container, run the smoke test with a temporary copy
  of `playwright.config.ts` whose `launchOptions.executablePath` is `/opt/pw-browsers/chromium` (don't commit it); use
  another port if two run at once. The `e2e` build and the dev server expose `window.airsoft` (the Game).
- **Ending a match quickly in a scratch browser script:** set `airsoft.state.round.score` to 4–4 and one team's
  characters' `status` to `'out'`; the summary screen follows a moment later.
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.

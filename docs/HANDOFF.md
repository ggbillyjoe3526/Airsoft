# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · branch `claude/project-thread-p14he8` (Phase 4 M11 Depot rework; critic 9.0 on attempt 2)._

## Where we are

- **Phase 3 is done and tagged** (`v0.1-alpha.3`). Phase 4 order (owner): M12a → M12b → M11 → M13 → art → menus and
  settings → tutorial. M12a, M12b and M12c (the owner's M12b notes, hop-up dials) are merged.
- **M11 is built** on this branch (pull request open for the owner), from the layout sketch he approved
  (https://claude.ai/artifact/L3rfDSHNN6SN2YyZTFLKdD, revision 2): `map/depot.ts` is written in plan coordinates
  (north = +z, as drawn) and mirrored to world coordinates at the bottom of the file. One pole (`MapData.flag`) at
  end 1. Spawns, dead zones and lanes are per **end** (0 west, 1 east); `round.ts` `teamEnd` / `placeTeams` put teams at
  ends each round and swap them after `ROUNDS.halfTimeAfter` (4) in both modes; `Character.end` drives dead zones and
  bot lane direction (`BotController.measureEnds`). Attackers always start west; in Elimination Blue starts east
  (`ROUNDS.eliminationFirstEnd`).
- `map/depot.test.ts` checks the layout in 3D from the nav grid (sightlines, spawns hidden, the pole, lanes, dock).
- Bot balance (96 seeds, with hop-up): Attack / Defend attackers 50%; Elimination east end 54%. Numbers in DECISIONS.

## Next

1. **The owner's M11 playtest** (PLAYTEST.md: The Depot). Tune from his notes: lanes, the dock, which end feels strong.
2. **M13** audio rework (tune echoes and muffling on the new buildings), then M14 art.

## Working notes and gotchas

- **Editing Depot:** work in plan coordinates; `toWorld` negates z (and flips ramp rises and spawn yaw). Test
  coordinates in `depot.test.ts`, `ai.test.ts` and `depotMatch.test.ts` are world coordinates. Cover must be 1.2 m
  (crouch) or ≥ 2.4 m (full); the layout tests find slits, long lines and climbable cover, so fix geometry, not tests.
- **Ramps:** keep the stepped kerbs on a ramp's open side (DECISIONS); without them characters leave the ground at the
  ramp foot. The headless matches assert the longest time off the ground stays within `airSpreadDelay`.
- **The ground probe** now runs on every tick a character isn't rising (`sim/movement.ts`), after a one-off Rapier
  shape-cast miss on a ramp. If landings ever feel odd (hanging on edges), look there first.
- **Measuring bots:** copy the top of `src/ai/depotMatch.test.ts` (up to the first `describe`) into a scratch test,
  add a test that writes JSON with `writeFileSync`, run it with `-t`, then delete it (it breaks `tsc` while in `src`).
  Run several seed ranges in parallel processes; 96 seeds of both modes take about 2 minutes on 4 cores.
- **Parallel pull requests conflict** in `docs/DECISIONS.md`, `docs/REVIEWS.md` and the ROADMAP status table. Merge
  `main` in and keep both sides, `main`'s lines first.
- **Checks:** `npm run check` (type check, tests, build). `npm run check:all` adds the browser smoke test. In a cloud
  container with a preinstalled Chromium, run Playwright with a temporary copy of the config whose
  `launchOptions.executablePath` points at `/opt/pw-browsers/chromium` (don't commit it).
- **Browser:** `npm run dev`, open `/?nolock` (dev or `build:e2e` only); `window.airsoft` is the Game.
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.

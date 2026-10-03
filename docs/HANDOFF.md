# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-03 · branch `m12a-weapon-handling` (Phase 4 M12a, critic 9.0 on attempt 1)._

## Where we are

- **Phase 3 is done and tagged** (`v0.1-alpha.3`, 2026-10-03). The owner's playtest notes became M12 (weapon
  handling) and M13 (audio) in Phase 4; the owner picked weapon handling first: M12a → M12b → M11 → M13 → art →
  menus and settings → tutorial.
- **M12a is built** on `m12a-weapon-handling` (pull request open for the owner): fire selector (`fireModes`,
  `defaultFireMode`, B key, `fireMode` event, HUD box), burst of 3 per pull, reloads 1.8 s / 1.2 s, toggle crouch in
  `PlayerInput` with a Toggle / Hold picker on the start screen, `Character.stillTime` steadying the spread to ×0.7,
  walk ×1.15, and `src/settings/storage.ts` (one versioned `airsoft.settings` object, audit W-02).
- The critic runs on Opus (`.claude/agents/critic.md`). The owner plays on an RTX 5090 desktop; the iGPU 60 FPS
  target is a Beta item. The owner is new to GitHub: explain in plain words and say exactly what to click.

## Next

1. **The owner's M12a playtest** (PLAYTEST.md: Movement, Shooting and reloads). Watch for Normal bots feeling deadlier
   (they get the steadier aim too; KNOWN_ISSUES).
2. **M12b:** the red dot comes off the AEG model (flip-up iron sights instead), an optic slot fitted from a simple
   pre-match option, aiming down sights only with an optic (right mouse held), and an aiming sensitivity setting
   (add a `SettingField` in `src/settings/storage.ts`).
3. **M11 Depot rework** once the owner approves the sketch (https://claude.ai/artifact/L3rfDSHNN6SN2YyZTFLKdD), then **M13**.

## Working notes and gotchas

- **Parallel pull requests conflict** in `docs/DECISIONS.md` and `docs/REVIEWS.md` (both append at the end). Merge
  `main` in and keep both sides, `main`'s lines first.
- **Measuring bots:** copy the top of `src/ai/depotMatch.test.ts` (up to the first `describe`) into a scratch test,
  add a test that writes JSON with `writeFileSync`, run it with `-t`, then delete it. Never commit it. To prove a
  change leaves Depot alone, dump the cover lists and a few fixed-seed `playMatch` results before and after, and `cmp`.
- **Bot-tuning numbers go stale:** re-measure the Attack / Defend guard after every attempt that touches bot behaviour.
- **Elevation:** walkable surfaces never overlap; ramps ≤ `PHYSICS.maxRampSlope` (1:2); raised edges can stay open
  (bots check `dropOnLine`). Raised floors cast no shadow yet (KNOWN_ISSUES).
- **Checks:** `npm run check` (type check, tests, build). `npm run check:all` adds the browser smoke test (run
  `npx playwright install chromium` once per machine). GitHub runs both on every pull request and every push to
  `main`. In a cloud container with a preinstalled Chromium, run Playwright with a temporary copy of the config whose
  `launchOptions.executablePath` points at it (don't commit it).
- **Balance guards are noisy on 16 seeds:** when one trips after a bot change, measure over more seeds (e.g. 1–48, a
  temporary `S0`/`S1` loop) before and after, in two checkouts (`git worktree`), before moving a threshold.
- **Browser:** `npm run dev`, open `/?nolock` (dev or `build:e2e` only); `window.airsoft` is the Game. To view Ramp Yard,
  temporarily import `RAMP_YARD` in place of `DEPOT` in `src/main.ts` (don't commit it).
- **Editing on the owner's PC:** there is no Python there; write small `.cjs` edit scripts with a quoted heredoc, or use
  the Edit tool. `.claude/launch.json` (git-ignored) runs "dev" on port 5173 for the browser pane.
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.

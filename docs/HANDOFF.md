# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-02 · branch `elevation/c05` (its pull request is stacked on PR #4's branch `audit-fixes/now`)._

## Where we are

- **Fable audit** (`audit/`, merged): no stop-the-line bugs. All of its Fix Now / Fix Soon items are done:
  - PR #3 (merged): browser smoke test (`e2e/boot.spec.ts`) and the GitHub checks workflow (C-02, C-03).
  - PR #5 (merged): roadmap updated from the audit; `docs/PLAYTEST.md`, the owner's playtest guide.
  - PR #4 (open, green, 9.1): in-air spread waits 0.1 s off the ground unless you jump (C-01);
    `?quality=low|medium|high` presets and GPU numbers on the overlay (C-04).
  - Elevation support (C-05, this branch): `ramp` blocks, one floor height per nav cell, cover and
    walk-offs at height, bots that never sidestep off an edge, ramps at most 1:2. Ramp Yard (`src/map/testYard.ts`)
    is the test map; no shipped map uses elevation yet.
- **The owner wraps up Phase 3 without the Depot rework**: M11 moved to the start of Phase 4 (owner, 2026-10-02).
  `v0.1-alpha.3` is the game as merged, after the owner's bug pass. **Don't tag it**; the owner tags when ready.
- The critic runs on Opus (`.claude/agents/critic.md`, owner's call).
- The owner plays on a high-end desktop (RTX 5090), not a laptop; the iGPU 60 FPS target is a Beta item.
- The owner is new to GitHub: explain each pull request in plain words and say exactly what to click.

## Next

1. **Bug pass for `v0.1-alpha.3`**: the owner plays `docs/PLAYTEST.md` on `main` once PR #4 and the elevation
   pull request are merged, and posts problems in the project chat. Fix them on a new branch, one pull request.
2. **Phase 4, M11 Depot rework**: the layout sketch (https://claude.ai/artifact/L3rfDSHNN6SN2YyZTFLKdD: loading
   docks with 1:2 ramps, a workshop, barricades with ports, stacked divider containers) waits for the owner's
   approval. Then build it, re-measure the bot guards on the new layout, and add a playtest section for it.

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
  `npx playwright install chromium` once per machine). GitHub runs both on every pull request.
- **Browser:** `npm run dev`, open `/?nolock` (dev or `build:e2e` only); `window.airsoft` is the Game. To view Ramp Yard,
  temporarily import `RAMP_YARD` in place of `DEPOT` in `src/main.ts` (don't commit it).
- **Editing on the owner's PC:** there is no Python there; write small `.cjs` edit scripts with a quoted heredoc, or use
  the Edit tool. `.claude/launch.json` (git-ignored) runs "dev" on port 5173 for the browser pane.
- **Git:** new branch from the latest `main`, push, open a pull request; the owner merges. Never push to `main`, merge a
  pull request, or create or move tags. Install with npm 11 (`npx -y npm@11 install`) so the lockfile keeps its `libc` fields.

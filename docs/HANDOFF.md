# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-02 · `main` (the code bug pass was committed straight to `main` at the owner's request; no
other branches are left on GitHub)._

## Where we are

- **Phase 3 is built.** M7–M10, the code review pass, the Fable audit fixes (C-01 to C-05, PRs #3–#6, all merged)
  and elevation support are on `main`. Ramp Yard (`src/map/testYard.ts`) is the elevation test map; no shipped
  map uses elevation yet.
- **Code bug pass done (2026-10-02, critic 9.0 on attempt 2):** three reviewers read all of `src/` (sim/physics/config/map,
  AI/nav, and game/render/UI/input/audio, with headless soaks and a Chromium run); 9 bugs fixed with tests (see
  ROADMAP, Phase 3 bug pass). Smaller leftovers went to KNOWN_ISSUES ("Bug pass 2026-10-02").
- The Attack / Defend balance guard was re-measured over seeds 1–48 (attackers 53%); its ceiling is now 67% because
  the 16 guard seeds read high (63%). See DECISIONS.
- **Merged branches deleted:** `audit-fixes/ci-smoke-test`, `audit-fixes/now`, `docs/pull-request-workflow`,
  `docs/roadmap-audit`, `elevation/c05` (all fully in `main`).
- **The owner playtests next** (`docs/PLAYTEST.md`, all sections, plus its new "Fixed in the code bug pass" list) and
  then decides whether to tag `v0.1-alpha.3`. **Don't tag it**; the owner tags.
- The critic runs on Opus (`.claude/agents/critic.md`). The owner plays on an RTX 5090 desktop; the iGPU 60 FPS
  target is a Beta item. The owner is new to GitHub: explain in plain words and say exactly what to click.

## Next

1. **The owner's playtest** of `main`. Fix what they post, as a pull request (the direct-to-`main` commit was a one-off
   for this bug pass; CLAUDE.md's pull-request rule still holds).
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

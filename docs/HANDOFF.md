# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-02 · `main` pushed with "Phase 3 M10 (WIP)": built and passing checks, but **not accepted yet**._

## Where we are

- **M10 movement and positioning: attempt 1 scored 7.9 → Rework.** The session ended (owner's usage limit)
  before the fixes. Phase 3 so far: M7 leaning 8.6, M8 magazines 8.7, M9 BB physics 8.5.
- What M10 built (details in DECISIONS, 2026-10-02 M10 entries):
  - `sim/accuracy.ts`: spread × a stance and movement multiplier (`MOVEMENT.accuracy`), with a crosshair that opens to 2σ.
  - Bots lean round wall corners: `ai/cover.ts` corner spots, `leanSideToSee`, and `CoverWorld`.
  - The bot friendly-fire check reaches 15 m past the target.
- `npm run check` passes (286 tests). Browser-checked crosshair gaps: 8.5 px still, 22 px running, 5.5 px crouched, 38 px in the air.
- **The owner hasn't played M7–M10 yet** (they chose to build M10 first). Ask about leaning, magazines, BB drop
  and now the crosshair and corner-peeking bots.

## Next: M10 attempt 2 (the critic's must-fixes)

1. **`ai/botCombat.ts` `shootBot`:** `friendInLine(..., dist + cfg.friendlyBeyondTarget)` ignores walls, so a bot
   holds fire for a teammate behind a wall past the target. Cap the extra distance at the first static hit
   (`w.query.raycastStatic(eye, aimDir, …)`).
2. **`ai/cover.ts`:** hoist the per-call allocations (`spot = vec3()` in `findCover`, the `[1, -1]` side list in
   `leanSideToSee`, the tuples and destructuring in `cornerSpots`). Measure the cost of a cover search on Depot.
   Replace the bare `1e-6`s with a named epsilon.
3. **`ai/botBrain.ts` `leansOutHere`:** it sets `cover.lean = 0` when neither side sees the threat, so mid-episode
   the spot becomes a non-lean spot (arrival radius 0.2 → 0.9 m, the bot crouches). Decide the behaviour
   (probably end the episode: `done = true`) and add a test.
4. **`render/combatPresentation.ts`:** `domElement.clientHeight` is read every frame after a style write. Cache it on resize.
5. Then re-run `npm run check` and the critic (attempt 2). If it's accepted, add the REVIEWS line, set ROADMAP to done,
   commit and push.

Still open from the critic (in KNOWN_ISSUES): bots favour corners over crates (271 vs 35 picks in four matches),
and bot-only Attack / Defend sits at 59% attacker wins.

## Working notes and gotchas

- **Measuring bots:** copy `ai/depotMatch.test.ts` or `ai/ai.test.ts` to a scratch `*.test.ts` and write numbers
  with `writeFileSync` (vitest hides console output of passing tests). Delete it afterwards; never commit it.
- **Context hygiene (CLAUDE.md §8):** one milestone per session. Read files in ranges and filter output.
- **Git:** commit and push to `main`. Never create or move tags. Commits are unsigned; that's fine.
- **Checks:** `npm run check` runs the type check, tests and build. There is no Python on this PC.
- **Browser:** `.claude/launch.json` (git-ignored) runs "dev" on port 5173. Open `/?nolock`; `window.airsoft` is
  the Game. Use `find` for the "Click to play" ref every time. A background tab steps the sim late.
- **Editing:** don't use sed with `|`, `#` or backticks in the text (use another delimiter or the Edit tool).

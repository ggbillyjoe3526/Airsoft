# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-02 · `main` pushed and clean after "Phase 3 M9: BB physics pass"._

## Where we are

- **`v0.1-alpha.2` is tagged.** Phase 3 (`v0.1-alpha.3`) is under way:

  | Milestone | Critic score |
  |---|---|
  | M7 leaning (hold Q / E) | 8.6 |
  | M8 magazines (a pouch of mags, swap in the fullest, no topping up) | 8.7 |
  | M9 BB physics (joules + BB weight; drag ~60% of real; AEG flat to 20 m, −43 cm at 35 m) | 8.5 |

- **Next: M10, movement and positioning** (ROADMAP → Phase 3 → M10). Then M11, the Depot rework, and the
  Phase 3 bug pass.
- **The owner hasn't played M7–M9 yet.** Ask first, and act on the answers:
  - Leaning: does the ease and the small view roll feel right? Is the slow-down OK? Does a wall cutting a
    lean mid-strafe jolt the view?
  - Magazines: is 4 per replica a noticeable limit? Does the "No fuller magazine" refusal make sense?
    Are the gauges readable?
  - BB physics: is the AEG's drop at 30–35 m readable? Is the pistol too weak past 20 m?

## M10: notes for the start

- **Accuracy by stance and movement** (standing or crouched still = steady; running, jumping, just after
  sprinting = not):
  - Shot spread is a fixed `replica.spreadDeg` today (`sim/armament.ts` `fire`).
  - Add a spread multiplier from the shooter's state, computed in `sim/simulation.ts` where the muzzle is
    built, with the values in config.
  - Bots already have their own aim error for moving (`aimErrorMovingDeg`); keep the two consistent.
- **Bots learn to lean** around full-height corners. Today they only crouch-peek over low cover
  (`ai/botBrain.ts` cover modes), and at full-height cover they wait and move on (KNOWN_ISSUES).
  Leaning: `cmd.lean`, `sim/lean.ts`; bots set `cmd.lean = 0` in `thinkBot`.
- **Seeded bot matches will shift.** Re-measure the Attack / Defend guard (`ai/depotMatch.test.ts`,
  16 seeds) and the difficulty numbers, then update DECISIONS.
- **Process:** state Goal / Approach / Risks, build, verify, then run the critic. The critic report is
  capped at about 300 words now.

## Working notes and gotchas

- **Context hygiene (CLAUDE.md §8):** one milestone per session. After it's accepted and pushed, rewrite
  this file and tell the owner to start a fresh session. Read files in ranges and filter output.
- **Git:**
  - Commit and push to `main` after each accepted change.
  - Never create or move tags; the owner tags full releases only.
  - Commits from this PC are unsigned. That's fine; don't raise it.
  - The author is set repo-locally to "Claude <noreply@anthropic.com>".
- **Checks:** `npm run check` runs the type check, tests and build.
- **Browser checks:**
  - `.claude/launch.json` (git-ignored) runs `npm run dev -- --port 5173 --strictPort` as "dev".
  - Open `/?nolock` to play without pointer lock. In dev, `window.airsoft` is the Game.
  - Use `find` for the "Click to play" ref every time; refs change between loads.
  - `g.frame(t)` with increasing `t` steps frames by hand. Set `g.unlockedPlay = false` to pause the sim
    while still rendering.
  - `g.input.fireLatch = true` fires; synthetic `KeyboardEvent`s with `code` drive the keys.
- **Editing:** don't use `perl s|…|…|` or sed when the text contains `|`, `#` or backticks; it broke files
  several times. Use the Edit tool.
- **Soak testing:** a scratch soak (long headless matches checking invariants) found real bugs before
  alpha.2. Redo it in the Phase 3 bug pass. Keep it outside `src/`; it's not committed.

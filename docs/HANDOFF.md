# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-02 · mid-session: M7b and M8 pushed; M9 (BB physics) next._

## Where we are

- **`v0.1-alpha.2` is tagged.** The owner playtested it and asked for leaning; any other feedback comes first.
- **Phase 3, M7 (leaning) is done:**
  - Hold Q / E to peek left / right (critic 8.6).
  - Replicas switch with 1, 2 or the mouse wheel; the owner confirmed the wheel stays.
  - The owner hasn't played the lean yet. Ask how it feels, especially the items below.
- **Next: M8, magazines and reloads** (ROADMAP → Phase 3 → M8).

## Leaning: what to ask the owner

- Does the 0.18 s ease and the small view roll feel right?
- Does the slow-down to walking pace feel OK?
- Does a wall cutting a lean mid-strafe jolt the view? (KNOWN_ISSUES)
- After releasing Q / E with sprint held, there's a short delay before sprinting again. Noticeable?

Tune in config: `HITS.lean`, `MOVEMENT.leanTime`, `MOVEMENT.leanQuietFrom`, `RENDER.leanCameraRoll`.

## M8: magazines (built this session; see DECISIONS)

Built: a pouch of magazines per replica (AEG 4 × 60, pistol 4 × 18). A reload swaps in the fullest spare
and the old mag goes back as it is. The HUD has spare-mag gauges and a "No fuller magazine" notice.
Decisions are in DECISIONS (2026-10-02). The rest of Phase 3 follows: M9 BB physics, M10 movement and
positioning, M11 Depot rework, then the bug pass.

## Working notes and gotchas

- **Git:**
  - Commit and push to `main` after each accepted change (the v0.1 cycle).
  - Never create or move tags; the owner tags full releases only.
  - Commits from this PC are unsigned. That's fine; don't raise it.
  - The author is set repo-locally to "Claude <noreply@anthropic.com>".
- **Checks:** `npm run check` runs the type check, tests and build.
- **Headless match tests are seeded and deterministic.** Any change to bot behaviour reshuffles their
  outcomes, so re-measure the Attack / Defend guard (`ai/depotMatch.test.ts`, 16 seeds) and update
  DECISIONS with it. M7b didn't change them, because bots never lean.
- **Browser checks:**
  - `.claude/launch.json` (git-ignored) runs `npm run dev -- --port 5173 --strictPort` as "dev";
    recreate it on a new machine.
  - Open `/?nolock` to play without pointer lock. In dev, `window.airsoft` is the Game.
  - The pane throttles frames while hidden; `g.frame(t)` with increasing `t` advances it by hand.
  - Set `g.unlockedPlay = false` to pause the simulation while still rendering (useful for posing
    characters).
  - Synthetic `KeyboardEvent`s with `code` drive the keys.
- **Editing:** don't use `perl s|…|…|` or sed when the pattern contains `|` or backticks; it corrupted
  files twice. Prefer the Edit tool.
- **Soak testing:** a soak (many long headless matches checking invariants) found real bugs before
  alpha.2. It was a scratch test, not committed; redo it in each alpha build's bug pass.

# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-02 · `main` pushed at "Phase 3 code review pass". Working tree clean, no stashes._

## Where we are

- **The critic is stricter now** (owner, 2026-10-02): < 8.0 Restart, 8.0–8.9 Rework, 9.0+ Accept, up to
  **4 attempts** (attempt 4 auto-accepts at 8.0+). CLAUDE.md §12 and `.claude/agents/critic.md` say so.
- **M10 movement and positioning: done** (8.4, auto-accepted on attempt 4): spread by stance and movement,
  a 2σ crosshair, bots leaning round corners, a friendly-fire check past the target.
- **Code review pass: done** (8.4, auto-accepted on attempt 4; attempt 1 restarted). Fixed: the bot route
  planner's round-robin (a bot could be starved), the HUD low-ammo colour on a replica switch, low cover in
  the friendly-fire check. Also a **fresh seed each page load** (owner approved; `?seed=N` replays one, F3 shows it).
- Bot-only Attack / Defend (16 seeds) now: 20 captures in 114 rounds, flags raised in 13 of 16 matches, attackers 56%,
  **1 friendly hit, the guard's limit**. Any bot change that adds one fails `depotMatch.test.ts` (see KNOWN_ISSUES).
- **The owner hasn't played M7–M10 yet.** Ask about leaning, magazines, BB drop, the crosshair and corner-peeking bots.

## Next: M11 Depot rework (ROADMAP Phase 3)

Barricades with shooting ports, a second building, choke points and flanks, clear spawns and dead zones,
maybe low vaulting obstacles (owner idea), mirror-symmetric. Start by proposing a layout sketch to the
owner before building it: it's a big, visible change. Keep the ground-contact guard green if ramps or
stairs appear, and re-measure the bot guards (lanes and cover change with the map).

Beta work found on the way (in KNOWN_ISSUES): the burst pause freezing while the line is blocked (fixing it
pushes attackers to 62%), and a friendly-fire margin that should widen with distance and spread.

## Working notes and gotchas

- **Measuring bots:** add a temporary `writeFileSync` line to a copy of the test (vitest hides console output of passing
  tests), run only that test with `-t`, then restore the file. Never commit it. To find an incident, log it from
  `playMatch`'s event loop (seed, time, positions).
- **Bot-tuning numbers go stale:** re-measure the Attack / Defend guard after *every* attempt that touches bot
  behaviour, not just the first, and update the guard comment, DECISIONS and KNOWN_ISSUES together.
- **Editing:** don't put backticks or `\n` inside shell strings (bash eats them); write a small `.cjs` edit script in the
  scratchpad with a quoted heredoc, or use the Edit tool.
- **Checks:** `npm run check` runs the type check, tests and build. There is no Python on this PC.
- **Browser:** `.claude/launch.json` (git-ignored) runs "dev" on port 5173. Open `/?nolock`; `window.airsoft` is the
  Game. Use `find` for the "Click to play" ref. While the pane is hidden, animation frames don't run: call
  `airsoft.combat.frame(0, 0, 0, 0)` to update the HUD by hand.
- **Git:** work on a new branch from the latest `main`, push it, and open a pull request; the owner reviews and merges
  it. Never push to `main` or merge a pull request. Never create or move tags. Commits are unsigned; that's fine.

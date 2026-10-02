# Handoff

Where the last session left off, for whoever picks the work up next (a new session, another machine, or
the cloud). **Read this first, then CLAUDE.md, `docs/ROADMAP.md` and `git log`.** Rewrite it (don't
append) at the end of every session; keep it to about a screen. Status lives in the roadmap and decisions
in DECISIONS: this file is for the working context those don't hold.

_Last updated: 2026-10-02 · `main` at 2fa8662, pushed, clean._

## Where we are

- **`v0.1-alpha.2` is tagged** (Phase 2: Elimination and Attack / Defend on Depot). The owner is
  playtesting it; act on their feedback before starting new work.
- **Phase 3 has started.** M7a is done: the swap key (Q) is removed, and replicas switch with 1, 2 or the
  mouse wheel.
- **Next: M7b, leaning** (hold Q / E to peek left / right). The design is in ROADMAP → Phase 3 → M7.

## M7b: notes for the implementation

These were worked out at the end of the last session and aren't in the roadmap:

- **Input and commands:**
  - Add `leanLeft` / `leanRight` (KeyQ / KeyE) to `config/controls.ts` (DEFAULT_BINDINGS and REBINDABLE),
    the start-screen controls list and the README controls table.
  - Add `lean` (-1..1) to `PlayerCommand`, filled in `input/playerInput.ts`; bots leave it at 0.
- **Simulation:**
  - Give `Character` `lean` and `prevLean`.
  - Add a new pure `sim/lean.ts`: hold-to-lean easing, no lean in the air, and a wall clamp using
    `WorldQuery` rays sideways from the upright eye and shoulder.
  - While leaning, you count as walking (slow and quiet) and can't sprint (`sim/movement.ts`).
- **One lean geometry for everything:**
  - The upper body rotates about the hips: the pivot is at FIGURE.hipHeight (0.92 m) standing and
    0.30 m crouched (hip minus crouchDrop), with a maximum angle of about 0.6 rad.
  - The eye, BB origin, hit volume, figure tilt and bot sample points all use it.
  - Put the numbers in config (BODY, or a LEAN block that HITS references), and add a test that the
    figure and hit volume agree.
- **Eye position:** add a helper and use it in `sim/simulation.ts` (the muzzle), `ai/perception.ts`
  `eyeOf`, `render/cameraRig.ts` (plus camera roll) and `render/spectatorCamera.ts`.
- **Hit volume:** change `sim/hitbox.ts` to a `HitVolume { body, head, chest }`. The head and a chest
  sphere at shoulder height move with the lean, and the body capsule's top lowers as you lean. Callers:
  `sim/bbs.ts`, `ai/botCombat.ts` (`friendInLine`) and `hitbox.test.ts`.
- **Bots:** `ai/perception.ts` `bodyPoint` applies the lean shift, so bots see and aim at the
  poking-out head and shoulder.
- **Figure:** `render/characterRenderer.ts` adds the lean to `upper.rotation.z` (+Z tips the top to the
  left, so lean right is negative), on top of the flinch.
- **Process:** this is a feature, so it goes through the critic (CLAUDE.md §12).

## Open with the owner

- Replica switching: 1, 2 and the mouse wheel (owner confirmed the wheel stays, 2026-10-02).
- Vaulting is parked for the M11 Depot rework.

## Working notes and gotchas

- **Git:**
  - Commit and push to `main` after each accepted change (the v0.1 cycle).
  - Never create or move tags; the owner tags full releases only.
  - Commits from this PC are unsigned. That's fine and the owner chose it; don't raise it.
  - The author is set repo-locally to "Claude <noreply@anthropic.com>".
- **Checks:** `npm run check` runs the type check, tests and build.
- **Headless match tests are seeded and deterministic.** Any bot change reshuffles their outcomes, so
  re-measure the Attack / Defend guard (`ai/depotMatch.test.ts`, 16 seeds) and update DECISIONS with
  it, rather than loosening bounds blindly.
- **Browser checks:**
  - `.claude/launch.json` (git-ignored, machine-specific) runs `npm run dev -- --port 5173 --strictPort`
    under the name "dev"; recreate it on a new machine.
  - Open `/?nolock` to play without pointer lock. In dev, `window.airsoft` is the Game.
  - The browser pane throttles frames while hidden; a screenshot forces some.
- **Editing:** don't use `perl s|…|…|` (or sed) when the pattern contains `|` or backticks; it corrupted
  files twice. Use the Edit tool for anything non-trivial.
- **Soak testing:** a soak (many long headless matches checking invariants) found the bot friendly-fire
  bug before alpha.2. It was a scratch test, not committed; worth redoing before each alpha build's bug
  pass.

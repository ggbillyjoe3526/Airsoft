# IM7 · Fuller bug reports, and Report a Bug (owner, 2026-10-12)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 36 s | ✓ 164 s (fast) | ✓ 847 s | ✓ 1690 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h 20 min | QA 40k, changelog 30k, critic 91k |

The critic's three notes (a doc comment naming a method that doesn't exist, the crouched threshold inline, a comment
overstating what a repeated warning costs) were fixed in the records commit; no behaviour changed.

## Decisions

- **Report a Bug is a link to GitHub's new-issue address with `title` and `body`.** No token and no server; a link opens a tab with no pop-up blocker in the way, and GitHub keeps the address through a sign-in.
- **Over 8,000 characters the report is cut: the lists' oldest entries (to 10, 3, then 0), then the Settings and Dev settings fields, then its last lines; the whole report is copied to paste in.** GitHub refuses addresses a little above 8,000 characters; the copy is only made when something was cut, so the clipboard isn't overwritten otherwise.
- **Web addresses in stacks and messages are cut to their file names, in every report.** A report can now go into a public issue, and a page opened from a folder would show the player's user name; the build names the files.
- **The event log keeps shots and hits for everyone, the player's own reloads, draws, fire modes, dry fires and torch, bot mode changes and the round's events; a character's burst of shots or a flapping bot counts up one line (looking back past other shots and mode changes, 8 lines at most).** Footsteps, impacts and bots' reloads would fill 30 lines in a second of a busy fight.
- **Frame timing runs on play time, not the clock.** A report made from the pause menu then still sums up the play before it.
- **The console is tapped by `src/consoleLog.ts`, imported first by `main.ts`.** So warnings logged while the other modules load (a pool.md row the game can't read) are kept too.
- **Report a Bug stays where Diagnostics was (Settings › Dev) and goes on the crash pane; it is not on the pause menu.** The owner asked for it beside Copy; moving it is an easy later change.
- **Main game file: 977.7 kB of 1,000 after merging main (985.5 before this task, on the main it branched from).** No budget change needed.

## Known issues left

- None.

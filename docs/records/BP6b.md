# BP6b · Beta 1 bug pass: bots, modes, round flow and maps

**Review:** 2 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 1 | Opus 5.5 (bug pass thread) | ✓ 36 s | ✓ 227 s (fast) | ✗ 1874 s (ammo panel read 60 for 200 at 1920 and 2560; Woodland 5v5 draw-call test timed out) | – not required | ✗ | ✗ | – gate failed | Smoke ran beside four browser matches on the same machine (QA reran it clean five times); the scope gate saw the worktree's `node_modules` link; no changelog line yet | ~5 h (balance report, 128-match soak, 14 browser matches) | QA, performance, changelog (totals not kept) |
| 2026-10-18 | 2 | Opus 5.5 (bug pass thread) | ✓ 35 s | ✓ 186 s (fast) | – skipped (`--no-smoke`, CI runs it) | – not required | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~1 h | critic 24k |

## Decisions

- **The click that moves a round's end on holds the trigger until it is let go of (`PlayerInput.holdFireUntilReleased`).**
  The skip and the next round's whistle each cleared the trigger block, so a click still held fired an AEG at the spawn.
- **WON or LOST is placed by its top, 74 px (HUD-scaled) under the banner's top or a third of the way down, whichever is
  lower.** Centred, the word rose when the click line came in under it and sat 17 to 31 px inside a two-line banner at
  1280 × 720; at 1080 px and up it is where it was.
- **Everything else in the area was checked, not changed.** Results, row by row, are in the project files
  (`bugpass/BP2-results.md`); balance figures in `bugpass/BP2-balance-report.md`.

## Known issues left

- At HUD size 150 % in a 720 px window, a three-line round banner runs 22 px into WON or LOST (KNOWN_ISSUES › Menus,
  HUD and input, can wait).

# KI1 · Known issues fix pass (owner, 2026-10-16)

**Review:** 2 attempts · 7/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread, four workers) | ✓ 16 s | ✓ 438 s | ✓ 910 s | ✗ 1365 s (Woodland Low GPU memory +10 % over a stale baseline) | ✓ | ✗ (no KI1 line yet) | – gate failed | Perf baseline (owner chose to re-record), changelog not yet written | ~2 h 30 min (four workers in parallel) | workers 190k, 237k, 209k, 186k; QA 67k; performance 36k; changelog 21k |
| 2026-10-16 | 2 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 433 s | ✓ 871 s | ✓ 1331 s | ✓ | ✓ | 7/8 Accept (Opus) | – | ~1 h 30 min (with the 18-match play check) | performance 27k, critic 194k |

## Decisions

- **Every row of `docs/KNOWN_ISSUES.md` (242 at `aefc95d`) was gone through by four parallel workers, one per area; 23 rows are fixed or found stale (each with a test), 4 merged as duplicates and 2 moved (DC1), 213 left with their reason.** The full per-row verdicts are in the project's shared files (`triage/ki1-known-issues-report.md`).
- **Rows owned by the Beta 1 playtest blocks were left alone in code and name their block.** BD1, HV1, MV1, MS1, HD1, MR1 and TT1 rework those parts (owner's Dev 6 playtest, 2026-10-16), so a fix there would be thrown away.
- **No balance number was retuned.** Bots' sight now stops on a hit body; 16 seeds on Depot Normal read Attack / Defend attackers 59.6 → 58.1 % and Elimination west 57 → 53 of 119 decided rounds, inside noise.
- **The burst pause counting down while blocked was tried again and reverted.** It failed `depotMatch.overtime` (3 overtime touches, needs 4) and `depotMatch.stackHouse`'s follow check (268 judged ticks, needs over 400); BT1 bundles it with the spacing fix.
- **A Q/E lean cut eases out of the view over 0.1 s, never more than 0.1 m outside the sim's eye (`RENDER.leanCut`).** Fast enough to read as a cut, and inside `leanWallClearance` minus the near plane's reach, so no wall interior shows.
- **Fire-selector taps queue, one step a tick, at most one full cycle (`FIRE_MODE_QUEUE_MAX` 3).** QA found taps made while spectating a bot (Dev) piled up and replayed as a long run.
- **Weathering's creep starts at each block's own foot.** The same height its vertex grime band uses; a height query per block would cost build time.
- **The warm-up shows the overtime flag, a tossed magazine and the scope eyepieces for the compile, about 0.22 MB of GPU memory at match build; the owner chose to re-record the Depot and Woodland Elimination Low baselines (WebGL and WebGPU) rather than drop it (2026-10-16).** Main itself had drifted about 0.7 MB over the old Woodland baseline; budgets are unchanged.
- **The browser play check was 18 scripted matches, every map, mode and light across Easy to Pro, 75 s each.** None showed a page error, NaN, fall or stall; Practice and the Tutorial are in the smoke test.
- **The ricochet grit fix (an optional `from` on `bbImpact`) was built and reverted (commit eaea268).** HD1 reworks the impact effects and can cherry-pick it.
- **The working commits carry the prefix "BP6:"; the code's comments and test titles say KI1.** The planning thread later named a Beta 1 bug pass BP6, so this task is KI1 (critic check 7).

## Known issues left

- 213 rows, each with its reason and, where one owns it, its Beta 1 block (KNOWN_ISSUES, every section).
- Shadow depth shaders, a figure's first fade and two post-stack pipelines may still compile on a match's first frame (KNOWN_ISSUES › Graphics and performance, can wait).

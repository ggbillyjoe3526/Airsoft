# PF3 · The 4K 240 Hz line for maxed-out settings (after William's desktop baseline)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 38 s | ✓ 214 s (fast) | ✗ 1623 s (boot test's 180 s limit mid-match on a loaded container; no src/ or e2e/ change, main's CI green) | – not required | ✓ | ✗ (before the changelog agent) | 7/8 Retry (Opus) | QA Fail (WebGL2 Depot over the line); QA scope rule undocumented | ~1 h 30 min (two smoke runs ~50 min) | QA 44k, performance 30k, critic 67k |
| 2026-10-17 | 2 | Opus 5.5 (build thread) | ✓ 25 s | ✓ 230 s (fast; re-run once for the known heap-growth flake) | – skipped (container load; CI runs it) | – not required | ✓ | ✓ | 8/8 Accept (Opus) | – | ~45 min | QA 27k, performance 20k, critic 39k, changelog 20k |

## Decisions

- **The desktop's Ultra line at 4K is the 2026-10-17 baseline, p95 6.5 ms and p99 9 ms, not the 240 Hz aim.** The owner's pick on the decision card ("today's numbers"); nothing in the game was cut for it (also in DECISIONS).
- **WebGL2 holds its own desktop Ultra line at its own baseline, 7.2 and 11.5 ms.** Its Depot run was slower than WebGPU's line (6.7, 10.6), and "today's numbers" reads the same for each renderer; the owner confirmed it on 2026-10-18 (also in DECISIONS).
- **Only Ultra's frame times are judged on the desktop (`frameTimeGatedPresets`).** Low to High run far past 240 Hz there, and the 1080p row is for the GPU-bound hint only.
- **Environment lines come last in `budgetFor` (`envs.<env>.<preset>`, then `envs.<env>.backends.<backend>.<preset>`).** The desktop's line must not reach the laptop, container or CI runs.
- **QA may commit its own `pipeline/*.qa.test.mjs` files, never the gate's other tests.** Its tests of PF3's pipeline code failed scope otherwise (also in DECISIONS).
- **A perf run ends its window when the simulation stops for 1 s (`STALL_MS`).** The 2026-10-17 Neon Extraction run measured the results screen for 5 minutes once the match ended.
- **Nine of the ten desktop files are the baselines; Neon Extraction is left out.** That row measured the results screen.
- **The HUD overflow check holds round 1 (bots hold fire, you're a ghost, the clock reads 50:00) and sets its twelve spare magazines again until shown.** On CI the checks outlast the 150 s round; its end froze the HUD (WON and the table, longer since RE1) or refilled the pouch, red on main and here since PF1; test only, `e2e/uiOverflow.spec.ts`.

## Known issues left

- Ultra at 4K misses the 240 Hz aim on every map (KNOWN_ISSUES › Graphics and performance, can wait).
- WebGL2 on Ultra at 4K is slower than WebGPU on Depot (KNOWN_ISSUES › Graphics and performance, can wait).
- The Neon Heights Extraction desktop baseline is missing (KNOWN_ISSUES › Graphics and performance, playtest).

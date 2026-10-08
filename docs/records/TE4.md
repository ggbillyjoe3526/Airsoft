# TE4 · Token step 4: fewer chat lines, a lighter local test run, bot balance as a report

**Review:** 2 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-08 | 1 | Opus 5.5 (build thread) | ✓ 37 s | ✓ 502 s | ✓ 477 s | ✓ 904 s | ✗ | ✓ | – | scope: a stray vitest output file | ~1.5 h | changelog (Haiku) 16k |
| 2026-10-08 | 2 | Opus 5.5 (build thread) | ✓ 35 s | ✓ 529 s | ✓ 501 s | ✓ 954 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~35 min | critic (Sonnet) 36k |

## Decisions

- **The gate decides the slow guards by what they import, not by folder (also in DECISIONS).** Bot tuning in
  `src/config`, the maps and `pool.md` reach the guards too, and a folder list would miss them or run them for a HUD
  change.
- **`package.json`, the lockfile, `vite.config.ts`, `tsconfig.json` and the test setup file always reach them.** They
  change how every test runs, and the setup file loads every map.
- **When the gate cannot list the guards, it runs both projects.** A missed run costs time; a wrong skip could hide a
  stuck bot until CI.
- **Every balance band moved to the report in this one change.** Moving them map by map would have kept the noise
  failures (M73, M74) for weeks.
- **The `balance` project exists only when `AIRSOFT_BALANCE` is set.** A project that is merely filtered out still runs
  under a bare `npx vitest run`, and the figures must never fail a build.
- **A figure travels in its test's meta.** Vitest's JSON report carries it, so there are no side files to clean up.
- **Near an edge is within one standard error, noise is under two.** Seed noise alone puts a fair figure two standard
  errors past an edge only about 1 time in 40, so that is where a re-measure stops and a fix starts.
- **Guards that played many seeds only for a figure play four.** The Pro and levels guards on every map, the
  Extraction runs and Depot's ends: the never-happen checks hold on four, and the figure keeps its seeds.
- **A guard fails when over 1 in 4 rounds run out the clock (`STALLED_ROUNDS_MAX`).** Today's maps run 0 to 3 %;
  Woodland before M40 ran 46 % and would have failed, which is the stall the guard is for.
- **Depot's Attack / Defend attacker share is now a figure (38 to 67 %), not an assertion.** The band is the old
  guard's.
- **Test support and balance files are not perf paths.** They ship nothing, so a test-only change no longer runs the
  perf matrix.
- **The first full report: 74 figures, none outside, 5 near an edge (21 minutes on 4 cores).** It is in the shared
  files under `pipeline/runs/TE4/`, and BP2 starts from it.
- **The city chime test gets a 15 s limit, like the other audio render tests.** About 3 s alone, it overran the 5 s
  default once in a full run beside the bot-match guards.

## Known issues left

- None.

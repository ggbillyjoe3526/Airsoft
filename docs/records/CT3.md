# CT3 · Content toolkit part 3: mode checks

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | 1 | Opus 5.5 (build thread) | ✓ 29 s | ✓ 334 s | ✓ 641 s | ✓ 600 s | ✓ | ✓ | 7/8 Retry (Opus) | Check 1: the grid played only 1v1 and the largest team, and no Rounds to win but Tournament's | ~4 h | QA (Opus) 115k, changelog (Haiku) 24k, critic (Opus) 145k |
| 2026-10-11 | 2 | Opus 5.5 (build thread) | ✓ 30 s | ✓ 331 s | ✓ 598 s | ✓ 579 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~40 min | critic (Opus) ~60k |

- **Logs** are in the project's shared files under `pipeline/runs/CT3/`.
- **Perf** ran because the mode switches touch perf paths (`src/sim/round.ts`, `src/ai/botController.ts`,
  `src/ui/*`, `src/config/perfScript.ts`); each is the same branch as before, as a `switch`, and all eight matrix runs
  passed. The gate's stale container baselines warning (84 commits behind) is its own (CORE-12).
- **End to end** (2026-10-11): `node pipeline/content-check.mjs mode:attackDefend` passes all 18 checks with the perf
  run on each host (305 s, every run within budget; no mode baseline yet, so no relative check) and the browser match;
  without perf and browser, 37 s (18 short matches on Depot, 20 on Woodland and Neon Heights). `mode:extraction`
  passes, browser match included (88 s). `mode:all` takes 17 s. `mode:attackDefend --balance --seeds 2 --seconds 120`:
  0 fails; Hard's pay on Depot was × 1.27 of Elimination's (band × 0.75 to × 1.25), within noise at 2 seeds, and three
  end shares were within noise below 35 %. `mode:extraction --balance --seeds 2` ran in 45 s (dev: figures only).

## Decisions

- **Every place that answers for a mode is a `switch` ending in `unknownMode`** (`config/modes.ts`), with
  `MODE_SHAPES` saying what a mode is (rounds or one run) and needs from a map. A new `MatchMode` does not build until
  each answers. `matchSession.ts`'s Extraction checks stay as they are: they are Extraction's own features, not a
  fall-back to Elimination.
- **The briefing and round banner must not say what Elimination says**; the pause line, end screen and perf script may.
  Pay, records and the Mode button go by the mode's id and are listed in the report, not probed.
- **The bots play it their own way** when, from the same start, they stand at least 1 m on average from where they
  stand in Elimination after 30 s (Attack / Defend: 8 to 11 m).
- **Pay in line is a ratio to Elimination's** Field Credits a minute in the standard match, same map, lighting and
  level, held to × 0.75 to × 1.25, with noise from the round lengths and draws (within two standard errors asks for a
  look). **The objective decides at least 1 decided round in 10.** Both in `MODE_BALANCE_BANDS` (also in DECISIONS).
- **Attack / Defend's perf gate is Elimination's runs** (`MODE_PERF_STAND_INS`): same field, figures and replicas plus
  one flagpole. `content-check mode:<id>` still perf-runs the mode itself on each host.
- **The compatibility grid** is one change at a time from the standard match: each other ruleset, level, team size,
  Rounds to win, each Custom switch flipped and the shortest round time, 40 s each, on every host (attempt 2).
- **Every mode's browser match is in the smoke test** on Depot (about 70 s of test time), so the spec cannot rot.
- **Extraction joined every balance run:** a replica's or part's as paired seeds (the share of the runs only one kit got
  out of, 40 to 60 %); a map's or mode's against the map's Extraction bands, moved to `ai/balance/extractionBands.ts`.

## Known issues left

- After merging main (with RM4 and the playtest fixes) the quick gate's tests failed once on a test this task doesn't
  touch: `src/render/webgpu/compute/particles.qa.test.ts:421` counted 409 objects against its 400 limit while the bot
  guards ran beside it; alone it passed 3 runs of 3, and so did the fast suite. A heap count under load, for its owner
  to widen if it recurs.

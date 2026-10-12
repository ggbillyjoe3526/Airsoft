# IM6 · Faster CI: browser tests in parallel jobs, current actions and tools, lean shared files (tidy-up items 1, 8, 6)

**Review:** 2 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 41 s | ✓ 474 s | ✓ 898 s | – not required | ✗ (the qa commit added a pipeline test) | ✓ | – none on a failed gate | Scope: pipeline/workflow.test.mjs came in a commit with the qa trailer and was not in touches | ~1 h 30 min | QA 24k, changelog 19k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | ✓ 24 s | ✓ 163 s (fast) | – skipped (--quick; attempt 1's full run is the same tree) | – not required | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~20 min | critic 32k |

- **Logs** are in the project's shared files under `pipeline/runs/IM6/` (reports only, as the new rule says).
- **Timings** behind the split (this container, 2 workers, main 19d3858): the smoke test's 85 tests are 1,668 s of
  test time and 932 s of wall time; CI took about 1,290 s in one job. Playwright's `--shard k/4` gives 23, 22, 28 and
  12 tests; the shares' longest file run is `woodland.spec.ts` (339 s, its Medium test alone 195 s), so the longest
  share is about 340 s here before its two builds. `--only smoke --shard 2/4` ran its 22 tests in 209 s, builds
  included.

## Decisions

- **Four browser shares, split by Playwright's own `--shard`.** Three would land near the same time (the Woodland file is the floor either way), and four leave room as tests are added; a time-weighted split would need a table to keep current.
- **Each browser share builds its own bundles.** Waiting for `check`'s build would serialise the jobs; the two builds cost about a minute a share.
- **The browser and slow jobs check out shallow.** No smoke test reads the version label; only `check`'s build needs the tags.
- **Vitest stays at 5.0.3.** 5.0.4 came out the same day and moves two of its own dependencies a major version; the next routine update takes it.
- **That one install ran on npm 11.6.2.** npm 10.9 crashes resolving Vitest's optional peers (arborist `#loadPeerSet`); npm 10's `npm ci` installs the lockfile as is.
- **The workflow guard test is the worker's commit, not QA's.** The pipeline's own tests are files a task lists (`pipeline/scope.mjs`, FA11a), so the qa agent's test was recommitted without its trailer and listed in touches.

## Known issues left

- None.

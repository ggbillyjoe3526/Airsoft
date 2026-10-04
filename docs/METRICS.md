# Pipeline metrics

One row per attempt of a task run through the pipeline (`pipeline/README.md`). Gate columns are ✓, ✗ or – (not run),
with seconds. Worker tokens are the totals the harness reports when a spawned worker finishes, per worker (QA,
performance, triage, critic, changelog); the build thread's own tokens and the coordinator's are not visible here.

| Date | Task | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-04 | M27 | 1 | Fable 5.1 (build thread) | ✓ 5 s | ✓ 68 s | ✓ 46 s | ✓ 109 s | ✓ | ✓ | 8/8 Accept (Opus) | – (one scope re-run: the dry-run branch was stacked on an older base) | 45 min | QA 80k (142 s), changelog 71k (95 s), performance 66k (38 s), critic 84k (105 s) |
| 2026-10-04 | M28 | 1 | Fable 5.1 (build thread) | ✓ 5 s | ✓ 70 s | ✓ 45 s | ✓ 108 s | ✓ | ✓ | – (trivial: Haiku diff check, 3/3) | – | 15 min | changelog 52k (16 s), triage 53k (41 s) |

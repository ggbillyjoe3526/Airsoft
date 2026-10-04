# Pipeline metrics

One row per attempt of a task run through the pipeline (`pipeline/README.md`). Gate columns are ✓, ✗ or – (not run),
with seconds. Worker tokens are the totals the harness reports when a spawned worker finishes, per worker (QA,
performance, triage, critic, changelog); the build thread's own tokens and the coordinator's are not visible here.

| Date | Task | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-04 | M27 | 1 | Fable 5.1 (build thread) | ✓ 5 s | ✓ 68 s | ✓ 46 s | ✓ 109 s | ✓ | ✓ | 8/8 Accept (Opus) | – (one scope re-run: the dry-run branch was stacked on an older base) | 45 min | QA 80k (142 s), changelog 71k (95 s), performance 66k (38 s), critic 84k (105 s) |
| 2026-10-04 | BP1 | 1 | Opus 5.5 (build thread) | ✓ 5 s | ✓ 69 s | ✓ 46 s | ✓ 111 s | ✓ | ✓ | 7/8 Accept (Opus) | – (two gate re-runs: a stale container perf baseline, then the re-recorded baseline missing from touches) | ~80 min | review agents 209k and 247k, changelog (Haiku) 56k, critic (Opus) 145k |
| 2026-10-04 | M30 | 1 | Opus 5.5 (build thread) | ✓ 6 s | ✓ 79 s | ✓ 51 s | ✓ 124 s | ✓ | ✓ | 8/8 Accept (Opus) | – (one build re-run: a QA test's strict-null typecheck) | ~75 min | QA (Sonnet) 114k (272 s), changelog (Haiku) 62k (49 s), performance (Sonnet) 97k (64 s), critic (Opus) 148k (208 s) |
| 2026-10-04 | M29a | 1 | Opus 5.5 (build thread) | ✓ 7 s | ✓ 67 s | ✓ 52 s | – not required | ✓ | ✓ | 8/8 Accept (Opus) | – (one scope re-run: the QA commit carried a pipeline/out artifact) | ~75 min | QA 1 agent, changelog (Haiku), critic (Opus) 127k (145 s) |
| 2026-10-04 | FA6 | 1 | Opus 5.5 (worker in a worktree) | ✓ 12 s | ✓ 208 s | ✓ 105 s | ✗ 331 s (averages only, load ~15, explained) | ✓ | ✓ | 8/8 Accept (Opus) | – | ~35 min | worker 286k, changelog (Haiku) 59k, critic (Opus) 110k |
| 2026-10-04 | M28 | 1 | Fable 5.1 (build thread) | ✓ 5 s | ✓ 70 s | ✓ 45 s | ✓ 108 s | ✓ | ✓ | – (trivial: Haiku diff check, 3/3) | – | 15 min | changelog 52k (16 s), triage 53k (41 s) |
| 2026-10-04 | FA1 | 1 | Opus 5.5 (worker in a worktree) | ✓ 14 s | ✗ 184 s (pole guard) | ✓ 96 s | – | ✓ | ✓ | – | pole guard: ramp pace changed Attack / Defend | ~40 min | worker 100k, changelog (Haiku) 58k |
| 2026-10-04 | FA1 | 2 | Opus 5.5 (lead) | ✓ | ✓ (CI) | ✓ (CI) | – | ✓ | ✓ | 6/8 near miss → fixed (Opus) | check 3 settleMatch per frame; check 8 docs | ~30 min | critic (Opus) 179k |

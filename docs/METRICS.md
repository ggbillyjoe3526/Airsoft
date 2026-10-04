# Pipeline metrics

One row per attempt of a task run through the pipeline (`pipeline/README.md`). Gate columns are ✓, ✗ or – (not run),
with seconds. Worker tokens are the totals the harness reports when a spawned worker finishes, per worker (QA,
performance, triage, critic, changelog); the build thread's own tokens and the coordinator's are not visible here.

| Date | Task | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

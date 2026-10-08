# TE3 · Token step 3: a review packet, fewer agent runs and a failures-only gate summary

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-08 | 1 | Opus 5.5 (build thread) | ✓ 22 s | ✓ 753 s | ✓ 300 s | – not required | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~1 h | changelog (Haiku) 17k with the lean brief (was 50k–107k); critic (Sonnet) 67k from the packet (was 84k–127k) |

## Decisions

- **The packet's diff has 8 lines of context and stops at 512 KB.** Enough to judge most hunks without opening the
  file; past the cap a file is listed with the `git diff` command that shows it.
- **The packet leaves out the change records and generated files but keeps DECISIONS and KNOWN_ISSUES.** The critic's
  check 8 reads those two; the task's record, CHANGELOG, FEATURES, patch notes, archive, TASKS (its block is quoted),
  the lockfile, perf baselines and light bakes say nothing a check needs.
- **The packet quotes a contract when the task names it or the diff touches a source file it names.** Matched by path
  ending (`sim/commands.ts` is `src/sim/commands.ts`); a contract's pinning tests don't count, so a test-only diff
  quotes none.
- **A judgment is checks 5 to 8, or a check 1 to 4 the critic decided by reading (also in DECISIONS).** Only a failure
  on a measured number skips the Opus re-run: a re-run can change a reading, never a number (the plan's own reason).
- **No QA agent on a pipeline task: the build thread writes the pipeline's own tests.** The scope gate keeps
  `pipeline/*.test.mjs` out of `Agent: qa` commits on purpose (`pipeline/scope.test.mjs` pins it), as in TE1 and TE2.
- **The packet is not written on CI or under `--only`, and never fails the gate.** No agent reads it there.
- **A test file that fails to load is now listed by name.** The tests gate already failed on vitest's exit code, but
  it named no test, so the cause was only in the raw log.
- **The critic cites the file's own line, never the packet's.** Its first run from the packet cited packet line
  numbers as `file:line`; one sentence in `critic.md` fixes that.

## Known issues left

- None.

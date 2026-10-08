# Task records

One file per task that ran through the pipeline, `docs/records/<id>.md`: how its review went, a row per attempt, the
small decisions it made and the known issues it left. Each task writes only its own file, so parallel branches never
conflict on shared tables. The thread writes it in the pipeline's records step (`.claude/skills/pipeline/SKILL.md`,
step 8), in the same push as the work.

Records before 2026-10-08 are in the archived tables: `docs/archive/0.1-dev/REVIEWS.md` (one line per task) and
`docs/archive/0.1-dev/METRICS.md` (one row per attempt).

## What goes where

| What | Where |
|---|---|
| The task's review, its attempts, its own tuning values and defaults | Its record (this folder) |
| An owner ruling, or a rule every later task must follow | `docs/DECISIONS.md`, and a line in the record's Decisions that points to it |
| A bug, limit or gap still open after the task | A row in `docs/KNOWN_ISSUES.md`, and a line in the record's Known issues left |
| What the player notices | `CHANGELOG.md` and `docs/FEATURES.md` (the changelog agent) |

## The format

`node pipeline/records.mjs --check` checks every record against it, and so does the fast test suite
(`pipeline/records.test.mjs`).

```markdown
# M80 · Bots stop at the flag

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-08 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 70 s | ✓ 85 s | – not required | ✓ | ✓ | 6/8 Retry (Opus) | AC2 bots overran the flag | ~1 h | QA 80k, critic 110k |
| 2026-10-08 | 2 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 71 s | ✓ 84 s | – not required | ✓ | ✓ | 8/8 Accept (Opus) | – | ~30 min | critic 90k |

## Decisions

- **Bots wait 2 s at the flag.** Long enough to read the capture, short enough to keep the round moving.

## Known issues left

- None.
```

- **Title.** `# <id> · <title>`, the task block's heading in `docs/TASKS.md`. The file is named `<id>.md`.
- **Review line.** `**Review:** <n> attempts · <score>/8 · <verdict> (<critic model>)`. The verdict is Accept,
  Auto-accept (after the fourth attempt, `docs/PROCESS.md` › The pipeline) or Escalated. A `tier: trivial` task writes
  `trivial` for the score and the diff check for the critic: `1 attempt · trivial · Accept (Haiku diff check)`. One
  optional note of up to 80 characters may follow: ` · <note>`.
- **Attempts.** One row per attempt, these columns in this order. The gate writes the row's date and six gate cells
  to `pipeline/out/metrics-row.md` on every run; copy it and fill each `?`. Gate cells are `✓ <seconds> s`,
  `✗ <seconds> s (why)` or `– <why skipped>`. Worker tokens are the totals the harness reports per spawned agent,
  plus the build thread's own when its session shows one (`thread 350k`).
- **Decisions.** One line each, `- **<what was decided>.** <why, one sentence>.` A line that also went into
  `docs/DECISIONS.md` ends `(also in DECISIONS)`.
- **Known issues left.** One line each, naming the `docs/KNOWN_ISSUES.md` section and class:
  `- <issue> (KNOWN_ISSUES › <section>, can wait).` Write `- None.` when there are none, in either section.

## Index tables

`node pipeline/records.mjs` prints one line per record (task, title, review). Flags: `--metrics` every attempt row
with a Task column, `--decisions` and `--issues` every record's lines of that kind, each tagged with its task.

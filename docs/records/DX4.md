# DX4 · Tooling and CI: one build per pull request, balanced shards, a formatter (audit B1, B2, B3)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 20 s | ✓ 663 s (both; `npm run t` 151 s) | – CI | ✓ 3234 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~5 h | QA 33k · performance 19k · critic 46k |

## Decisions

- **The bundles go from job to job as a tar in a run-keyed cache, not an artifact.** The cache step is one line each
  side and restores in seconds; `tar --format=posix` keeps each file's time to the nanosecond, which the build stamp
  checks, so `pipeline/build-cached.mjs` finds the bundles are this source's and builds nothing. Every job that reuses
  them checks out the full history, so `git describe` (part of the source hash) is the same. A missing tar (a re-run
  of failed jobs gets a new key) only means the job builds for itself.
- **On CI the gate's build step reuses a matching stamp instead of forcing a build;** off CI it still always builds.
- **The slow shares are balanced by measured seconds, not by raising the shard count.** vitest's `--shard` splits by a
  hash of the paths, so one share drew 290 s and another 69 s; `pipeline/shards.mjs` deals the files longest first from
  `pipeline/slow-times.json` (each share about 448 s of work by the table). A file the table doesn't know weighs the
  median, so a new guard never breaks the split; the table is refreshed with one command when the jobs drift.
- **The three fast files over 20 s alone (the sound bank, team play, G9's effect sweep) joined the slow project**
  rather than getting smaller fixtures: no test is dropped, and the local gate still runs them when a diff reaches them.
- **Two heavy fast tests got a 20 s timeout** (the map-untouched physics run and the rifle file's hand fit, 3 to 4 s
  alone), the room their neighbour already had: they failed at the 5 s default whenever the container was loaded.
- **Prettier is set up but not run.** `printWidth: 140`, single quotes and trailing commas, as the code already has
  them; `.prettierignore` keeps Markdown (the docs' house style and the data tables) and generated files out. The
  one-off format commit and CI's `format:check` wait, as the block says, for the open branches to merge and the
  owner's yes.

## Known issues left

- The one-off Prettier format commit (about 960 files) and CI's `format:check` step are still to do (acceptance 3).

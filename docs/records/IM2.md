# IM2 · A play link on GitHub Pages (owner's ask, 2026-10-12)

**Review:** 3 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 33 s | ✓ 168 s (fast) | ✓ 880 s | – not required | ✓ | ✗ (no line naming **IM2** under Unreleased) | – no critic on a failed gate | changelog: the gate ran before the changelog agent | ~35 min | – |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | ✓ 33 s | ✓ 162 s (fast) | ✓ 882 s | – not required | ✗ (QA's test was a `pipeline/*.test.mjs`) | ✓ | – no critic on a failed gate | scope: the gate counts `*.test.ts` as tests, not `.test.mjs` | ~20 min | QA 24k, changelog 16k |
| 2026-10-12 | 3 | Opus 5.5 (build thread) | ✓ 38 s | ✓ 168 s (fast) | ✓ 862 s | – not required | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~25 min | QA 27k, critic 28k |

Attempt 2's test moved to `src/config/playLink.test.ts` and its commit left the branch; attempt 3 also merged origin/main
(the figures #193, the old audit folder #194). The first real publish waits on the owner switching Pages on
(Settings › Pages › Source: GitHub Actions); the thread then runs it by hand and checks the link.

## Decisions

- **The link plays the newest release tag, not `main`**: players get what the zip gives, and the title screen names the release (the newest is the tag made last; the pattern is `releaseName`'s, `src/config/playLink.test.ts` keeps them equal).
- **Every publish runs on the default branch**: the `github-pages` environment lets only it deploy unless its rules are edited by hand, so a tag's run only hands its tag to a `workflow_dispatch` run on `main` (the one event the workflow's token may start), and the owner has one setting to change, not two.
- **A pull request that changes the workflow builds the newest release without publishing**, so its build half (and the current action versions) is proven before it merges.
- **The published build leaves out the source maps and the Brotli and gzip copies**: Pages compresses with gzip itself and never serves them.
- **The release browser tests serve `dist/` from `/Airsoft/`**, the link's path: a root-absolute file path fails there as it would on the link; relative paths still work from `/` for the zip's `npm run preview`.

## Known issues left

- None.

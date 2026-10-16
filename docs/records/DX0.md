# DX0 · Audit quick wins: a faster test loop, one math module, README coverage, the stage lines

**Review:** 1 attempt · 8/8 · Accept (Sonnet) · QA Pass after one fix, performance Pass

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | the audit thread (owner-approved, PROCESS › Models) | ✓ 25 s | ✓ 771 s | ✓ 1265 s | ✓ 2158 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~2 h | QA 39k + 17k, performance 23k, changelog 16k, critic 38k |

The full gate ran on 6533dbc (every matrix entry, with baseline-lag warnings only); QA's one blocking finding (a fifth
`clamp01` in `render/figurePose.ts`) was fixed in 691a386, and the quick gate re-ran build, both test projects, scope
and changelog on it.

## Decisions

- **The `slow` project holds every headless guard over about a minute, not only bot matches.** Woodland's matches, the
  duel and route guards and the figure hit-volume sweep were a third of `npm run t`; CI runs them all, the local gate
  when the diff reaches one.
- **The README rule is enforced by a test, not by review.** `src/readmeCoverage.test.ts` fails on a source file under
  `src/` that its folder's README (or the nearest above it, or `docs/ARCHITECTURE.md` for `src/` itself) does not name;
  a branch that adds a file adds its README line.
- **The built-in replica numbers stay in code, kept equal to `stats.md` by a test.** They are the fallback for a row
  the file can't give; reducing them to defaults would change what a broken file plays.
- **`t:changed` diffs against `origin/main`.** A shallow clone fetches it first (README › For developers); no script
  fetches on its own.
- **The thirteen `eslint-disable` comments stay.** They carry the reason for each `any`; removing them touches files
  in flight for no gain, and the formatter question (audit B2) is the owner's.
- **Left for the audit's later blocks (DX1 to DX8):** everything that conflicts with the seven Dev 6 playtest branches.

## Known issues left

- None.

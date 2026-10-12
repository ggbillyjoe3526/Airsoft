# IM4 · TypeScript 7: a faster type check and build, same game (improvement 10)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 19 s | ✓ 401 s | ✓ 767 s | – not required | ✓ | ✓ | – not judged (the report's head was behind HEAD) | Gate re-run on HEAD: QA's test and the docs landed during the run | ~40 min | QA 19k, changelog 27k, critic 18k |
| 2026-10-12 | 1 (re-run) | Opus 5.5 (build thread) | ✓ 7 s | ✓ 383 s | – skipped (--quick; the run above is the same code) | – not required | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~10 min | critic 21k |

- **Logs** are in the project's shared files under `pipeline/runs/IM4/` (reports only).
- **Timings** (4-core cloud container, warm, three runs each, main 8fcfe01): `tsc --noEmit` 21.2, 18.8 and 18.6 s on
  5.9.3, 3.4, 3.6 and 3.6 s on 7.0.2, over the same 1,732 files; `npm run build` 35.8, 34.6 and 34.4 s, then 19.3,
  19.7 and 19.4 s.
- **Same game:** every JavaScript, CSS, HTML and asset file in `dist/` is byte-identical on both compilers. Two source
  maps differ, and they differ between back-to-back builds on one compiler too.

## Decisions

- **TypeScript 7 replaces 5.9 on the same `tsconfig.json`.** The owner's go-ahead, and the rule that a dropped setting goes to him, never a looser config (also in DECISIONS).
- **Diagnostics were compared once, not in the suite.** A probe with one error per strict setting printed the same errors line for line on 5.9.3 and 7.0.2; QA's `src/tsconfigStrict.test.ts` guards the settings, since a lasting compiler comparison would need both binaries.
- **That one install ran on npm 11.6.2.** npm 10.9 crashes resolving Vitest's optional peers (as IM6 found); npm 10's `npm ci` installs the lockfile as is.

## Known issues left

- None.

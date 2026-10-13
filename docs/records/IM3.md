# IM3 · Rapier's WebAssembly as a plain file (tidy-up improvement 9)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 46 s | ✓ 663 s | ✓ 1085 s | ✓ 2170 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~2.5 h | QA ~33k, changelog ~20k, critic (Opus) ~60k |

- **Attempt 1:** the full gate passed on e59063d (all 16 perf runs; the baseline-age warnings were there before). The
  critic accepted at 7/8, check 7 noting that the transform's "nothing moved" source map was wrong for the code after
  the old base64 string on its single line. The swap is now padded to the length it replaces, so no column moves
  (a5b7879, c231a16); the built files are byte-identical to e59063d's but for the maps, and `--quick` passed on c231a16
  (build 32 s, tests 672 s). The critic then re-judged check 7 on c231a16: 8/8. Logs in `pipeline/runs/IM3/attempt-1/`
  (project files).

## Measured

Release builds served with Brotli and `Cache-Control: no-cache` (revalidated), Chromium with SwiftShader, cold cache,
medians; main 19d3858 against this branch.

| | main | IM3 |
|---|---|---|
| Rapier's chunk | 4,335 kB (1,196 kB Brotli) | 225 kB (32 kB Brotli) |
| Rapier's `.wasm` | inside the chunk | 3,082 kB (852 kB Brotli, 1,176 kB gzip) |
| Bytes to the title screen | 2,032 kB | 1,721 kB |
| Title screen, unthrottled (3 runs) | 886 ms | 680 ms |
| Starting physics (decode, compile, start) | 307 ms | 207 ms |
| Title screen at 25 Mbps, 40 ms (3 runs) | 1,650 ms | 1,398 ms (before the chunk preload) |
| Start match to the HUD, unthrottled (3 runs; SwiftShader's shader compiles dominate) | 5,631 ms | 5,189 ms |

## Decisions

- **The build rewrites the compat bundle's one `init()` call, with no new dependency (also in DECISIONS).** The package, its API and every test stay the same; the plain `@dimforge/rapier3d` package would need a WebAssembly plugin for Vite and Node.
- **The rewrite fails the build unless it finds exactly one inlined module ending the init options.** A Rapier upgrade that changes the bundle can't ship the base64 copy again unnoticed; the 236 kB chunk budget is a second guard.
- **Only builds get the plain file; the dev server and Vitest keep the inlined copy.** A download size doesn't matter there, and the tests keep running the package as published.
- **The loading bar follows the `.wasm` download, and Rapier's own fetch that follows is answered by the cache.** Handing the counted download straight to Rapier would need a hook in the vendor bundle; the cached second fetch costs one revalidation.
- **Rapier's code chunk is preloaded beside the game's (`modulepreload`).** Without it, starting physics waited a round trip for the 32 kB chunk after the `.wasm` arrived (34 ms at 25 Mbps, 40 ms).
- **Budgets: Rapier's chunk 236 kB, its `.wasm` 3,240 kB, each the measure plus 5 %, with no early warning (also in DECISIONS).** Vite's global size warning is now the default 1,000 kB budget.

## Known issues left

- None.

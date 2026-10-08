# TE2 · Docs rewrite and per-task records (token step 2)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-08 | 1 | Opus 5.5 (build thread) + six Sonnet doc workers | ✓ 33 s | ✓ 1277 s | ✓ 455 s | – not required | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~3 h 45 min | doc workers 379k, 260k, 211k, 262k, 307k, 182k; changelog (Haiku) 30k; critic (Sonnet) 48k |

## Decisions

- **Live docs hold only the current state; finished history moves word for word to `docs/archive/` (also in DECISIONS).**
  Every read and merge then touches a fraction of the text, and grep still finds the history.
- **One record file per task replaces the shared REVIEWS and METRICS tables (also in DECISIONS).** Parallel branches
  stop conflicting on shared tables; `docs/KNOWN_ISSUES.md` stays shared because a bug pass sweeps it as one list.
- **A task that adds, renames or moves a file keeps its folder's README current (also in DECISIONS).** The scope gate
  allows a `src/` folder README in any task, and folder READMEs are not perf paths, so a README edit runs no perf run.
- **The review line is fixed: `<n> attempts · <score>/8 · <verdict> (<critic>)`, with one note of at most 80
  characters.** Item 4's short formats; old lines ran to 600 characters.
- **The gate writes the attempt row with `?` in the six cells it can't know, and `--check` fails while one is left.**
  The thread can't forget to fill a cell.
- **The Dev 4 patch notes say MIT, not PolyForm Noncommercial.** `LICENSE` and `package.json` are MIT (the owner's own
  commit 229c098 reverted PolyForm); the published GitHub release text still says PolyForm.
- **The README stays at about 16 KB, not the 12 KB aimed for.** Going lower would cut setup steps, troubleshooting,
  controls or developer sections, which must stay.
- **`docs/KNOWN_ISSUES.md` (55 KB) and `docs/PLAYTEST.md` (68 KB) stay over 40 KB.** Cutting further would drop
  measured numbers and checks; both are read by heading.

## Known issues left

- Some merged pull requests have no CHANGELOG line (KNOWN_ISSUES › Build, tests and pipeline, can wait).
- `docs/IDEAS.md` lists supply weekends as declined, though M49 built them (KNOWN_ISSUES › Build, tests and pipeline,
  can wait).

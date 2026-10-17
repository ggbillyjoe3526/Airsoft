# DX3 · A fix-tier path through the pipeline (audit A5)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 32 s | ✓ 185 s (fast) | – CI | – not required | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~2 h | QA 25k · performance 19k · critic 31k |

## Decisions

- **A `tier: fix` record drops only `## Known issues left`.** `pipeline/records.mjs` still requires Attempts and
  Decisions; a fix with a known issue left keeps the section. The review line and the attempt row stay, so the metrics
  index reads every record the same way.
- **The changelog agent decides whether a fix touches FEATURES or PLAYTEST,** from the summary: a fix the player can't
  see gets a CHANGELOG line and nothing else.
- **`--perf` folded into `--env laptop`.** CI and no skill used `--perf`; the laptop is the only place a whole-matrix
  run is judged, so naming the environment now forces the whole matrix there.
- **The gate refuses an option it doesn't know** (QA's advisory): a leftover `--perf` or a typo used to run a different
  gate silently; it now stops with the options table's heading. No unit test, since the parse runs at module load.
- **Prompts cite, they don't repeat:** each agent names the file that holds the steps or the house style
  (`pipeline/README.md`, `docs/PROCESS.md` › Writing docs) instead of a copy; the six agents and two skills are
  24,714 bytes.

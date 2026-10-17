# PF4 · Neon Heights Extraction on Medium back under its triangle line

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 426 s | ✓ 973 s | ✓ 2162 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~2 h 30 min (the perf matrix ~36 min, the cause's runs ~40 min) | QA 42k, changelog 20k, performance 33k, critic 31k |

## Decisions

- **The cause, measured per object in the page:** at the spawn the two teammates beside you are at LOD0, and each one's held replica cast its shadow from the whole model (7.8k triangles) plus its magazine (1.2k), about 18k of the run's 223k peak. Nothing else on Neon Heights changed since the 194k baseline; the scene sat at the line and the spread did the rest.
- **A held replica casts its shadow from its small figure version at every distance.** The body's shadow already comes from its coarsest level (BD1); up close the small version is on the shadow layer only, so the view still draws the whole model. With no small version in the file, nothing changes.
- **The spread was the window, not the scene.** Per-frame (tick, triangles) logs of two runs were the same series shifted 20-30 ticks: the harness waited for the warm-up tick from outside the page and overshot it by up to three of software rendering's ten-tick frames. The window now opens inside the page on the first frame past it. Unchanged code read 193.7k, 197.6k and 203.9k before; the shadow change alone with the old window 178.4k and 176.3k; with the new window 178.9k and 178.1k; the gate 177.7k (WebGL) and 178.2k (WebGPU), max 205.7k.
- **All 16 matrix baselines were re-recorded from this task's gate run**, as the gate's lag warning asks of a change to what they measure. Woodland Extraction on Medium fell from 145k to 127k with the same shadow change.
- **No budget line was raised** (the owner's rule).

## Known issues left

- In a close reload the held replica's shadow keeps the magazine in place for a moment (KNOWN_ISSUES › Figures and art, can wait).

# RV2 · Tone mapping leaves Graphics (feature triage, 2026-10-05)

**Review:** 1 attempt · 7/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 552 s | ✓ 1280 s | ✗ 3055 s (neon extraction medium webgpu 203.9k triangles of 200k on a loaded container; re-run 197.6k, no new geometry) | ✓ | ✓ | 7/8 Accept (Sonnet) | – | ~2 h 30 min (the perf matrix ~51 min) | QA 35k, changelog 24k, performance 19k, critic 54k |

## Decisions

- **The row leaves Display, where ST1 had put it.** Neither Graphics nor Display has it, so the task's first criterion holds for the menus as they are now.
- **Tone mapping is a Dev choice row (`dev.toneMapping`), not a `cheat`.** It changes the look only, so matches with it still count.
- **A pick saved by the old row is read as the Dev pick until the Dev row saves its own.** A player who chose AgX finds it there when the Dev tab is shown; with the tab hidden everyone plays Neutral.
- **The critic's stale text (Display's blurb "tone", a type comment) was fixed before the records commit.** Display's blurb now reads "Screen, field of view, FPS".

## Known issues left

- Neon Heights Extraction on Medium (WebGPU) sits on its 200k triangle line, so a slow container run can fail the perf gate (KNOWN_ISSUES › Graphics and performance, document).

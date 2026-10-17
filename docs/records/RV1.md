# RV1 · Remove supply weekends and dated events (feature triage, 2026-10-05)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✗ 5 s (error TS2591) | ✓ 585 s | ✗ 11 s (no build to serve) | ✓ 3102 s | ✓ | ✓ | – not run (gate failed) | a QA test imported node:crypto, which the build's types lack | ~1 h 20 min (the perf matrix ~52 min) | QA 35k, changelog 21k |
| 2026-10-17 | 2 | Opus 5.5 (build thread) | ✓ 15 s (npm run build) | – attempt 1's (test-only fix; the touched files' tests ✓) | ✓ 1250 s | – attempt 1's (test-only fix) | – attempt 1's | – attempt 1's | 8/8 Accept (Opus) | – | ~30 min | performance 20k, critic 64k |

## Decisions

- **The Mode card's note line goes with the events (ChoiceCards.setNote, the `.choice-note` element and its CSS).** The supply line was its only use, so keeping it would be dead code; the task's touches gained the menu files it ran through.
- **A leftover Supply events table in an edited pool.md is ignored like any other unknown heading.** pool.md is bundled, not a save, so no message is needed.
- **Acceptance 2 is pinned by tests:** every shipped ID on its asset (`pool.test.ts`), a 0.1 Dev 6 format 3 save loading unchanged (`saveFile.test.ts`) and a run's cases hashed against the base build (`caches.test.ts`). No save store ever held an event, so `SAVE_FORMAT` stays 3.

## Known issues left

- None.

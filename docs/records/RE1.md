# RE1 · Round end: the WON stamp and the round's table stay longer (Beta 1 playtest item 15)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 471 s | ✓ 1070 s | ✓ 2407 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~3 h (two bot-match probes, the gate's perf matrix ~40 min) | QA 40k, changelog 22k, performance 23k, critic 35k |

## Decisions

- **WON, LOST or DRAW stays 2 s (`HUD.roundResultTime`, was 1.3) and the round's table 4 s (`ROUNDS.resetDelay` 6, was 4), for William to tune.** The table's hold is the rest of the sim's pause, so the pause grows by both; 6 s keeps the countdown on whole seconds (+1.3 s on the table, against "about 1.5"). A click still moves on from 0.5 s.
- **Bots also check a moving teammate where a run would take them while the BBs fly (`BOTS.friendlyMateSpeed`, MOVEMENT.runSpeed).** The longer pause moved Depot's seeded matches, and on seed 2 a teammate strafing in a close duel sped up into a BB in flight; 96 Depot matches with ricochets counting have no direct friendly hit since.
- **huntMemory QA plays Woodland seeds 1 and 3 (was 1 and 4).** Seed 4 now hunts for 42 ticks, below the test's premise; the measure is unchanged.
- **XP per match is unchanged; the per-minute pay estimate (`modePay`) counts the 6 s pause.** It reads a little lower per minute, inside the report's band.

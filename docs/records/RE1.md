# RE1 · Round end: the WON stamp and the round's table stay longer (Beta 1 playtest item 15)

**Review:** 2 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 471 s | ✓ 1070 s | ✓ 2407 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~3 h (two bot-match probes, the gate's perf matrix ~40 min) | QA 40k, changelog 22k, performance 23k, critic 35k |
| 2026-10-18 | 2 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 562 s | ✓ 1203 s | ✓ 2911 s | ✓ | ✓ | 8/8 Accept (Sonnet) | merged main (DX7, MV2): Stack House follow floor, botsSenses.ts not in touches | ~2 h (gate twice) | critic 19k |

## Decisions

- **WON, LOST or DRAW stays 2 s (`HUD.roundResultTime`, was 1.3) and the round's table 4 s (`ROUNDS.resetDelay` 6, was 4), for William to tune.** The table's hold is the rest of the sim's pause, so the pause grows by both; 6 s keeps the countdown on whole seconds (+1.3 s on the table, against "about 1.5"). A click still moves on from 0.5 s.
- **Bots also check a moving teammate where a run would take them while the BBs fly (`BOTS.friendlyMateSpeed`, MOVEMENT.runSpeed).** The longer pause moved Depot's seeded matches, and on seed 2 a teammate strafing in a close duel sped up into a BB in flight; 96 Depot matches with ricochets counting have no direct friendly hit since.
- **Seeded bot-match tests whose premise the pause moved keep their measure.** huntMemory QA keeps main's seeds 1 and 6 (MV2); the Stack House follow test's floor is 200 (seed 1 counts 232; seeds 1-16 66 to 1,938, all near), a sample size, not a rate.
- **XP per match is unchanged; the per-minute pay estimate (`modePay`) counts the 6 s pause.** It reads a little lower per minute, inside the report's band.

# TT2 · Tutorial: the lean step back, read cards last 10 s (Beta 1 playtest item 33)

**Review:** 1 attempt · 7/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 150 s (fast) | ✓ 1171 s | ✓ 2981 s | ✓ | ✓ | 7/8 Accept (Sonnet) | – | ~1 h 30 min | QA 44k, changelog 23k, performance 22k, critic 33k |

## Decisions

- **The lean step sits after Crouch and ticks once the player has leaned out 0.8 both ways, in either order.** Crouch and lean are the two cover stances; QA checked 0.8 is reachable at the spawn and along the firing line despite the walls' lean cut. Ruling in `docs/DECISIONS.md` (owner, 2026-10-17).
- **Every read card lasts `READ_TIME` (10 s).** One constant, so the five read cards can't drift apart; the order wheel's 1.1 s pointer step stays and simply goes round more than once.
- **A save on the lean step resumes there again.** Saves from TT1 builds hold ids that all still exist, so none restarts.
- **The critic's one miss (the folder README didn't name QA's new test file) is fixed in the records commit.**

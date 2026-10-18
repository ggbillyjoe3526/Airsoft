# WL3 · Woodland: West Hill, two meadow swells and a dry ravine (owner, 2026-10-17)

**Review:** 1 attempt · 7/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-18 | 1 | Opus 5.5 (build thread) | ✓ 23 s | ✓ 861 s | – skipped (boot.spec times out in the container on main too; CI runs it) | ✓ 3521 s | ✓ | ✓ | 7/8 Accept (Sonnet; check 8, a stale KNOWN_ISSUES headline, fixed before merge) | – | ~6 h (two full Woodland balance runs, six Pro variant runs, three full gates) | QA 41k, performance 28k, critic 36k, changelog 20k |

## Decisions

- **West Hill is the West Rise made taller: 3.4 m at its middle, 2.2 m at its ends (was 2.6 m all along), falling over 12.5 m (was 10).** The longer fall keeps its face under a ramp's slope. The camps still start hidden from each other (M88).
- **One meadow swell, 0.6 m, at plan (46, 53), not the concept's two.** With both, the west end won 37.5 % of Pro Elimination's decided rounds (40–60 %). Each variant was measured on Pro Elimination alone: a lower hill (3.0 m) 38.3 %, the old creek 38.1 %, the old hill 38.7 %, no swells 47.2 %, the (66, 37) swell alone 42.9 %, the (46, 53) swell alone 45.8 %. The swells were the cause, so the one by the meadow lane's west half stayed.
- **The creek is a dry ravine 2.2 m deep with a 3.2 m bed and 8 m banks, easing to 1 m deep west of plan x 20 to 40.** At full depth all along, its north bank met West Hill's south end at a 0.69 slope (the ramp limit is 0.5). The bed is wide enough for the stream, which is a later step (owner's "Land first").
- **The creek lane's points stay where they were,** on the ravine's north bank, so the lane now runs lower than the meadow. Moving them into the bed would change the bots' routes and balance for the stream step to decide.
- **Woodland's six container perf baselines were re-recorded (audit CORE-12),** and the stated dressing cost is 11 376 triangles (the leaf drifts and fallen branches fall anew on the new ground).

## Known issues left

- Woodland Extraction still reads easy against Easy and Normal home teams (73 % and 52 % of runs out, 52.6 XP a minute at Normal), as it has since WL2. To be tuned after William plays it (KNOWN_ISSUES).

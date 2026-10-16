# MS1 · Map surroundings and detail (playtest item 23)

**Review:** 3 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread) | ✓ 18 s | ✓ 472 s | ✗ 864 s (Woodland's night key) | ✗ 1681 s (over baselines) | ✓ | ✗ (no line yet) | – no critic on a red gate | intended detail over the baselines; smoke pinned the old night key | ~1.5 h | performance ~27k |
| 2026-10-16 | 2 | Opus 5.5 (build thread) | ✓ 17 s | ✓ 462 s | ✓ 854 s | ✓ 1627 s | ✓ | ✓ | 6/8 Retry (Opus) | checks 7, 8: Trees help, a bush test that could not fail, DECISIONS and known issues | ~1.5 h | QA ~66k, changelog ~19k, critic ~129k |
| 2026-10-16 | 3 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 452 s | ✓ 821 s | ✓ 1595 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h | critic ~136k |

## Decisions

- **Concepts first, twice.** v1 and v2 concept sheets went to the owner (`/mnt/project-files/concepts/map-surroundings/`); he approved v2 on 2026-10-16 ("Add to the game").
- **What no player can see is not drawn.** The owner's ruling on v1; `render/skylineSeen.test.ts` enforces it, which cut 41 hidden city towers, two Depot pieces, 14 wall units and four cables (also in DECISIONS).
- **Woodland's bushes 0.9 to 1.25 m tall, 0.5 to 0.85 m across.** Small and decorative as the owner asked, still crouch cover; a bush hides someone crouched behind it in over a quarter of the ways in, almost never anyone standing (also in DECISIONS).
- **The cabin's walls are 3 m (were 2.6).** A body vaulting the west wall (M102) must clear the new roof's underside.
- **The roof is weathered grey (0x5d5a52).** Rust red read as a team colour in the map checks.
- **The roof uses the city's cladding finish.** The finish system is an engine feature any map may use; it costs Woodland one 256² texture on Low.
- **Pines are three star tiers (54 triangles, were 12).** Four tiers put Woodland's Low over its 56k map-triangle line; Medium's line rises 60k → 68k.
- **Neon Heights' dressing may cost 36 000 triangles (G9's cap was 15 000).** The owner asked for a city that overwhelms; the frame budgets are unchanged and hold (165k of 200k on Medium).
- **Woodland's night: hemisphere 1.4, key 1.35, exposure 1.55.** The owner found it too dark; two cabin lanterns light it too (bots see further there, `nightSight.ts`).
- **Eight perf baselines re-recorded.** Woodland Low and Medium and Neon Heights Medium, both back ends: the added detail changes what they measure (performance agent: Pass).

## Known issues left

- Low draws no skyline; Neon Heights lost its Low tree ring (KNOWN_ISSUES › Maps, can wait).
- The menus' map pictures predate MS1 (KNOWN_ISSUES › Maps, can wait).

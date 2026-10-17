# KI2 · Known issues fix pass, round two (owner, 2026-10-17)

**Review:** 1 attempt · 7/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 24 s | ✓ 598 s | ✓ 1300 s | ✓ 2033 s | ✓ | ✗ (no KI2 line yet; written after the critic) | 7/8 Accept (Opus) | – | ~2 h 30 min (the gate's perf matrix ~34 min) | QA 39k, performance 25k, critic 66k, changelog 19k |

## Decisions

- **KI2 takes only the rows KI1 left that nothing owns and a bug pass can fix.** The rest wait on the owner's playtest or rulings, a real GPU or browser, or an open Beta 1 block (IN1, PF1, AX1, RV1, RV2, UX1, BT1, BL1, BL2), so a fix here would collide or guess.
- **The ricochet grit fix is KI1's commit eaea268, cherry-picked onto HD1's impact effects.** The impact a BB bounces off still throws its grit towards the shooter, since that is where it came from; only later impacts carry `from`.
- **The mode cards' pictures, their two camera views and their entries in the stills script are deleted (owner's decision card, 2026-10-17).** The cards are text boxes since MR1 (also in DECISIONS).
- **Only the map stills and backdrop were redrawn, on WebGPU at High as before.** The range is unchanged by MS1, so its picture stays.
- **Rows tagged with a Beta 1 block that merged without changing them say "<block> kept it", or name the open block that now owns them (UX1, IN1).** So no row points at finished work.
- **PLAYTEST's Play these first is rewritten for Beta 1, and the lines ST1, MR1 and HD1 made stale are corrected.** The "Beta 1 playtest guide" thread listed them in the project's shared files (`playtest/beta1-findings.md`); MV1's line waits on its pull request.

## Known issues left

- None new. Every open row keeps its reason (KNOWN_ISSUES, every section).

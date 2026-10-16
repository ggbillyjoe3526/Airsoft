# HD1 · In-match HUD, feeds and hop-up (playtest items 15, 22, 24, 25, 31–33)

**Review:** 2 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread) | ✓ 20 s | ✓ 529 s | ✗ 1009 s (3 failed: the ammo count's text touched the spare line under it) | ✓ 1856 s | ✓ | ✓ | – no critic on a failed gate | the spare line sat inside the count's glyph box | ~3 h | QA 62k, changelog 21k |
| 2026-10-16 | 2 | Opus 5.5 (build thread) | – unchanged (a CSS margin fix) | – unchanged | ✓ 1061 s | – unchanged | – unchanged | – unchanged | 8/8 Accept (Sonnet) | – | ~30 min | performance 43k, critic 51k |

## Decisions

- **Hop-up keys are 4 (less lift) and 5 (more lift), with Page Down and Page Up as the second binding.** Free keys beside the slot keys, both rebindable in Controls; one press turns the dial one notch (HOP_UP.dialStep).
- **The hop-up turn goes through PlayerCommand.hopUpSteps** (a one-shot, summed per tick), so bots and replays stay on the one command path; bots never send one.
- **An in-match turn lasts the match and is not saved to the Loadout.** The Loadout stays the place to set it for good; the dial no longer resets at each round.
- **A hop-up turn made mid-vault waits for the vault's end**, as every other one-shot press does (BP5).
- **The hop readout shows for HUD.hopShowTime (1.8 s) after the last turn**, over the replica panel, and goes at once on a switch or holster.
- **WON, LOST or DRAW shows when a round ends, after your own hit call, for HUD.roundResultTime (1.3 s); then the round's table.** Extraction shows none (its own result screen says it).
- **After HUD.roundResultContinueAfter (0.5 s) a click moves on**: it skips the rest of the reset wait to the next round, or goes straight to the results at the match's end. The sim's cease-fire between rounds means the click fires no shot.
- **The feed holds HIT_FEED.maxLines (6) lines of hits and callouts together**; with Keep, hits stay and callouts still come and go (CALLOUTS.feedLines). Bottom left, it hides under the round's table as the callout feed did (BP5).
- **The impact puffs kept their lifetimes** (shorter ones broke the particle allocation guard) and were toned down by size (radius 0.06 → 0.035 m), opacity (0.8 → 0.6) and grit (2–3 chips, slower and smaller).
- **The comms wheel is a ring of five equal slices** (ORDER_WHEEL inner 70, outer 186, labels at 122 px in a 112 × 52 box), the pointer's reach ending inside the ring.
- **The scoreboard keeps "(your team)" for a screen reader only** in place of the YOU tag.

## Known issues left

- None.

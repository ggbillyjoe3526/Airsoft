# TT1 · A simpler tutorial (playtest item 2)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 150 s (fast) | ✓ 795 s | ✓ 1339 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~1 h 15 min | QA 31k, changelog 17k, performance 22k, critic 36k |

## Decisions

- **Cards are one or two short sentences, at most 25 words (a levelling line 10).** The owner found the old cards wordy; what to do, then why it matters, is all a card needs.
- **Read cards wait 5 to 8 s (were 10 to 18 s), still at least a second per 4 words.** Tips 13 to 16 were the slow ones; the tests hold both limits.
- **A thin bar fills on a read card.** So the player sees the card moves on by itself instead of wondering what to press.
- **A finished step's tick shows 0.6 s (was 0.9 s).** Over 15 steps the old pause added up; 0.6 s still reads as a tick.
- **The order wheel card names no orders, and its pointer moves every 1.1 s (was 1.6 s).** The wheel is on screen beside the card, so it shows every order within the card's 6 s.
- **The lean step is gone.** Owner note 30 removes leaning from the game.
- **A tutorial saved on the lean step starts again from the first step.** A save holds the step's id, and an id no longer listed starts from the beginning (audit POOL-14); rare, and the steps are quick.

## Known issues left

- None.

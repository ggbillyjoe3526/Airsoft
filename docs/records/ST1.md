# ST1 · Settings defaults and menu order (playtest items 3–8, 18, 20, 34; the Settings side of 1 and 17)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | 1 | Opus 5.5 (build thread) | ✓ 24 s | ✓ 761 s | ✓ 1289 s | ✓ 2173 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~3 h | QA ~46k, changelog ~21k, performance ~24k, critic ~43k (a first critic run ~15k declined a stale gate head) |

- **Attempt 1:** a first full gate ran green on 9c33bf1 (build 28 s, tests 736 s, smoke 1205 s, perf 2041 s). The
  performance review's optional fix (the Dev box leaves the post stack alone while the Retro look is off) and a merge
  of main came after it, so the gate ran again on the merged head for the critic.

## Decisions

- **The Retro look shows only while the Dev settings box is ticked.** Every Dev setting applies only while the tab is
  shown (M24), so a save with the Retro look on and the box unticked plays without it; its sliders are kept.
- **Settings opens on its first group, Display.** It opened on Graphics, the first group before; the list's first is
  the natural landing, and unticking the Dev box while on Dev returns there too.
- **The default choice is listed first on the Aim button and Crouch key pickers.** Toggle then Hold for aim, Hold then
  Toggle for crouch, as every other picker lists its default first.
- **The Look tab is labelled Looks.** William's wording in the playtest list; its id and save keys stay `look`.
- **Realistic colours keeps its saved value and plumbing.** Only the Settings row left; MR1 moves the choice to the
  Loadout's Colour tab and owns its code from there.
- **The two model Dev switches are BD1's.** Removing their rows is the same change as removing their code paths and
  flipping the Blender default, so BD1 takes all of it (agreed between the threads; the block says so).
- **The settings rulings are one DECISIONS line.** William's Dev 6 defaults and order (also in DECISIONS).

## Known issues left

- None.

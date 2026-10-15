# AC1 · Hide the ammo counter (Dev 6 item 46)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | 1 | Opus 5.5 (build thread) | ✓ 19 s | ✓ 491 s | ✓ 915 s | ✓ 1626 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~2 h | QA 68k, changelog 23k, critic 50k |

- Reports in `pipeline/runs/AC1/attempt-1/` (project files): the gate report, QA's and the critic's. The critic's nit on the menu's path (Settings › Gameplay, under its HUD heading) was fixed in the player docs; code comments keep "Settings › HUD", as their neighbours do. Perf ran because two config files changed; the HUD change itself costs nothing per frame.

## Decisions

- **Ammo counter is On by default, under Settings › Gameplay › HUD after Mag hand-off; Off hides the BB counts, not the magazines (also in DECISIONS).** Owner's Dev 6 item 46 with Claude's defaults; no mag-check key (owner).
- **With the counter off each spare magazine's bar stays, full while it holds any BBs and hollow once empty: no fill level, low stripes or caret on the next one.** On a field you feel how many magazines your pouches hold and which are empty, never how full; the caret would say which is fullest.
- **The hollow bar is the only "magazine changed" cue kept.** The reload bar and Reloading, the Empty hint, Last magazine, Out of BBs, the dry-fire click and the Mag key's Low on BBs hint stay, so the game stays playable; a caught magazine's notice drops its BB count ("+1 mag from {name}").
- **The tutorial's Reload step says to keep count yourself while the counter is off (`countHidden`), redrawn at once if changed mid-step.** The step never points at a count the HUD doesn't show.
- **Practice and the tutorial follow the setting like a match.** The range refills its spares every tick, so there the bars always read full.

## Known issues left

None.

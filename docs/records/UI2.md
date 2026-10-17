# UI2 · Compact Match screen and replica panel (Beta 1 playtest items 3, 11)

**Review:** 2 attempts · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-17 | 1 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 125 s (fast) | ✓ 987 s | – not required | ✓ | ✓ | 7/8 Retry (Sonnet) | AC1 Time-out wraps at 1280 px (owner: keep two lines) | ~1 h | QA 72k, changelog 19k, performance 14k, critic 26k |
| 2026-10-17 | 2 | Opus 5.5 (build thread) | ✓ 16 s | ✓ 437 s | ✓ 1004 s | ✓ 2255 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~3 h 30 min (two perf-matrix gates, one cut off by the shell's 1 h limit) | QA 32k, performance 23k, critic 33k |

## Decisions

- **Match rules: each option as wide as its word, 60 px least, as on Settings; names in a 124 px column; the round-time slider 180 px.** Before UI2 the options shared the whole column: at 1920×1080 every row's controls took the full 618 px; now 266 to 493 px.
- **The two rule columns are sized by their rows (566 / 669 px at 1920), one column at 1260 px and below.** House rules' longer options get the room they need beside the shorter Match ones; the old equal halves were 618 / 618.
- **Time-out keeps its full words and stacks on two lines below about 1390 px (was about 1540).** Owner's pick on a decision card, 2026-10-17; the row needs 493 px and gets 421 at 1280 (KNOWN_ISSUES row).
- **The replica panel is 176 px (320 before; 264 at HUD 150 %, 480 before): no picture or name, fire modes as S / B / A, a small 11 × 18 px box per spare magazine filled from its foot, the count as it was.** William's redesign (2026-10-17 12:40), approved from a picture before the build; the full mode name stays as each chip's aria-label.
- **Three-, four- and five-digit counts are 26, 20 and 16 px (30, 24, 19 before).** The count stays no wider than two digits at 40 px, so the chips never take a second line.
- **No empty-magazine hint ("Empty: pull the trigger or press R to reload").** William, 12:47: "Assume the player knows the controls." State words stay (Reloading, Holstered, Last magazine, Out of BBs); prompts outside the panel (Space to vault, Hold G to open the case, Esc to skip, the mag hand-off line) are other features, left for his call.
- **The HUD no longer asks ItemPictures for replica pictures.** With no picture on the panel, `Hud.setPictures`, `CombatPresentation.setReplicaPictures`, `kitSubjects` and the reload-key plumbing for the hint went with it (fewer offscreen renders at match start and on a switch).

## Known issues left

- Below about 1390 px wide the Match screen's Time-out options stack on two lines (KNOWN_ISSUES › Menus, HUD and input, can wait).

# FP1 · First-person hands hold the rifle and its parts cleanly (owner, 2026-10-10)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-10 | 1 | Opus 5.5 (build thread) | ✓ 29 s | ✓ 320 s | ✓ 561 s | ✓ 640 s | ✓ | ✓ | 7/8 Retry, near miss (Opus) | check 3: fitSupportHand walked a Map every frame | ~1.3 h | QA (Sonnet) 45k, changelog (Haiku) 23k, critic (Opus) 48k |
| 2026-10-10 | 2 | Opus 5.5 (build thread) | ✓ 29 s | ✓ 321 s | ✓ 577 s | ✓ 641 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~0.4 h | critic (Opus) 23k |

## Decisions

- **The barrels and muzzle devices were already on the bore; the "second barrel" was the support thumb.** Rendered in isolation, the thumb stood 24 mm out from the handguard's near side, aimed up and out, and in first person read as a dark tube under the barrel.
- **The support thumb lies forward along the handguard's near side, under the side rail.** It reads as a hand on the handguard from the eye, and the side rail keeps its place (`HandPose.thumb.tipAim` aims the thumb's second segment).
- **A fitted vertical grip is held; the angled grip keeps the handguard hold.** The vertical grip sat hidden behind a hand that ignored it; the angled grip's back already meets the palm's heel.
- **With the vertical grip, a reload takes the magazine by its side.** The grip hold carried to the magazine reads as a natural grab, so it needs no hold of its own.
- **The support hand's holds are parts named `hold:<grip>`, one drawn at a time.** No extra draw calls or triangles at once; `fitSupportHand` only changes anything when the grip does.

- **The game chunk's budget goes from 950 to 1,000 kB.** Main was already at 950.2 kB (over) after G11 and G12, and FP1 adds 0.9 kB; a 50 kB step as M50's and M75's (also in DECISIONS).

## Known issues left

- None.

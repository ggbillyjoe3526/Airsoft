# BF1 · Bot figures in the game behind the Dev switches

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 38 s | ✓ 478 s | ✓ 911 s | ✓ 1872 s | ✓ | ✓ | 6/8 Retry (Opus) | Allocations per shot, fade and throw; the Blender scripts unexplained, magazines kept between rounds | ~3 h | QA 80k, changelog 28k, critic 108k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | ✓ 36 s | ✓ 462 s | ✓ 846 s | ✓ 1714 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~2 h | critic 46k |

## Decisions

- **The rigged figures stay behind the Dev switches until they pass M85.** Crouched and walking they stray from the hit volume, so a BB could pass a drawn knee (also in DECISIONS).
- **A rigged figure points its replica where the shot goes.** The aim clips turn the replica only 55 % of their ±60 degrees, so the upper body leans the rest and the spine twists out the rifle stance's 6 degrees (also in DECISIONS).
- **The figure files ship as exported, loaded only with the switches off.** The default download and look stay as they were (also in DECISIONS).
- **Levels of detail at 12 and 28 m on High, 6 and 16 m below.** The middle file is about a third of the triangles and reads the same at that range.
- **Your own body sits 0.17 m behind the eyes, without its head, arms or replica.** The viewmodel already draws the arms and replica, and that distance keeps the camera out of the chest.
- **The rigged drawing is its own chunk, loaded with the figure files.** The game chunk was 1 % over its 1,000 kB budget on CI with it inside, and the default game never draws it (963 kB without).
- **At most 12 thrown magazines lie on the ground at once, pooled, and cleared at each new round.** The oldest goes first, so a long round never piles them up, and a throw allocates nothing.
- **The replica swaps to the pistol 35 % into the switch clip.** That is the point the figure file's own note gives for the swap in the Blender move.

## Known issues left

- The rigged figures don't fit the hit volume as closely as M85 asks, crouched and walking (KNOWN_ISSUES › Figures and art, can wait).
- The rigged robot reloads from its bare chest (KNOWN_ISSUES › Figures and art, can wait).
- The pistol is held in the rifle's grip pose in the sprint, hit call and walk-off, and the Cyber Pistol sits where the gas pistol does (KNOWN_ISSUES › Figures and art, can wait).
- Your own rigged body casts no shadow and shows only looking well down (KNOWN_ISSUES › Figures and art, document).

# IM5 · Smaller figure model files (improvement item 2, owner's ask, 2026-10-12)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 32 s | ✓ 148 s (fast) | ✓ 785 s | ✓ 1608 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~2 h 30 min | QA 27k, changelog 28k, critic 47k |

`human.glb` 4,177 → 2,205 kB (gzip 2,015 → 1,549, Brotli 1,774 → 1,466) and `robot.glb` 4,537 → 2,417 kB (gzip
2,058 → 1,745, Brotli 1,794 → 1,643); 4,485 → 1,212 clip tracks each; parsing about 40 → 15 ms a file. Checked
against Blender's exports through `prepareFigureRig`: geometry, skin, prepared clips and posed bones identical (the
hips under the aim differ by 1e-8); 24 poses on the picture page 0 pixels apart (`concepts/figure-files-packed-2026-10-12/`
in the project files); arms check the same; figure CPU time 1.03 and 1.56 ms after, 1.52 and 1.24 before (container noise).

## Decisions

- **The figure files are packed losslessly after each Blender export** with `tools/blender/bot-figure/pack.mjs`, replacing BF1's "ship as exported" (also in DECISIONS).
- **A track is dropped by the game's own rule** (within 0.00001 of rest, `render/figureRig.ts` `stillAt`), so the file holds exactly what the game plays; dropping only exact rest values would keep 4,327 of 4,485 tracks.
- **Indices use meshopt's INDICES mode, not TRIANGLES**: TRIANGLES starts some triangles at another corner, which moved 11-38 edge pixels on the robot, and it saved nothing here.
- **No vertex reordering, quantisation or filters**: reordering made the meshopt data 5 % larger, and the others change values.
- **The PNG textures are re-deflated, not converted**: the same pixels and colour chunks, 0.6 MB smaller across both files.
- **Every key of a kept track stays**: dropping exact repeats saved 4 % of the keys but can move a value by a rounding step between keys.

## Known issues left

- None.

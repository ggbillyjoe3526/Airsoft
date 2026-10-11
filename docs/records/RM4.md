# RM4 · Blender models locked behind two Dev switches, code-built models by default (owner's ask, 2026-10-11)

**Review:** 1 attempt · 7/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-11 | 1 | Opus 5.5 (build thread) | ✓ 30 s | ✓ 361 s | ✓ 640 s | ✓ 620 s | ✓ | ✓ | 7/8 Accept (Opus) | – | ~1 h 30 min | QA 47k, changelog 18k, critic 48k |

Check 8 (the folder README didn't name `render/modelFiles.ts`) was fixed in the same push.

## Decisions

- **Both switches are on by default, and with the Dev tab hidden they apply as on** (owner, 2026-10-11; `docs/DECISIONS.md` › Art direction and graphics). A fresh save fetches no Blender file.
- **"Disable all models" covers every Blender file**: the replicas and their parts (including the small shape bots carry), the figure model, and the menus' battery, LiPo and gas bottle pictures, which fall back to their line drawings. "Disable figure models" covers only the figure model, `src/assets/models/characters/figure.glb`, not in the build yet, so it is ready when the figure lands.
- **Files load the first time a switch lets them in and stay for the visit** (`render/modelFiles.ts`), so flipping back and forth costs one download. A change applies from the next match or range; a match under way keeps the models it was built with. The menus' pictures redraw at once (`ItemPictures.forget`, the slot's key carries the generation).

## Known issues left

None.

# RM3 · Battery, LiPo and gas bottle pictures from their Blender models (owner's ask, 2026-10-10)

**Review:** 1 attempt · 8/8 · Accept (Sonnet)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-10 | 1 | Opus 5.5 (build thread) | ✓ 41 s | ✓ 488 s | ✗ 848 s (a second tab waits behind a notice until Play here: timed out reaching the title screen in the full run, outside this diff; passed alone in 10.6 s) | ✓ 850 s | ✓ | ✓ | 8/8 Accept (Sonnet) | – | ~1 h | QA 42k, changelog 24k, critic 40k |

The models were built in the owner's Blender 5.2 (project files `models/power-sources/`, list
`plans/replica-and-figure-models-list.md` items 21-23).

## Decisions

- **Menu pictures only** (owner, 2026-10-10): power sources never show in a match; gas starts full and batteries sit inside the replicas.
- **Drawn in the game from the models, in the replicas' picture studio** (`render/powerSourceModels.ts`, `ItemPictures`), not pre-rendered images, so they share the replicas' light, tone curve and transparent background. A file loads the first time a menu pictures it, not at start.
- **One gas bottle for three gases:** its `Label` material is painted per pool ID (`POWER_SOURCE_FILE.pictures`: green, red, near-black). A deliberate default: the colours read as the gas's name.
- **The files' metal is capped at 0.35 metalness,** as the replicas' steel without reflections: fully metallic, the bottle drew black in the studio.
- **Power-source pictures are wide** (the menus' item slots are), and the stick batteries are tipped up 0.3 rad so they read as more than a line.
- **Every menu picture now fits its slot whole** (`.pic-slot img` out of the grid's flow): square pictures overflowed the Armory's 64 px slots and Customise's large replica picture lost its top and bottom. This also covers part of M99 (replica pictures whole); M99 keeps its own Loadout check and test.

## Known issues left

None.

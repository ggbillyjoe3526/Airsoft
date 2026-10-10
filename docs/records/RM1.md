# RM1 · The AEG and gas pistol drawn from their Blender models, moving parts and all (owner's ask, 2026-10-10)

**Review:** 1 attempt · 7/8 · Accept (Opus) · check 8 (docs) closed in the records commit

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-10 | 1 | Opus 5.5 (build thread) | ✓ 32 s | ✓ 347 s | ✓ 652 s | ✓ 677 s | ✓ | ✓ | 7/8 Accept (Opus) | – (two earlier gate runs before the critic: Depot Low triangles +11 % until the baselines were re-recorded, then the baselines outside touches) | ~2 h | QA 40k, changelog 25k, critic 106k |

The models were built in the owner's Blender 5.2 through his Blender connection (project files `models/`, list
`plans/replica-and-figure-models-list.md`); the `.blend` files stay on his PC.

## Decisions

- **The animations are posed from the game's state, never played on a clock** (`render/replicaRig.ts`): the trigger from each shot (held at its peak through full auto), the selector at its fire mode (semi half its clip, burst three quarters, auto the end), the sights folded while an optic is fitted, the reload by its progress. So a pose always matches what the game is doing.
- **Moving parts are skinned into the body's own meshes** (one bone per part, rigid weights), so a rigged file costs no draw call over a still one; the hands' draw calls are equal to or below the built-in models' at Low and High.
- **The magazine is never a bone:** the viewmodel moves it and the support hand by code, as before.
- **The Cyber Pistol's trigger now moves on each shot too** (its file was re-exported with Fire, Reload and Inspect clips); its look, triangles and draw calls are unchanged. A deliberate default: every replica with a file animates the same way.
- **The perf baselines were re-recorded** (pipeline/README.md › Baselines): the AEG file adds about 2,750 visible triangles in the hands on Low and each bot's rifle is 244 triangles against 120 (Depot Low 26.9k → 30.0k, +11 %), all far under the 150k line; draw calls are equal or fewer everywhere (Neon Extraction Medium 139.56 → 133.78).
- **A gas pistol figure's frame counts the moving slide** when finding the back of the slide, so the figure's pistol sits where the built-in one did.
- **Bots' torch and silencer stay built-in** over the file's rifle shape; first-person arms and the figures are not modelled (owner, 2026-10-10 09:32).

## Known issues left

- The model files' Inspect animations and the gas pistol's Blowback are not played (KNOWN_ISSUES, Replicas).

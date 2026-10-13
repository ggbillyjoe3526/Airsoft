# RM9 · The human figure redesigned from the owner's references, with four heads (owner's ask, 2026-10-13)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-13 | 1 | Opus 5.5 (build thread) | ✓ 20 s | ✓ 574 s | ✓ 1020 s | ✓ 1995 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~3 h 40 min (with the Blender rounds) | QA 40k, changelog 20k, critic 51k |

## Decisions

- **Four heads, one per figure by its id, and the team colour on the vest as well as the armbands, patches and
  bands.** The owner's rulings of 2026-10-13 (`docs/DECISIONS.md` › Art direction and graphics).
- **Each head is built on its own copy of the balaclava, and the cloth a hat or helmet hides is deleted.** Nothing
  pokes through a crown or brim, and the triangles go to what is seen (`bot22.py` `_drop_covered`).
- **The figure keeps v11's skeleton, scale and clips.** The hand fits to the replicas, the crouch and the hit volume's
  legs (IM8) stay exactly where they were; only what is drawn changes.
- **One texture atlas and three materials (`Outfit`, `TeamColour`, `Lens`), baked in Cycles from procedural
  materials.** Three textures instead of five, with the cloth relief and the occlusion baked in.
- **The v12 layers are `bot20`-`bot22`, and the head builders are named `head_*_v12`.** The robot redesign's layers
  are `bot18` and `bot19`, and `bot12` has its own `head_boonie`: every layer runs in one namespace, so names must not
  collide.
- **Built in the owner's Blender 5.2, so a headless rebuild won't match the meshes to the bit.** Blender's export, its
  sidecar and the .blend are in the project files (`models/bot-human/v12/`); packing that export gives the shipped
  file byte for byte.
- **The sprint gap stays.** The thin air while sprinting comes from the hit volume's upright upper body, not the model.

## Known issues left

- The human has no rest-on-cover or vault clip yet: the robot redesign's shared scripts make them and splice them in
  after this merges; `KNOWN_ISSUES.md` › Figures and art.
- The hit volume's upper body is still a little bigger than the figure (5.5 % thin air standing to 14.5 % sprinting,
  worst head); `KNOWN_ISSUES.md` › Figures and art.

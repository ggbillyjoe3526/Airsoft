# RM6 · The AEG Rifle redesign (owner's ask, 2026-10-12)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 41 s | ✓ 502 s | ✓ 931 s | ✓ 1893 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h 40 min | QA 39k, changelog 28k, critic 35k |

The critic's two nits (a stray comment in `aegSights.test.ts`, the receiver rail's height repeated there) were fixed in
the same push.

## Decisions

- **The owner's ruling on the look and the sights** is in `docs/DECISIONS.md` › Replicas, Loadout, Armory and economy.
- **One sight line, 0.088 m over the origin, for the model file and the built-in rifle.** Equal heights aim level, so
  the built-in front post can stand nearer on its shorter handguard without changing the hold, and one `ironSight`
  serves both models.
- **The barrel keeps its old length.** The CQB look comes from a long slotted handguard to 0.505 m over the same
  barrel, so the muzzle layout, the parts and the bots' rifle length stay as they were.
- **Built in a separate, headless Blender** (5.0, from scripts) as a new file, `aeg_rifle_v2.blend`, so the owner's
  Blender stayed free for the pistol threads and `aeg_rifle.blend` is untouched. Spec and scripts are in the project
  files (`plans/aeg-rifle-v2-model-spec.md`, `models/aeg-rifle/v2/`).
- **The WebGPU perf baselines were not re-recorded.** The gate warned they are old; this change moves what perf
  measures by the built-in rifle's sights only (224 fewer triangles at Low).

## Known issues left

None.

# RM7 · The GBB Pistol replaces the Gas Pistol (owner's ask, 2026-10-12)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✓ 47 s | ✓ 695 s | ✓ 1174 s | ✓ 2236 s | ✗ (a renamed test fixture outside touches) | ✓ | – no critic on a failed gate | scope: `pipeline/contentReport.test.mjs` names the pistol | ~1 h 40 min | QA 57k, changelog 31k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | ✓ 31 s | ✓ 684 s | – passed on attempt 1, no game code changed since | – passed on attempt 1 (16 runs), no game code changed since | ✓ | ✓ | 8/8 Accept (Opus) | – | ~40 min | critic 73k |

Attempt 2 also merged origin/main (the Cyber Pistol and AEG Rifle redesigns, RM5 and RM6); CI runs the smoke test on
the merged head.

## Decisions

- **The Gas Pistol becomes the GBB Pistol, same numbers, slide locked back on empty** (owner, 2026-10-12) (also in DECISIONS).
- **The built-in pistol's slide rides a one-bone rig in its own meshes** (`replicaRig.ts` `slidingRig`), so the blowback shows with Blender models off (the default) at no extra draw call.
- **The built-in slide and sights come down to the model file's sight line**, one `look.ironSight` for both (as RM5 and RM6 did); its grip, frame and magazines stay as they were.
- **The lock takes hold once the last shot's Fire passes `firePeak`** (the slide is already fully back) and lets go when the reload refills the magazine.
- **The replica's id stays `pistol` and its pool ID `000001`**: saves, settings and code keep their keys; only the name players see changed.
- **Fixed:** the KNOWN_ISSUES row "The gas pistol model file's Blowback animation is not played" (removed).

## Known issues left

- None.

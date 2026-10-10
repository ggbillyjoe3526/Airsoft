# RM2 · An Inspect key: each replica's inspect animation plays in first person (owner's ask, 2026-10-10)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-10 | 1 | Opus 5.5 (build thread) | ✓ 42 s | ✓ 513 s | ✓ 831 s | ✓ 929 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1.5 h | QA 39k, changelog 28k, critic 60k |

## Decisions

- **Y is the Inspect key** (Valorant's): F is Follow me, B the fire mode, T the torch, G use, and I is kept for the inventory planned for 0.1 Dev 6. Rebindable like every other action; a save made before it gets Y unless the player bound Y elsewhere.
- **The whole replica's turn is code, the parts are the file's:** the model files' Inspect clips move only parts (the AEG's charging handle, dust cover and hop dial; the gas pistol's slide; the Cyber Pistol's magazine), so `VIEWMODEL.inspect` holds one pose per first-person model (rifle, pistol, cyber), side on with the right side to the eye, tuned from screenshots. The file's clip sets the length (3 s, 2 s, 2 s); a model without a file uses the pose's own length.
- **The Cyber Pistol's battery check** moves only its magazine bone, which the game never made a bone (the viewmodel moves the magazine by code), so the files' magazine tracks are now read into the replica's space (`ReplicaFileRig.magazine`) and the viewmodel adds the Inspect one to the magazine.
- **It never gets in the way:** presentation only (no command), started only while alive and with the hands free (no reload, draw, sprint carry, aim or hit call). A shot ends it at once with the pose taken off before the BB is drawn from the muzzle; anything else eases it back over 0.15 s with the parts at rest at once. A second press mid-inspect is ignored.
- **Sounds reuse existing cues** (selector and torch clicks, the replica's dry-fire and magazine-in), timed to the parts; no new synthesis.
- **The AEG's hop dial ends its clip a notch turned** and snaps back at the end, under the dust cover the clip has closed by then.

## Known issues left

- None new. Bots don't inspect (first person only, as asked).

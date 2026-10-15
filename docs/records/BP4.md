# BP4 · Blender models bug pass (Dev 6)

**Review:** 1 attempt · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | 1 | Opus 5.5 (build thread) | ✓ 27 s | ✓ 795 s | ✓ 1314 s | ✓ 2310 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~6 h (with the pictures and the Blender clips) | QA 124k, changelog 25k, critic 102k |

## Decisions

- **Checked on the game's own renderer, headless: 107 third-person pictures in a stopped match (each figure posed by
  the game's RiggedFigure), then first-person runs of every replica, optic and reload.** The owner's Blender stayed
  closed; review pictures are in the project files (`concepts/blender-models-bug-pass-2026-10-15/`).
- **The holstered clips are one layer both figures share (`bot23.py`: Holster, the arms hanging, and Holster_Sprint,
  the arms pumping on the Sprint's own stride), spliced into the shipped files.** The skeleton is the same, as with
  RM10's clips; a headless rebuild moves a few of the robot's vertices, so `unpack.mjs` turns a packed figure back
  into a plain export for `splice.mjs`, and `pack.mjs` packs it again to the same bytes plus the clips.
- **Holstered, the rifle rides slung on the chest bone: butt 0.17 m right of the spine at 1.42 m, tilted 0.75 rad
  (about 43°) from upright with the muzzle down to the left, 0.19 m behind the spine line (0.27 m over a pack, the
  robot 0.17 m) (`FIGURE_RIG.sling`).** The usual back carry; steeper (0.52 rad) put the muzzle on the ground in the
  kneel, and the butt any higher stood beside the head.
- **Drawn from the holster, the rifle comes to the hand at the built-in figures' swap point (`FIGURE.holster.swapAt`)
  and the arms rise to the aim over the rest of the draw.** One timing for both kinds of figure.
- **A figure file without the Holster clips keeps holding its replica while holstered (both clips are optional).**
  Older or third-party figure files still load.
- **A rigged figure's shot draws its BB from the replica's own muzzle (`RiggedFigure.muzzleWorld`), the built-in
  figure's place only when none is drawn in the hand.** Measured 0.15-0.21 m off before (0.89 m in the sprint), 0 after.
- **A rigged figure builds one held replica per loadout slot and draws the one out.** The Cyber kit (bot-kits.md)
  carries two pistols, and the figure showed the first whichever was drawn.
- **The orange muzzle disc counts as the file's own only on the replica's own muzzle pieces, so a file whose tip only
  its parts file's silencer paints gets the disc, and the replicaRig draw-call test allows that one more draw.** The
  gas pistol's file has no tipped muzzle of its own; the silencer's tip doesn't cover the bare muzzle.
- **The gas pistol's reload support hand sits about 2.6 cm low on the magazine's base pad in the file's numbers; left
  as it is.** Not visible in first person at any point of the reload (review pictures).
- **A BB from a fitted silencer starts at the bare muzzle, inside the silencer, and from the last drawn frame.** It
  is out of the silencer in the BB's first step and the figure is at most a frame behind (the critic's note).
- **`riggedFigure.ts` (695 lines) stays one module for now; the held replicas and the sling move to their own module
  before it grows again.** Can wait: the critic's note on check 7, no behaviour depends on it.
- **Thrown magazines keep borrowing their thrower's material (its light, and its fade as it walks off); checked, left
  as is.** They lie 3 s (the sidecar's lifetime) a step or two from the thrower, so the difference doesn't show.

## Known issues left

- A holstered rigged figure that vaults keeps the Vault clip's arms, its right hand closed as if on the slung rifle
  (KNOWN_ISSUES › Figures and art, can wait).
- The rigged figures still draw no parts on their far model (KNOWN_ISSUES › Figures and art, can wait).

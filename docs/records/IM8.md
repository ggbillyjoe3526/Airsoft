# IM8 · The figures' crouch and walk moves match the hit volume (owner's ask, 2026-10-12)

**Review:** 2 attempts · 8/8 · Accept (Opus)

## Attempts

| Date | Attempt | Worker model | build | tests | smoke | perf | scope | changelog | Critic | Retry reason | Wall time | Worker tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-12 | 1 | Opus 5.5 (build thread) | ✗ 6 s (error TS2379) | ✓ 635 s | ✗ 13 s (no server: the build failed) | ✓ 2091 s | ✓ | ✓ | – (failed gate) | a QA test passed an explicit `undefined` for an optional rule | ~2 h 20 min | QA 35k, changelog 30k |
| 2026-10-12 | 2 | Opus 5.5 (build thread) | ✓ 23 s | ✓ 669 s | ✓ 1116 s | ✓ 2069 s | ✓ | ✓ | 8/8 Accept (Opus) | – | ~1 h 10 min | critic 90k |

The critic's two notes were fixed in the records commit, with no change in behaviour: the backward step's two
thresholds moved into `FIGURE_RIG.backStep` (the touches gained `src/config/figureRig.ts`), and the throwaway meshes
the leg reader poses free their default materials.

## Decisions

- **The hit volume's legs are the figures' own (the owner's pick, "Legs follow"; `docs/DECISIONS.md`).** No clip can
  make a knee bend fit the volume's straight, swinging legs: crouched and walking, the misses were mostly the legs.
  With the figures drawn, the volume's thighs, shins and boots sit on the clip's joints, sampled 30 times a second from
  the figure file as it loads; the head, chest and hips stay the built-in volume's, so cover and crouch rules are
  unchanged.
- **The walk cycle steps at the figures' strides, and their cycle clips play at it.** The volume and the drawn legs then
  share one clock, so a planted foot is where the volume's boot is and the feet don't slide.
- **One set of legs for both kinds: the human's.** The robot's legs differ by a couple of centimetres crouched; the
  check measures the robot against the human's legs and holds it to its own limits.
- **The volume takes the clip blend the character's state asks for at once.** The figure eases between clips over
  about a tenth of a second; the two part only while a stride starts, stops or turns.
- **One walk cycle drives every stepping clip, and it runs backwards once a crouch is more than half way down and the
  step goes back** (`FIGURE_RIG.backStep`). The crouched walk was made walking ahead; for the moment a crouch passes
  half way while stepping back, the back-step clip blended under it plays backwards too, in the volume as on screen.
- **Kneel and crouch walk lower the hips 0.62 m, the volume's crouch.** The kneel sits back on the rear heel, toes
  tucked; the crouch walk is a deep, knees-out walk whose trailing knee turns further out so it clears the floor
  (bot17.py). The robot's kneeling shin touches the floor by about half a centimetre, a compromise against lifting its
  head over cover.
- **A peek rolls the upper body about the hit volume's pivot, twist then pitch then roll.** The drawn chest and head
  then stay inside the volume's when a player leans; aiming level, the replica stays on the shot.
- **The figure files are rebuilt in a headless Blender in the cloud and the re-made clips spliced into the approved v10
  exports** (`tools/blender/bot-figure/headless.py`, `splice.mjs`). The pip Blender build re-makes the clips to the bit
  but not the meshes; a second rebuild made the shipped files byte for byte.

## Known issues left

- The figures' upper bodies are still a little smaller than the volume's (thin air, at most about 18 % sprinting);
  `KNOWN_ISSUES.md` › Figures and art.
- Peeking while aiming well up or down points the replica up to about 19° off the shot; `KNOWN_ISSUES.md` › Figures
  and art.

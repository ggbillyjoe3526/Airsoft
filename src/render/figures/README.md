# src/render/figures

The players and bots as drawn.

- `characterRenderer.ts` draws them all; `characterModels.ts`, `figureHuman.ts` / `figureRobot.ts` are the built-in
  figures, built from `figureShapes.ts` (tapered limbs, bands, shells and the joint maths), `figureParts.ts` (each
  detail level's segment counts), `figurePalette.ts` (a figure's colours from its team colour), `figureHands.ts`
  (third-person hands) and `figureReplicas.ts` (the blocky replicas they carry); `figureMix.ts` picks which figures are
  robots this match; `externalModels.ts` loads the optional figure GLB (M25a). `figureFinish.ts` (the per-vertex
  finish) and `figureCamo.ts` (the team camo printed per pixel on clothes and sleeves, G11).
- The rigged Blender human and robot (BF1, every player and bot since BD1): `figureRig.ts` (a kind's files taken apart
  into bones, merged meshes and clips), `figureLegs.ts` reading the legs' clips out for the hit volume (IM8) and
  `figureBody.ts` the upper body's, with each figure's fitted shape (HV1), `figureRigFinish.ts` (a kind's plain
  one-colour materials drawn as one vertex-coloured finish, BD1), `figurePose.ts` (the pure blend of clips from the
  character's state), `riggedFigure.ts` (one figure: skinned, posed, each loadout replica on the grip bone with its
  fitted optic, grip, laser, barrel and muzzle part, BG1, the reload's magazines, the rifle slung on the back while
  holstered and its drawn muzzle for the BBs, BP4, your first-person body) and `thrownMagazines.ts` (the empty
  magazines thrown in reloads).
- `modelFiles.ts` imports `figureRig.ts` on demand, so the four ride in their own chunk and the game's carries only
  their types; it loads the replica files and the figure model as the game starts (BD1).

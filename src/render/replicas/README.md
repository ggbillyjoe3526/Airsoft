# src/render/replicas

The replicas, the held one and its hands, and the menus' pictures of them.

- `replicaModels.ts` (the bodies and assembly), `replicaParts.ts` (optics, grips, magazines and the other fitted
  parts), `replicaBuilder.ts` (the mesh builder both use), `replicaFiles.ts` (the Blender model files, M101, RM1, and
  their parts' sight-line and under-laser markers, RM8, and a laser's lens, BP4; `figures/modelFiles.ts` loads them) and
  `replicaRig.ts` (their moving parts, skinned and posed from the game's state, RM1; the Inspect key plays a file's
  Inspect clip, RM2; the built-in GBB Pistol's slide rides one too, and a GBB's slide locks back on an empty magazine,
  RM7), `replicaFinish.ts` (moulded speckle), `replicaSheen.ts` (the environment reflection).
- The held replica: `viewmodel.ts` (a second render pass), `replicaArms.ts` (the first-person arms), `handModels.ts`
  and `robotHands.ts` (a robot's first-person hands on the same skeleton), and `eyepiece.ts` (aimed, a scope's rear
  glass shows the world: a depth-only disc in the held replica's pass).
- `itemPictures.ts` draws them off screen for the menus, with the power sources from `powerSourceModels.ts` (the
  menus' battery, LiPo and gas bottle, RM3).

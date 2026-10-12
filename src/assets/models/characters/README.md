# Character models

- `human.glb`, `robot.glb` and their sidecars `human.json`, `robot.json`: the rigged Blender figures (BF1), made with
  `tools/blender/bot-figure/` and approved by the owner on 2026-10-12, then packed with `tools/blender/bot-figure/pack.mjs`
  (meshopt, losslessly; IM5). Each has LOD1 and LOD2 meshes and 23 clips; the
  sidecar gives the clips' lengths and paces, where the replicas sit on the `Grip_R` bone and where the magazines go in
  the reloads. The game draws them only with the Dev tab's "Disable figure models" and "Disable all models" both off
  (`config/figureRig.ts`, `render/figureRig.ts`), and fetches them only then.
- `figure.glb` (none yet): a CC0 player and bot model the game picks up when it's built or the dev server starts,
  drawn with the same switches off when the rigged figures aren't there. Node names, team colours, scale, the size
  budget and where to find CC0 models: [docs/CC0_ASSETS.md](../../../../docs/CC0_ASSETS.md).

Record every model in [docs/ASSETS.md](../../../../docs/ASSETS.md).

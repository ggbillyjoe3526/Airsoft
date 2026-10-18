# src/render/match

A match's presentation: what the session draws and shows each frame beyond the field.

- `matchPresentation.ts`: other players, hit feedback, spectator camera (`spectatorCamera.ts`: who is worth watching
  and the camera that follows them), round banner, scoreboard, the flag (`flagRenderer.ts`: the pole and its rippling
  cloth), Extraction's exits (`exitRenderer.ts`, instanced) and cases (`caseRenderer.ts`), and the HUD markers, each
  placed by one project-and-pin step (`placeMarker`, over `screenMarker.ts`: where a world point shows on screen).
- `combatPresentation.ts`: after each tick it consumes `state.events`; each frame it draws the BBs, puffs, tossed
  magazines, leaves a BB knocks out of a bush, a puff of dust off a noisy prop run into (`propNoise`, NP1: a bigger
  impact puff in the prop's dust tint), the held replica and the HUD, and shows the vault prompt from the tick's answer
  (`Character.vaultReady`, DX6). It casts no rays. Also `cameraRig.ts` (`LeanViewEase` eases a lean a wall cuts, within
  `RENDER.leanCut`, KI1).
- The practice range's targets: `rangeTargetsRenderer.ts` (instanced plates, figures and the START plate, moved by the
  sim's data; a lit challenge target draws through an orange twin), `rangeTargetGear.ts` (the posts, swinger frames,
  mover rails and pop-up motor boxes, merged once).

# src/render/light

Light and the sky.

- `lighting.ts` (sun and sky fill; on High the shadow map follows the view), `lightingPreset.ts` (day or night),
  `atmosphere.ts`, `lightPools.ts`, `torchBeams.ts`, `lightFixtures.ts` (the camp fires and lanterns a map's lights
  stand in), `nightSky.ts` (stars and the moon by night), `contactShadows.ts` (the soft disc under each figure).
- Baked bounce light: `lightBake.ts`, `probeGrid.ts`, `probeFile.ts` (the file format, loaded in a chunk of its own),
  `bakedLight.ts`, read by the surfaces' node patch (`surfaceShader.ts`, which also weathers them).

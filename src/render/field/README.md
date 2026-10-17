# src/render/field

The field: the map's blocks as merged meshes, its terrain and plants, and the surface textures they are drawn with.

- `mapMeshes.ts` turns blocks into pieces (`mapPieces/`: the prop builders as one table by kind, their styles and
  shapes) merged per texture by `cuboidMesh.ts`, then restyles a built map for a new look and disposes it.
  `mapMeshCache.ts` keeps the last map's meshes for the Renderer.
- Look-only data is drawn by `mapSigns.ts`, `mapDecals.ts`, `natureShapes.ts`, `canopyMeshes.ts`, `terrainMeshes.ts`,
  `foliageMeshes.ts` (the city's props are builders in `mapPieces/cityProps.ts`).
- Textures: `proceduralTextures.ts` draws each at the quality's Texture detail, the city's flat finishes capped at 512²
  (`drawnSize`, M78), with `natureTextures.ts`, `cityTextures.ts` and `textureLibrary.ts` (over `texelNoise.ts`, the
  tiling value noise they are drawn from) and `surfaceNormals.ts` (a normal map from a picture's brightness);
  `surfaceMaterials.ts` picks Lambert or Standard per surface.
- `vertexOcclusion.ts` bakes each vertex's occlusion as the map is built; `shadowProxy.ts` is a mesh's own cut-down
  stand-in for the shadow map.

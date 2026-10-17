# src/render/field/mapPieces

What each block is drawn as (A8): the prop builders, one per block kind, in one table. `../mapMeshes.ts` merges the
pieces, restyles and disposes; nothing here touches a mesh.

- `cityProps.ts`: Neon Heights' street props (kiosks, benches, bins and the rest), and their textures.

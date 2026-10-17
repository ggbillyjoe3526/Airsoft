# src/render/field/mapPieces

What each block is drawn as (A8): the prop builders, one per block kind, in one table. `../mapMeshes.ts` merges the
pieces per texture, restyles a built map and disposes it; nothing here makes a mesh.

- `pieceTable.ts`: `PIECE_BUILDERS`, every `BlockKind`'s builder, and `blockPieces` (a finished block, M34f, first).
- `sitePieces.ts`: containers, walls (with their coping), crates on pallets, recessed barriers and raised floors with a
  ceiling under them. `propPieces.ts`: the site props (M25b): toilets, racks, gabions, wrapped pallets, IBCs,
  sandbags, generators and skips. `cityProps.ts`: Neon Heights' street props (cabinets, vending machines, stalls,
  planters, booths, vans), their textures and their glowing signs.
- `blockStyles.ts`: each kind's surface, UVs, tint palette, shadow and grime, and a block's tint and shade from a hash
  of its position (a symmetric map looks symmetric). `pieceKit.ts`: the `Piece` and the bricks builders share.
- `pieceShape.ts`: what map detail adds to a piece (bevel, tiles, baked shade, the ground's value noise).
  `rampWedge.ts`: a ramp's wedge, the one kind not built from boxes.

# src/render/dressing

Set dressing (`MapData.dressing`, look only, placed the same way every time from its seed) and the horizon beyond the
field.

- `mapDressing.ts` places it, with `dressingSpots.ts` (the rules for where a loose piece may lie), `woodsDressing.ts`
  (fallen branches, twigs, logs and leaf drifts on terrain), `streetDressing.ts` (pasted posters), `neonDressing.ts`
  (tube-letter signs and their flicker); `dressingMeshes.ts` merges the lot into one junk mesh and one puddle mesh, and
  `dressingAtlas.ts` draws the dressing's pictures (logos, dirt, tags, litter) into the decal atlas.
- The horizon beyond the field is `skyline.ts` (towers, treelines, hills, silos, skybridges, and the lights they carry
  at night; MS1 hangs wall units and lantern cables over Neon Heights' streets through it). `skylineSeen.test.ts` keeps
  every piece of a walled map's skyline in some player's sight (owner: what no player sees is removed) and the hung
  pieces out of a player's room.
- Moving pieces are owned by `dressingEffects.ts`: `smokePlumes.ts` (chimney smoke and vent steam), `fireflies.ts`,
  `passingPlane.ts`. The skyline's lights and the plane ride the tree ring's draw call (`skyHost.ts`).

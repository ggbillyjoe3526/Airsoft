# Art bible

The look every visual change is measured against (final alpha audit, section 5; FA7). Read it before changing how
anything looks.

## The look

- **Reference.** Counter-Strike and Valorant, not Call of Duty or Battlefield: clean, stylised and readable, with good
  materials and light. Replicas look like toys. No gore.
- **Quality levels.** Low keeps its cost: the overhaul is for Medium, High and Custom.

## Colour and readability

- **The field** is a sunny weekend site, not a base. Warm concrete greys, sand, cream and off-white for the ground,
  walls and barriers.
- **Site colours** (bottle green, mustard yellow, slate, teal) go on containers, skips and the generator.
- **Team colours** (blue, orange) appear **only** on players and the flag, never on props (`STYLES` already enforces
  this).
- **Readability beats detail.** Silhouettes first, then value contrast, then colour. A figure is always lighter or
  darker than what is behind it. Shaded sides stay warm, never black.

## Material families

Four families carry the whole game, and every asset is one of them.

- **Toy polymer.** Matte, roughness 0.5–0.6, zero metalness, a faint uniform sheen from the environment map. Saturated,
  clean colour, with a hairline lighter edge on every bevel.
- **Painted steel.** Roughness 0.35–0.45, metalness 0.6–0.8, picks up the sky in the environment map. Paint chips only
  where a BB would hit (plate centres, rail tops), never rust.
- **Fabric and rubber.** Roughness 0.9–1.0, no specular. Folds and seams are drawn as geometry and as a 1–2 shade
  darker vertex-colour band, never as texture noise.
- **Site surfaces** (concrete, block, corrugated, wood). The procedural canvases, with a low-frequency tint variation
  so no two metres repeat. Dirt only as the existing foot-of-wall grime band and a soft baked occlusion in corners.

## Edges and wear

- **Edges** are what make the game look stylised instead of flat. Every box a player sees within 10 m has a 5–12 mm
  bevel or chamfer with a lighter vertex colour on the bevel face (the "CS edge highlight"). Nothing has a razor edge,
  and nothing has a decal that pretends to be geometry.
- **Wear** is restrained and friendly: scuffed polymer on grip edges, a worn rail top, chalk marks and lane paint on
  the floor. No battle damage, no blood, no bullet holes (BBs leave dust, never marks).

## Light

A single warm sun with a cool sky fill and a warm ground bounce. Shadows are soft-edged and short.

The environment map that gives polymer and steel their sheen is **the game's own sky**. So the look stays consistent at
every quality level, and a night map's sky changes everything at once.

## Where it lives in the code

- **Light.** `render/lighting.ts` (sun, sky fill), `render/replicaSheen.ts` (the environment map from the sky,
  Environment lighting), `render/renderer.ts` (tone mapping, Neutral by default).
- **Site surfaces.** `render/proceduralTextures.ts` (the canvases), `render/surfaceNormals.ts` (their normal maps),
  `render/mapMeshes.ts` and `render/cuboidMesh.ts` (bevels, edge highlight, grime band, ground variation),
  `render/vertexOcclusion.ts` (the baked corner shade), `render/mapDecals.ts` (stencils, chevrons, the roundel,
  SAFE ZONE).
- **Painted steel.** The dock's tread plate with Environment lighting, the flagpole, the range plates and hardware.
- **The world round the field.** `render/atmosphere.ts` (sky, trees, shrubs, clouds, the sun's disc).
- **Figures, replicas, hands and effects** follow the same families (FA8).

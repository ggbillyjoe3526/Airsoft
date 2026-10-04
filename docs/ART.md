# Art bible

The look every visual change is measured against (final alpha audit, section 5; adopted with FA7, 2026-10-04).
Counter-Strike / Valorant, not Call of Duty / Battlefield: clean, stylised, readable, good materials and light; toy-like
replicas, no gore. Low keeps its cost: the overhaul is for Medium, High and Custom.

The field is a sunny weekend site, not a base: warm concrete greys, sand, cream and off-white for the ground, walls and
barriers; site colours (bottle green, mustard yellow, slate, teal) on containers, skips and the generator; the two team
colours (blue, orange) appear **only** on players and the flag and are never used on props (STYLES already enforces
this). Readability beats detail: silhouettes first, then value contrast (a figure is always lighter or darker than what
is behind it; shaded sides stay warm, never black), then colour. Four material families carry the whole game and every
asset is one of them: **toy polymer** (matte, roughness 0.5–0.6, zero metalness, a faint uniform sheen from the
environment map, saturated clean colour, a hairline lighter edge on every bevel), **painted steel** (roughness
0.35–0.45, metalness 0.6–0.8, picks up the sky in the environment map, paint chips only where a BB would hit: plate
centres, rail tops, never rust), **fabric and rubber** (roughness 0.9–1.0, no specular, folds and seams drawn as
geometry and as a 1–2 shade darker vertex-colour band, never as texture noise) and **site surfaces** (concrete, block,
corrugated, wood: the procedural canvases, a low-frequency tint variation so no two metres repeat, dirt only as the
existing foot-of-wall grime band and a soft baked occlusion in corners). Edges are what make it look stylised instead
of flat: every box that a player sees within 10 m has a 5–12 mm bevel or chamfer with a lighter vertex colour on the
bevel face (the "CS edge highlight"), nothing has a razor edge, and nothing has a decal that pretends to be geometry.
Wear is restrained and friendly: scuffed polymer on grip edges, a worn rail top, chalk marks and lane paint on the
floor; no battle damage, no blood, no bullet holes (BBs leave dust, never marks). Light is a single warm sun with a cool
sky fill and a warm ground bounce; shadows are soft-edged and short, and the environment map that gives polymer and
steel their sheen is **the game's own sky** (so the look stays consistent at every quality level, and a night map later
changes everything at once).

## Where it lives in the code

- Light: `render/lighting.ts` (sun, sky fill), `render/replicaSheen.ts` (the environment map from the sky,
  Environment lighting), `render/renderer.ts` (tone mapping, Neutral by default).
- Site surfaces: `render/proceduralTextures.ts` (the canvases), `render/surfaceNormals.ts` (their normal maps),
  `render/mapMeshes.ts` and `render/cuboidMesh.ts` (bevels, edge highlight, grime band, ground variation),
  `render/vertexOcclusion.ts` (the baked corner shade), `render/mapDecals.ts` (stencils, chevrons, the roundel, SAFE ZONE).
- Painted steel: the dock's tread plate with Environment lighting, the flagpole, the range plates and hardware.
- The world round the field: `render/atmosphere.ts` (sky, trees, shrubs, clouds, the sun's disc).
- Figures, replicas, hands and effects follow the same families (FA8).

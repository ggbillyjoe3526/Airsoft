import type { BlockFinish } from '../map/mapTypes';
import type { TextureSize } from './renderQuality';

// The look of the ground, nature and fixtures, the night sky, and the surface textures and city props. Split from
// config/render.ts in G5, which re-exports every name here: import from there.

/**
 * The ground of a map with terrain (M33c, render/terrainMeshes.ts): greybox grass, a darker green low down to a lighter
 * one at the top of the terrain, each vertex varied by up to `jitter` either way. The art pass gives it a texture.
 */
export const TERRAIN_LOOK = {
  low: 0x4f6b3a,
  high: 0x7d9455,
  jitter: 0.06,
} as const;

/**
 * Bushes (M33e, render/foliageMeshes.ts): greybox clumps of leaves, a dark green that varies from vertex to vertex, each
 * vertex pushed in or out by up to `lump` of the radius so no two bushes have the same outline. `detail` is the
 * icosphere's subdivision (1: 80 triangles a bush). The art pass gives them leaves.
 */
export const FOLIAGE_LOOK = {
  colour: 0x2f5a2a,
  jitter: 0.12,
  lump: 0.14,
  detail: 1,
  /**
   * M33i, on a map lit by a key light from one side: the side facing it turns towards `rim` by up to `rimStrength`, and
   * the leaves below `footFrom` (of the half-height, -1 the very foot) are `footShade` darker, baked. Same triangles.
   */
  rim: 0x93aa9c,
  rimStrength: 0.25,
  footFrom: -0.4,
  footShade: 0.7,
} as const;

/**
 * A map's ground surfaces drawn (M33i, MapData.ground; render/terrainMeshes.ts): each surface's colour (sRGB; grass keeps
 * TERRAIN_LOOK's low-to-high greens), the edge between two surfaces blended over the cells within `blend` cells of a
 * vertex, ground under the trees `underTreeShade` darker again (the baked dark under the pines, CS-style), and the
 * greyscale `groundDetail` tile over it all. `cell` (m) is the ground grid's (map/groundSurfaces.ts), which footsteps
 * read too (M33j). Gravel is strewn with pebbles (`pebbles`: so many a square metre, `size` m across, sunk `sink` of
 * their height into the ground, `depth` their width the other way) in the stone mesh: no draw call of their own.
 */
export const GROUND_LOOK = {
  cell: 1,
  // Trampled earth at the fires, tracks and fort is a light, dry dirt, lighter than the leaf litter, which is darker
  // again under the trees. By moonlight they read dim but brown since M52 (the night preset's light, audit REN-02;
  // render/nightSwatch.test.ts); the spawns stay on grass, which reads best.
  colours: { leaves: 0x55482f, earth: 0x927d60, gravel: 0x857f72, wood: 0x76603f },
  blend: 1,
  underTreeShade: 0.72,
  pebbles: { perSquareMetre: 0.45, size: [0.07, 0.17], height: 0.55, depth: [0.7, 1], sink: 0.35, tints: [0x8c877c, 0x77736a, 0x9a948a], seed: 3391 },
} as const;

/**
 * The woods' shapes (M33i, render/natureShapes.ts): what Woodland's trees, logs and boulders are drawn as, each inside its
 * block (what collides), never more than `maxGap` m short of any point of its box (a BB can stop that far from what you
 * see; the owner's 8 cm). Every preset draws the same shapes (fair silhouettes for all).
 * - `trunk`: an eight-sided post, its corners cut `chamfer` m along each side, lit as if round (normals point out from
 *   its axis). Straight: a taper would leave more than `maxGap` at its top corners. No cap: its top is in its crown.
 * - `log`: horizontal rounds along the block's long side, their edges cut `chamfer` m. A block over `crouchMax` m tall,
 *   or one thinner than `roundFrom` m (a cabin wall), is courses about `course` m high, level with the world's so walls
 *   meet course to course; lower, thicker blocks (fallen trees, log piles) are `rounds` rounds. A course a share
 *   `shade` darker or lighter by its hash; cut ends `endTint` (the pale end grain).
 * - `boulder`: a box rounded `radius` m at its edges, each face cut into `segments` × `segments` facets pushed in by up
 *   to `lump` m (never at its edges), flat-shaded so the facets catch the light; facets facing up turn towards `moss`
 *   by up to `mossShare`; each facet a little lighter or darker (up to `facetShade`), so the stone breaks up its box.
 */
export const NATURE_SHAPES = {
  maxGap: 0.08,
  trunk: { chamfer: 0.113 },
  log: { course: 0.3, crouchMax: 1.3, roundFrom: 0.6, rounds: 2, chamfer: 0.1, shade: 0.1, endTint: 0xc9ad84 },
  boulder: { radius: 0.1, segments: 3, lump: 0.075, moss: 0x6f7550, mossShare: 0.2, facetShade: 0.3, seed: 6151 },
} as const;

/**
 * Tree crowns (M33i, render/canopyMeshes.ts): one merged mesh over a map's `tree` blocks. A trunk `broadFrom` m across
 * or more gets a broadleaf crown of `broad.lumps` lumps (icospheres of `broad.detail`, radius `broad.radius` of the
 * trunk's height, centred at least `broad.lift` of it up, the side lumps `broad.spread` of the radius out); thinner ones
 * a pine: a crown from `pine.apexAbove` m over the trunk's top down `pine.depth` of its height, as stacked
 * `pine.sides`-sided cones (each tier `from`..`to` of that span, `radius` m), varied by up to `jitter` by its hash. No
 * crown comes lower than `minBase` m over the ground, so it never hides a standing figure. A near-black green so crowns
 * read as clean silhouettes against the night sky, darker underneath (`underShade`) and cooler on the moon's side
 * (`rim` at up to `rimStrength`), baked. It casts shadows only where the shadow map follows the view (High).
 */
export const CANOPY = {
  minBase: 3,
  broadFrom: 1,
  pine: { sides: 6, apexAbove: 1.3, depth: 0.66, tiers: [{ from: 0, to: 0.62, radius: 1.75 }, { from: 0.42, to: 1, radius: 1.15 }] },
  broad: { lumps: 3, detail: 1, radius: 0.27, lift: 0.62, spread: 0.45 },
  jitter: 0.15,
  colours: [0x1f3422, 0x26381f, 0x1c3126],
  underShade: 0.6,
  rim: 0x8fa6d8,
  rimStrength: 0.32,
} as const;

/**
 * What gives a map's light (M33i, MapLight.kind; render/lightFixtures.ts and the map's meshes). A fire: `stones` stones
 * round a ring `ringRadius` m out, `logs` charred logs crossed over it, and `flames.cards` crossed additive flame cards;
 * a lantern: a housing `size` m (w, h) with glowing panes, on a bracket to a block within `bracketReach` m, else on a
 * post `post` m square. Fires and panes flicker in the vertex shader (no CPU work on the mesh): the brightness times
 * 1 + `amount` × a weighted sum of sines at `rates` (rad/s), the same as the real pool light's on Medium and High
 * (render/lightPools.ts flicker). Embers: `perFire` sparks rising `rise` m over `life` s, drifting up to `spread` m,
 * `size` m across, one draw for every fire, where dust motes are on (Medium, High).
 */
export const FIXTURES = {
  fire: {
    /** Stones: `stoneSize` m across, `stoneHeight` and `stoneDepth` of that, sunk `stoneSink` m, spaced with up to `stoneJitter` of a gap's turn. */
    stones: 8,
    ringRadius: 0.55,
    stoneSize: [0.17, 0.25],
    stoneHeight: 0.7,
    stoneDepth: 0.85,
    stoneSink: 0.03,
    stoneJitter: 0.3,
    stoneTint: 0x77726a,
    /** Logs from `logOut` of their length out to `logIn` past the middle, rising `logRise` radii; six-sided, ends `logEndShade` darker. */
    logs: 3,
    logLength: 0.95,
    logRadius: 0.07,
    logOut: 0.5,
    logIn: 0.1,
    logRise: 3,
    logSides: 6,
    logEndShade: 0.5,
    logTint: 0x3a2c22,
    /**
     * Flame cards `height` × `width` m, `lift` m off the ground, each in rows (`at` of the height, `width` share, colour,
     * alpha); brightness flickers `flicker` times the light's, the tops sway `sway` m at `swayRates` (rad/s).
     */
    flames: {
      cards: 3,
      height: 0.85,
      width: 0.55,
      lift: 0.06,
      rows: [
        { at: 0, width: 1, colour: 0xffd27a, alpha: 0.9, sway: 0 },
        { at: 0.4, width: 0.8, colour: 0xff8a2e, alpha: 0.7, sway: 0.4 },
        { at: 1, width: 0.15, colour: 0xff5a1a, alpha: 0, sway: 1 },
      ],
      flicker: 2,
      sway: 0.06,
      swayRates: [5.3, 4.1],
    },
  },
  /** Panes `paneHeight` of the housing's height, flickering `flicker` times as much as a fire. */
  lantern: { size: [0.18, 0.26], frame: 0.02, tint: 0x2c2a28, pane: 0xffc870, paneAlpha: 0.8, paneHeight: 0.8, bracketReach: 0.5, post: 0.07, postTint: 0x5a4a3a, postSink: 0.05, flicker: 0.25 },
  flicker: { amount: 0.18, rates: [7.3, 11.9, 17.3], weights: [0.5, 0.3, 0.2] },
  /** Embers start up to `startHeight` m up, at `speed` (a range, times their life's pace), wobbling `wobble` m at `wobbleRate` rad/s. */
  embers: { perFire: 20, rise: 2.4, life: 2.6, spread: 0.35, size: 0.035, colour: 0xffa64d, startHeight: 0.2, speed: [0.7, 1.3], wobble: 0.06, wobbleRate: 3, seed: 2203 },
} as const;

/**
 * The night sky (M33i, render/nightSky.ts), on any preset whose `nightSky` asks for it, on every quality: `stars` points
 * (the preset's count) on a sphere `radius` m round the camera, `starSize` px, above `minElevation` rad and fading towards
 * the horizon until `fadeTo` rad, from a fixed seed; the moon a crisp disc where the key light comes from with a soft halo
 * round it. Unfogged (they are the sky), no depth writes, drawn after the field and before the clouds. Both follow the
 * camera, so they never shift as you move.
 */
export const NIGHT_SKY = {
  radius: 190,
  starSize: [1.1, 2.4],
  minElevation: 0.06,
  fadeTo: 0.5,
  starTints: [0xffffff, 0xdfe8ff, 0xfff1d8],
  seed: 7331,
  moonSegments: 40,
  haloSegments: 32,
} as const;

/** The surface textures every map's set has (render/proceduralTextures.ts), drawn on canvases at the title screen. */
export type CoreSurfaceId = 'concrete' | 'blockWall' | 'crate' | 'corrugated' | 'steelPlate' | 'barrier' | 'sandbag' | 'gabion';

/**
 * The woods' surfaces (M33i): bark, weathered fence boards, stone with lichen and a greyscale ground tile. Drawn only
 * when a map that uses them loads (render/mapMeshes.ts texturesFor), so Depot's textures and GPU memory are as before.
 */
export type NatureSurfaceId = 'bark' | 'planks' | 'stone' | 'groundDetail';

/**
 * The city's surfaces (M34f, render/cityTextures.ts): the block finishes (MapBlock.finish: painted plaster, metal
 * cladding, tiles, asphalt, paving) and glass for the city props' windows and screens. Drawn only when a map that uses
 * them loads, as the woods' are.
 */
export type CitySurfaceId = BlockFinish | 'glass';

/**
 * The texture library's own surfaces (G6, render/textureLibrary.ts): worn paint on steel for the set dressing to come
 * (G8, G9). Drawn only when a map uses it, as the woods' and the city's are.
 */
export type LibrarySurfaceId = 'paint';

/** Every surface texture (render/proceduralTextures.ts). */
export type SurfaceTextureId = CoreSurfaceId | NatureSurfaceId | CitySurfaceId | LibrarySurfaceId;

/**
 * The look of the field's surfaces and props (M14, render/proceduralTextures.ts and render/mapMeshes.ts). Everything
 * here is drawing only: blocks collide, cover and steer bots exactly as their data says.
 */
export const SURFACES = {
  /** Metres one texture repeat covers, for the textures mapped in world space (crates are mapped once per face). */
  worldSize: { concrete: 4, blockWall: 2, crate: 1.2, corrugated: 2, steelPlate: 1.2, barrier: 1, sandbag: 1.2, gabion: 1.2, paint: 1.2, bark: 1.6, planks: 1.6, stone: 1.6, groundDetail: 4, plaster: 2.4, cladding: 1.6, tiles: 0.6, asphalt: 3, paving: 1.2, glass: 1.2 } satisfies Record<SurfaceTextureId, number>,
  /** How strongly each texture's light and dark read as relief when surface relief is on (bump scale). */
  relief: { concrete: 1.2, blockWall: 1.6, crate: 1.6, corrugated: 3, steelPlate: 2.4, barrier: 0.8, sandbag: 2.4, gabion: 2.4, paint: 0.8, bark: 2.6, planks: 1.8, stone: 1.8, groundDetail: 1, plaster: 0.6, cladding: 1.6, tiles: 1.4, asphalt: 1.4, paving: 1.6, glass: 0.4 } satisfies Record<SurfaceTextureId, number>,
  /**
   * Grime and contact shade near the floor: the sides of walls, containers, crates and barriers darken towards their
   * foot over this height (metres), to this share of their colour at the very bottom.
   */
  grimeHeight: 0.55,
  grimeShade: 0.72,
  /** Each block's brightness varies by up to this share (by its position), so neighbouring props don't look cloned. */
  shadeJitter: 0.07,
  /**
   * A floor or ramp whose top is this far above the ground (metres) casts a shadow (a dock, its ramps, a walkway);
   * the ground's own slab doesn't (KNOWN_ISSUES: a platform's height read only from its lit sides).
   */
  raisedFrom: 0.01,
  /**
   * A finished floor above the ground (M34f, MapBlock.finish) is its finish only `depth` deep on top; under that it is a
   * plastered ceiling in `colour`, so the rooms below see a ceiling, not the underside of a tiled floor.
   */
  ceiling: { depth: 0.03, colour: 0xe9e7e2 },
  /**
   * Purely visual detail drawn inside each block's own bounds (metres). Containers: the corrugated box sits `inset` in
   * from a steel frame of corner posts and top and bottom rails, darker than the walls, with locking bars on one end;
   * a block `length` long (or `height` tall) is drawn as a row (or stack) of containers that size.
   * Walls: a concrete coping on top, `overhang` proud of the painted blocks. Crates not stacked on another stand on a
   * pallet.
   */
  container: { inset: 0.04, post: 0.14, rail: 0.12, frameShade: 0.62, length: 6, height: 2.6, bar: 0.035, barShade: 0.62 },
  wallCoping: { height: 0.08, overhang: 0.025 },
  pallet: { height: 0.14, deck: 0.025, runner: 0.1, inset: 0.03, shade: 0.85 },
  /**
   * The site props (M25b, render/mapMeshes.ts), in metres; colours are sRGB hex. Every piece stays inside its block.
   */
  siteProps: {
    toilet: { skid: 0.08, inset: 0.04, roof: 0.14, doorWidth: 0.78, doorHeight: 1.95, latchDepth: 0.015, latchFromEdge: 0.1, latchSize: 0.08, latchY: [1.0, 1.1] },
    /**
     * `beamSet`: beams sit this far inside the uprights' faces (front, back and top), so no two faces share a plane.
     * `shortBoxes`: the heights of the shorter of two boxes (of the shelf's clear height), kept near full so little open
     * shelf shows in front of the spine.
     */
    rack: { bay: 1.2, post: 0.08, beam: 0.1, beamSet: 0.01, loadInset: 0.04, spine: 0.04, headroom: 0.06, boxGap: 0.05, shortBoxes: [0.9, 0.84] },
    /** The gabion's open top: grey rubble (G6: never sand) set `topDrop` below the wire's rim, `topInset` in from it. */
    gabion: { topDrop: 0.04, topInset: 0.05, topShade: 0.82 },
    ibc: { base: 0.14, inset: 0.05, bar: 0.03, lid: 0.12 },
    sandbags: { course: 0.2, inset: 0.025, topInset: 0.05 },
    generator: { skid: 0.1, inset: 0.04, louvres: 5, louvreFrom: 0.25, louvreStep: 0.1, louvreHeight: 0.04, louvreEnd: 0.2, panelWidth: 0.5, panelY: [0.6, 1.0] },
    skip: { foot: 0.3, footInset: 0.09, inset: 0.05, rim: 0.1, rimWidth: 0.08, rubbleDrop: 0.05 },
    strapWidth: 0.05,
    strapThickness: 0.012,
    paleRoof: 0xeeece4,
    latch: 0x2e3032,
    cardboard: 0xb8915e,
    film: 0xdfe3e6,
    palletWood: 0xd8ccb4,
    strap: 0x34383c,
    cageSteel: 0x9aa0a6,
    rubble: 0x8a8174,
  },
  /**
   * Normal maps (QualitySettings.normalMaps, audit section 5 F4): each texture's brightness read as height and turned
   * into a normal map (render/surfaceNormals.ts heightToNormal). The slope scale per surface, for the original
   * 256-pixel drawing (the maps at other sizes are scaled to match, so relief reads the same at any texture size).
   */
  normalStrength: { concrete: 1.4, blockWall: 1.8, crate: 2, corrugated: 3.2, steelPlate: 2.8, barrier: 1, sandbag: 2.6, gabion: 2.6, paint: 1, bark: 2.8, planks: 2, stone: 2, groundDetail: 1.2, plaster: 0.6, cladding: 1.8, tiles: 1.6, asphalt: 1.6, paving: 1.8, glass: 0.4 } satisfies Record<SurfaceTextureId, number>,
  /**
   * The most pixels a side each of these surfaces is drawn at, whatever the quality's textureSize (M78, owner decision
   * 9 on audit REN-11): the city's flat finishes (even paint and render, plain seams and slabs, glass) gain nothing from
   * High's and Ultra's 1024² but four times the memory, so they stay at Medium's 512² (Neon Heights High: about 21 MB
   * less). Every surface not named here follows textureSize (render/proceduralTextures.ts drawnSize).
   */
  maxSize: { plaster: 512, cladding: 512, asphalt: 512, paving: 512, glass: 512 } satisfies Partial<Record<SurfaceTextureId, TextureSize>>,
  /** The largest normal map (pixels a side): High's 1024² pictures are scaled down to it first (render/surfaceNormals.ts). */
  normalMapMaxSize: 512,
  /**
   * At `fromSize` pixels and up (High's 1024), each texture gets a pixel-fine grain (brightness ± `amount` of 255) and
   * the container ribs a row of `ribChips` paint chips each, so the larger drawing has detail at its own scale.
   */
  fineGrain: { fromSize: 1024, amount: 7, ribChips: 40 },
  /** Steel tread plate under environment lighting (row 16): painted steel that picks up the sky (art bible). */
  steelSheen: { metalness: 0.6, roughness: 0.45 },
  /**
   * Baked vertex occlusion (F3, render/vertexOcclusion.ts; with map detail): each vertex casts a fixed fan of rays
   * `reach` metres out and darkens by up to `strength` by how much is blocked (nearer blocks count more), so corners,
   * the floor along a wall's foot and under the dock's lip sit in a soft shade. Faces are cut into `cell`-metre tiles so
   * the shade has vertices to land on (`coarseCell` for kinds that ask for it: Woodland's boundary fences, M33i); rays
   * start `lift` metres off the surface.
   */
  occlusion: { reach: 2, strength: 0.55, cell: 1.25, coarseCell: 4, lift: 0.01 },
  /**
   * Edge bevels (the art bible's "CS edge highlight"; with map detail): vertical and top edges of walls, crates,
   * containers, barriers and site props are cut at 45° `size` metres in, the cut a share `highlight` brighter. Pieces
   * thinner than `minPiece` (rails, bars, straps) and floors keep sharp edges; a bevel is never more than `maxShare`
   * of a piece's thinnest side.
   */
  bevel: { size: 0.025, minPiece: 0.1, maxShare: 0.2, highlight: 1.1 },
  /** Ground variation (with map detail): the floor grid's brightness drifts by up to `amount` over about `period` m. */
  groundNoise: { amount: 0.05, period: 2.2, seed: 9157 },
  /**
   * Finer prop detail (with map detail), in metres. Containers: a cast corner block at each corner of each container
   * (`casting` a side, `castingShade` of the frame's colour), a lock box on the door bars. Barriers: a recessed top
   * (`recess` deep, a `rim` wide). Pallets: the top deck as `boards` boards with gaps. The generator: a fuel cap.
   * The skip: a heap of rubble `heap` higher with blocks in it.
   */
  propDetail: {
    casting: 0.18,
    castingShade: 0.8,
    lockBox: { width: 0.12, height: 0.18, depth: 0.03 },
    barrier: { recess: 0.04, rim: 0.05, shade: 0.8 },
    pallet: { boards: 5, gap: 0.035 },
    fuelCap: { size: 0.1, height: 0.04 },
    skipHeap: { heap: 0.12, blocks: 3, size: 0.3 },
  },
  /**
   * Painted signs and stencils (with map detail, render/mapDecals.ts): one texture of `atlasSize` pixels holding every
   * sign, drawn on quads `offset` metres off the face they're painted on. Container bay numbers on the long sides of
   * each container (`stencilHeight` tall at `stencilY` up), a roundel and a "SAFE ZONE" board on the field's long
   * perimeter walls, hazard chevrons on barriers' long faces.
   */
  decals: {
    atlasSize: 1024,
    offset: 0.006,
    stencilHeight: 0.42,
    stencilY: 1.3,
    roundelSize: 1.5,
    roundelY: 1.45,
    boardWidth: 1.6,
    boardY: 1.4,
    chevronHeight: 0.22,
    chevronY: 0.55,
    minWall: 6,
    /** Atlas texels fainter than this are skipped (the mesh is blended, G6). */
    alphaFloor: 0.02,
    stencil: '#f2efe6',
    paint: '#f2efe6',
    ink: '#2a2d30',
    hazard: '#e8c547',
  },
} as const;

/**
 * The city props (M34f, render/cityProps.ts; BlockKind in map/mapTypes.ts), in metres; colours are sRGB hex. Every
 * piece stays inside its block, and a face is never set in from it by more than `inset` (what you see is what stops
 * you and your BBs). A row of arcade cabinets is cut into cabinets about `cabinet.width` wide, each with a screen and
 * a marquee on both long faces in one of `cabinet.hues`; a vending machine has its product window on both long faces;
 * a stall is a counter under a striped awning; a planter is a timber box of shrubs; a booth is glass in a frame under a
 * lit sign band; a van stands on its wheels over a dark skirt, its windscreen at one end. By Night the screens, product
 * windows and booth signs glow (propSigns, drawn with the map's signs). Heights are shares of the block's height.
 */
export const CITY_PROPS = {
  inset: 0.04,
  dark: 0x1e2126,
  cabinet: { width: 0.8, plinth: 0.1, screen: [0.5, 0.74], deck: [0.4, 0.45], marquee: 0.3, edge: 0.08, hues: [0x2ef2c4, 0xff3cac, 0xb07bff, 0xd8ff3a] },
  vending: { window: [0.36, 0.86], windowShare: 0.66, slot: [0.12, 0.2], slotShare: 0.4, header: 0.14, glow: 0xf4fff0 },
  stall: { counter: 1.0, awning: 0.3, stripe: 0.3, stripeColour: 0xf4f1ea, inset: 0.04, wood: 0xd8cbb8, goods: 0xb3a28c },
  planter: { foliage: 0.16, inset: 0.04, leaves: 0x4f7d3c },
  booth: { post: 0.08, base: 0.1, roof: 0.14, band: 0.26, glow: 0x6fffd8 },
  van: { skirt: 0.35, skirtInset: 0.04, wheel: 0.62, wheelLength: 0.66, wheelFromEnd: 0.75, wheelDepth: 0.26, body: 0.02, windscreen: [0.58, 0.88], cab: 1.2, stripe: [0.42, 0.48] },
} as const;

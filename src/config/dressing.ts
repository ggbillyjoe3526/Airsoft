import type { PuffConfig, QualitySettings } from './render';

/**
 * Set dressing (G8, MapData.dressing; render/mapDressing.ts places it, the modules it names draw it). Look only: none
 * of it collides, is walked on, hides anyone or is read by play. Sizes in metres, colours sRGB hex, and no colour here
 * reads as a team's (mapDressing.test.ts checks every one against both team colour sets).
 *
 * What it costs, by preset (Low draws none of it; render/dressingMeshes.test.ts holds Medium and High to at most four
 * more draw calls and 15 000 more triangles on Depot, where it is about 6 000):
 * - map detail (Medium, High): the dirt, litter, logos, sprays and signs join the decal mesh (no draw call, about 400
 *   triangles on Depot; its atlas grows from 1024 × 1024 to 1024 × 1536 on every map); the junk and the glow strips are
 *   one mesh (one draw call, about 4 000 triangles on Depot, Lambert with a self-lit term for the strips), the puddles
 *   one more (one draw call, about 850 triangles; physically based, so they pick up the sky where Environment lighting
 *   is on). Neither casts a shadow (no shadow-pass draw).
 * - Trees: Detailed (Medium, High): the skyline joins the tree ring's mesh (no draw call, about 1 000 triangles), and
 *   its chimneys' smoke is one instanced draw while in view (`smoke.puffs` quads a chimney);
 * - Impact grit (Medium, High): kicked-up dust is one instanced draw while any puff is in the air (`kickedDust.max`);
 * - dust motes: only their colour and a fade with height (the same draw).
 *
 * G9 dresses Woodland and Neon Heights through the same engine, and costs them the same way (measured in
 * render/g9DressingCost.test.ts, which holds both to the same budget):
 * - Low draws none of it on either map: the same meshes, triangles, shaders, textures and horizon as before, and no
 *   moving effect at all.
 * - Woodland (Medium, High): 11 636 more triangles and 2 more draw calls — the junk mesh carries the fallen branches,
 *   twigs and logs and the leaf drifts (6 874 triangles), the puddle mesh the mud and the puddles (2 040), and the
 *   treeline and hills join the tree ring (2 722, no draw call). The moss on the trunks, logs and boulders is vertex
 *   colour on meshes that were already there (nothing added). Moving: the fireflies at night are one draw.
 * - Neon Heights (Medium, High): 9 654 more triangles and 2 more draw calls — the junk mesh carries the street litter,
 *   the posters and every neon tube, the flickering ones too (5 666 triangles), the dirt, litter scraps and sprays join
 *   the decal mesh (428, no draw call), the puddle mesh the puddles (840), and the towers join the tree ring (2 354)
 *   with their lit windows, blades and beacons (366, unlit; no draw call either, render/skyHost.ts). Moving: the vents'
 *   steam is one instanced draw while in view; the passing plane rides the tree ring too (108 triangles, collapsed to a
 *   point between passes: no draw call).
 * - The totals are pinned against the real meshes by render/g9EffectsQA.test.ts (it reads them from this comment).
 * - Depot is untouched: it draws exactly what it drew before, to the vertex (pinned from `main`).
 * - The signs' gentle flicker rides the junk mesh's own material as one vec3 uniform and a per-vertex channel: no extra
 *   draw and no extra triangle. It is one more shader variant of that material, compiled once and only on a map that
 *   has a neon sign (so Woodland, Depot and Low are on the program they were on before).
 */

/** Whether a map's clutter, puddles, marks and glow strips are drawn (Map detail, as the signs and stains are). */
export const dressingShown = (q: Pick<QualitySettings, 'mapDetail'>): boolean => q.mapDetail;
/** Whether the skyline and its smoke are drawn (Trees: Detailed): the simple ring keeps Low's world as it was. */
export const skylineShown = (q: Pick<QualitySettings, 'trees'>): boolean => q.trees === 2;
/** Whether feet kick up dust (Impact grit: the same kind of puff, the same preset). */
export const kickedDustShown = (q: Pick<QualitySettings, 'impactGrit'>): boolean => q.impactGrit;

export const DRESSING = {
  /**
   * Clutter along block feet: each face of a block standing on a floor is cut into slots `step` apart, none closer than
   * `cornerClear` to the face's ends (door jambs and corners stay clear). Only blocks at least `minHeight` tall get any.
   */
  clutter: {
    step: 1.4,
    cornerClear: 0.55,
    minHeight: 0.5,
    /** A bank of dirt against the foot: `length` along the face (at most the slot), `depth` out from it. */
    bank: { length: 1.5, depth: 0.6 },
    /** Litter: open floor cut into squares `cell` m across, each maybe a scrap `size` m across, `inset` inside the floor. */
    litter: { cell: 3.5, size: 0.7, inset: 0.4 },
    /** No clutter on a floor under anything lower than this above it (a stain's rule, WEATHERING.stains.clearance). */
    clearance: 2.4,
  },
  /**
   * Loose junk: never taller than `maxHeight`, its footprint within `reach` of the face it leans on, with `openFront`
   * of floor clear in front of it (so it never narrows a passage or a doorway below that), at least `laneClear` from
   * every lane's route and `pointClear` from every spawn, dead zone, the flag and the Extraction spots, `gap` from other
   * junk, and at most `max` pieces. Kinds by weight, each its `size`.
   */
  junk: {
    maxHeight: 0.3,
    reach: 0.5,
    openFront: 1.6,
    laneClear: 1.1,
    pointClear: 1.5,
    gap: 0.3,
    max: 70,
    /** How far the piece's back stands off the face (it never touches the block, so it never sits under it). */
    standoff: 0.04,
    weights: { cans: 3, bottle: 2, rubble: 3, boards: 2, bags: 3, tyre: 2, coil: 1, cone: 1 },
    /** G9: a city street's mix (MapDressing.clutter.mix 'street'): bin bags, cans and bottles, grey rubble, a cone. */
    street: { cans: 4, bottle: 3, rubble: 3, boards: 1, bags: 5, tyre: 0, coil: 0, cone: 1 },
    /**
     * Each kind's footprint and height (m): along the face, out from it (with `standoff`, at most `reach`) and up
     * (at most `maxHeight`). mapDressing.test.ts checks every one.
     */
    size: {
      cans: [0.42, 0.2, 0.12],
      bottle: [0.3, 0.1, 0.08],
      rubble: [0.7, 0.4, 0.24],
      boards: [1.1, 0.34, 0.08],
      bags: [0.8, 0.44, 0.3],
      tyre: [0.44, 0.44, 0.16],
      coil: [0.4, 0.4, 0.07],
      cone: [0.3, 0.3, 0.3],
    } as Record<'cans' | 'bottle' | 'rubble' | 'boards' | 'bags' | 'tyre' | 'coil' | 'cone', readonly [number, number, number]>,
    cans: ['#d8d0b8', '#3aa65a', '#e9e4d8', '#ecd04a', '#9c5bd0'],
    bags: ['#1d1f22', '#2a2d31', '#36412f', '#3d3448'],
    bottle: '#cfe2dc',
    bottleCap: '#3aa65a',
    rubble: ['#8a8a88', '#96958f', '#77787a', '#9d9b95', '#6a6b6c'],
    /** Weathered grey timber (no warm wood: a warm brown sits too near a team's orange). */
    boards: ['#9a8f80', '#8c8478', '#a8a092'],
    tyre: '#26272a',
    coil: '#d9e03a',
    cone: '#e3d23a',
    coneBand: '#f2efe8',
    /** Curved pieces' segments round (cans, bottles, tyres, coils, cones, bags). */
    segments: 8,
  },
  /**
   * The decals the dressing adds to the map's decal mesh (render/mapDecals.ts): banks of dirt, a soft dark contact
   * shadow under each piece of junk (`contact` m wider than it), grit round rubble, litter; and on the walls logos,
   * sprays and warning signs. Sizes in metres; `alpha` and `colour` for the atlas' drawings.
   */
  decals: {
    contact: 0.18,
    grit: 1.0,
    colour: { dirt: '#5e5d59', contact: '#1e1d1b', grit: '#6a6965' },
    alpha: { dirt: 0.55, contact: 0.45, grit: 0.6 },
    litter: ['#f1efe8', '#b5ab9b', '#e6e1d4'],
    /**
     * Shipping lines on containers (fictional: no real brands): one long side only, `width` m at most (`share` of the
     * container's length), 4:1, its middle `y` up the container unit, nudged `along` m from the middle.
     */
    logo: { names: ['KESTREL', 'ORBIT LINE', 'NORDA', 'HALDEN'], width: 2.6, share: 0.42, y: 0.72, along: 0.6, paint: '#f2efe6' },
    /** On walls: a spray (`spray` the share of marks) or a warning sign; heights of their middles, sizes. */
    spray: { share: 0.5, y: 1.5, arrow: [1.3, 0.65], tag: 0.75, colours: ['#b8e63a', '#d94fc0', '#2fc9a0'] },
    warning: { y: 2.2, size: 0.42, yellow: '#ecd04a', ink: '#2a2d30', plate: '#f2efe6' },
    /** Walls that get marks: at least this tall and this long. */
    wallHeight: 2.5,
    wallLength: 3,
    bay: 4,
  },
  /**
   * Puddles: an outline of `points` pulled in by up to `wobble` of its radius (never out past the placed rectangle), a water middle (`water`, sRGB,
   * at `alpha`) inside `core` of the radius, then a wet margin fading out. Physically based and glossy (`roughness`),
   * so with Environment lighting on they mirror the sky; `reflective` is the strength the renderer's screen-space
   * reflections take (G5, `userData.reflective`). `lift` m over the floor, above the decals.
   */
  puddles: { points: 24, wobble: 0.35, core: 0.72, water: '#4a535c', wet: '#3f3e3b', alpha: 0.88, wetAlpha: 0.45, roughness: 0.06, envIntensity: 1.1, reflective: 0.8, lift: 0.009 },
  /** Glow strips: how much brighter than lit paint they glow (added light, so they read in shade and at night). */
  strips: { glow: 1.6, offset: 0.007 },
  /**
   * The skyline (render/skyline.ts): flat-shaded and vertex-coloured, in the tree ring's mesh. Trees standing within
   * `treeClear` m of a piece are left out. Kinds' default colours; a shed's doors, roof and band.
   */
  skyline: {
    treeClear: 4,
    shed: { colour: '#d9dcd8', roof: '#4a4f57', band: '#2f8a70', doors: '#d9c24a', doorWidth: 5, doorHeight: 6, doorEvery: 11 },
    waterTower: { colour: '#e8e6e0', legs: '#8e949a', roof: '#c93f86', tank: 0.42 },
    crane: { colour: '#d9c24a', leg: 0.9 },
    containers: { colours: ['#4f8a57', '#7a8288', '#cdb338', '#4f7a80', '#8a6a9a'], length: 6.1, height: 2.6 },
    chimney: { colour: '#e8e4dc', band: '#7a4aa0', bands: 2, top: 0.62 },
    powerLine: { colour: '#9aa0a6', leg: 0.25, wire: 0.1, sag: 2.5, wires: 3 },
    /** Round pieces' sides. */
    segments: 12,
  },
  /**
   * Chimney smoke (render/smokePlumes.ts): `puffs` soft puffs per chimney on a loop `period` s long, rising `rise` m
   * with the wind bending them (`windShare` of the match's wind, eased over `windEase` s, over a `breeze` m/s along x
   * on a still day), growing from `size[0]` to
   * `size[1]` m and fading out. Unlit, fogged; `night` darkens it under a night preset. Frozen under Reduced motion.
   */
  smoke: { puffs: 22, period: 9, rise: 16, spread: 2.2, windShare: 0.6, breeze: 0.5, windEase: 2.5, size: [2.2, 8] as const, opacity: 0.55, colour: '#ece9e3', night: 0.35, fadeIn: 0.08, seed: 3301 },
  /** The dust motes' fade with height: full up to `full` m over the ground, gone by `none` (dust hangs low). */
  motes: { full: 1.6, none: 6 },
  /**
   * G9, mud (DressingPuddle.mud): the puddle mesh's colours for a patch of wet earth instead of water, a little less
   * glossy for the eye (the same material: its colour does the work), `lift` m over terrain at every vertex.
   */
  mud: { core: '#3a332b', wet: '#2e2a25', alpha: 0.85, wetAlpha: 0.5, lift: 0.02 },
  /** G9: the skyline's new kinds (render/skyline.ts). */
  hill: { colour: '#26362b', around: 14, rings: 4 },
  treeline: { colours: ['#1c3024', '#22382a', '#18291f', '#2a3a2c'], spacing: 2.4, sides: 6, width: 0.27, jitter: 0.35 },
  tower: {
    colours: ['#6a6e8a', '#6e6a78', '#8a6a7a', '#7a7068', '#7a7088', '#5e6a60', '#6f7e86'],
    cornice: '#9a9aa2',
    glass: '#202228',
    /** Windows on the side facing the field: `width` × `height`, `pitch` apart, a row every `floor` m from `from` over the base. */
    window: { width: 1.1, height: 1.3, pitch: 2.3, floor: 3.1, from: 1.6 },
    /** Lit by night (pale, never a team's warm orange or blue): the share lit, and their colours. */
    lit: { share: 0.38, colours: ['#fffbe6', '#f0eaff', '#e0fff2'] },
    tank: { colour: '#5d5650', legs: '#3a3e46' },
    /** The mast's beacon: a warm white, not the usual red (no prop glows in a colour that reads as a team's, G8's rule). */
    mast: { colour: '#8a9096', light: '#fffbe6' },
    /** A blade sign: `width` out from the wall, `height` tall, its glowing face. */
    sign: { width: 1.2, height: 5.5, plate: '#14141c' },
  },
} as const;

/**
 * G9: a wooded map's floor (MapDressing.woods; render/woodsDressing.ts places it on the terrain, map detail). Leaf litter
 * lies flat (`lift` over the ground, never over 3 cm); fallen branches, twigs and short logs keep every rule loose junk
 * keeps (DRESSING.junk: low, against a face, out of every lane, spot and passage).
 */
export const WOODS = {
  leaves: {
    /** Ground cut into squares `cell` m across; a square within `near` m of a foot may get a drift. */
    cell: 2.4,
    near: 2.2,
    /** Leaves in a drift, how far they scatter (m) and how long each is (m). */
    count: [6, 11] as const,
    radius: 0.75,
    size: [0.08, 0.15] as const,
    lift: 0.014,
    /** Autumn ochres, olive, a dun brown and a plum (none near a team's orange: mapDressing.test.ts checks). */
    colours: ['#b5a03c', '#8a8a3e', '#6a5f4a', '#8f8a72', '#7d3b52', '#a59a5a', '#6b5f3f'],
    /** No drift within this of a bush's middle plus its radius (it would only poke through the leaves). */
    bushClear: 0.2,
  },
  fallen: {
    /** Slots along each face of a foot, `step` apart, `cornerClear` from its ends; only blocks at least `minHeight` tall. */
    step: 1.6,
    cornerClear: 0.3,
    minHeight: 0.5,
    weights: { branch: 3, twigs: 2, log: 1 },
    /** Footprint along the face, out from it, and height (m): each within DRESSING.junk.reach and maxHeight. */
    size: { branch: [1.3, 0.42, 0.12], twigs: [0.7, 0.4, 0.07], log: [1.0, 0.34, 0.26] } as Record<'branch' | 'twigs' | 'log', readonly [number, number, number]>,
    /**
     * Damp olive-browns. Warm and saturated enough to keep reading as wood under Woodland's violet moonlight (the
     * pieces are flat vertex colour, not the bark texture the map's own logs wear, and a grey-brown went mauve at
     * night); hue 36°, far enough from the teams' orange for G8's rule (mapDressing.test.ts).
     */
    bark: ['#5a5140', '#6a5f4a', '#6e6248', '#7a6a4a'],
    /** A sawn log's end grain (pale, unsaturated). */
    grain: '#a99a80',
    /**
     * Beside a lying log a piece is trimmed to the log's length less `endClear` at each end (m), so none overhangs the
     * log's end; one shorter than `minLength` is left out.
     */
    endClear: 0.1,
    minLength: 0.45,
    /** Sides round a branch or a log. */
    sides: 6,
    /** How far a piece sinks into the ground at its lowest corner (m), so on a slope none of it floats. */
    sink: 0.03,
  },
};

/**
 * G9: neon signs (MapDressing.neon; render/neonDressing.ts): tubes `tube` m thick on a dark plate mounted flush on its
 * wall (`standoff` only keeps the plate's back off the wall's own surface), glowing `glow` times their colour (self-lit,
 * so they read by day and blaze by night). A sign is mounted on the wall face behind it within `mount` m, and only
 * where that face backs its whole plate. Flicker: the channels share one schedule. Each `cycle` s is cut into one slot
 * a channel; in its slot a channel may burst (skipped with chance `skip`), dipping gently `dips` times over `burst` s,
 * never below `low`, and every burst ends at least `rest` s before the next slot opens. So no two channels ever dip in
 * the same second, and all the signs together never flash more than `dips` (two) times a second, under the limit of
 * three (photosensitivity). Off under Reduced motion.
 */
export const NEON = {
  tube: 0.035,
  glow: 2.2,
  plate: '#16141c',
  plateDepth: 0.04,
  standoff: 0.004,
  mount: 0.4,
  /** The letters' stroke grid: a letter is `cell` wide (in units of its height), `gap` apart. */
  cell: 0.62,
  gap: 0.22,
  flicker: { channels: 3, cycle: 12, burst: 1.1, dips: 2, low: 0.4, rest: 1.2, skip: 0.35, seed: 9127 },
};

/**
 * G9: posters pasted on street walls (MapDressing.posters; render/streetDressing.ts): a few to a bay, their middles
 * `y` m up, `width` m wide and 1.41 times as tall, `gap` apart, `offset` m proud of the wall; paper and a print of two
 * or three colour blocks (no words, no brands), some torn.
 */
export const POSTERS = {
  y: [1.45, 1.75] as const,
  width: [0.42, 0.6] as const,
  perBay: [2, 4] as const,
  gap: 0.05,
  offset: 0.008,
  paper: ['#efe9dc', '#e2dccd', '#d9e4e0'],
  inks: ['#d94fc0', '#2fc9a0', '#b8e63a', '#ecd04a', '#7a4aa0', '#1d1f22', '#7d3b52'],
};

/** G9: steam from vents and drains (MapDressing.steam; render/smokePlumes.ts): thin, low and never thick enough to hide anyone. */
export const STEAM = { puffs: 9, period: 4.2, rise: 2.8, spread: 0.3, windShare: 0.25, breeze: 0.12, windEase: 2.5, size: [0.35, 1.5] as const, opacity: 0.2, colour: '#e6e2f0', night: 0.55, fadeIn: 0.12, seed: 7717 };

/**
 * G9: fireflies (MapDressing.fireflies; render/fireflies.ts), by night only: points `size` m across hanging `height` m
 * over the ground round the bushes and along the creek, each drifting up to `drift` m and pulsing slowly (a cycle every
 * `period` s, never faster), from `low` to full. Standing still and steady under Reduced motion.
 */
export const FIREFLIES = { size: 0.11, colour: '#d6ff7a', height: [0.3, 1.9] as const, drift: 0.35, period: [2.6, 5] as const, low: 0.12, reach: 2.5, seed: 6161 };

/**
 * G9: a plane crossing the sky (MapDressing.plane; render/passingPlane.ts flies it, the tree ring's mesh draws it,
 * render/skyHost.ts): `length` m long at the map's height, `speed` m/s along a seeded line through the sky over the
 * field, `path` m long (a 10 s crossing, so with Neon Heights' pass every 20 s, start to start, the sky is empty half
 * the time); unlit, in `day` or `night` colours with steady wingtip and beacon lights. Hidden under Reduced motion.
 */
export const PLANE = { length: 9, span: 9, speed: 26, path: 260, day: '#cfd3da', night: '#14151c', lights: { port: '#d94fc0', starboard: '#5aff8a', beacon: '#fffbe6' }, seed: 4421 };

/**
 * Dust kicked up by feet (Impact grit, render/combatPresentation.ts): a low, faint puff at a sprinting footfall and a
 * bigger one (`land`) on landing, tinted by the map (MapDressing.kickedDust), only within `range` m of the camera. Its
 * top stays under about 0.3 m: it never hides anyone. No minimum size on screen: far dust is allowed to vanish.
 */
export const KICKED_DUST: PuffConfig & { land: number; range: number; lift: number } = {
  max: 24,
  lifetime: 0.55,
  growTime: 0.18,
  startScale: 0.3,
  radius: 0.11,
  minAngularRadius: 0,
  color: 0xffffff,
  opacity: 0.4,
  drift: 0.1,
  land: 1.5,
  range: 35,
  lift: 0.07,
};

/** A dressing junk kind (DRESSING.junk.weights). */
export type JunkKind = keyof typeof DRESSING.junk.weights;
/** G9: a fallen piece on a wooded map's floor (WOODS.fallen.weights). */
export type FallenKind = keyof typeof WOODS.fallen.weights;

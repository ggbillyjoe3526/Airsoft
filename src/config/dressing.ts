import type { PuffConfig, QualitySettings } from './render';

/**
 * Set dressing (G8, MapData.dressing; render/mapDressing.ts places it, the modules it names draw it). Look only: none
 * of it collides, is walked on, hides anyone or is read by play. Sizes in metres, colours sRGB hex, and no colour here
 * reads as a team's (mapDressing.test.ts checks every one against both team colour sets).
 *
 * What it costs, by preset (Low draws none of it):
 * - map detail (Medium, High): the dirt, litter, logos, sprays and signs join the decal mesh (no draw call; its atlas
 *   grows from 1024 × 1024 to 1024 × 1536); the junk and the glow strips are one mesh (one draw call, about 9 000
 *   triangles on Depot, Lambert with a self-lit term for the strips), the puddles one more (one draw call, about 500
 *   triangles; physically based, so they pick up the sky where Environment lighting is on);
 * - Trees: Detailed (Medium, High): the skyline joins the tree ring's mesh (no draw call, about 2 500 triangles), and
 *   its chimneys' smoke is one instanced draw while in view (`smoke.puffs` quads);
 * - Impact grit (Medium, High): kicked-up dust is one instanced draw while any puff is in the air (`kickedDust.max`);
 * - dust motes: only their colour and a fade with height (the same draw).
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
   * junk, and at most `max` pieces. Kinds by weight; each kind's footprint radius is `radius`.
   */
  junk: {
    maxHeight: 0.3,
    reach: 0.5,
    openFront: 1.6,
    laneClear: 1.1,
    pointClear: 1.5,
    gap: 0.3,
    max: 70,
    weights: { cans: 3, bottle: 2, rubble: 3, boards: 2, bags: 3, tyre: 2, coil: 1, cone: 1 },
    radius: { cans: 0.25, bottle: 0.16, rubble: 0.32, boards: 0.34, bags: 0.32, tyre: 0.36, coil: 0.22, cone: 0.2 },
    cans: ['#d8d0b8', '#3aa65a', '#e9e4d8', '#e8c547', '#9c5bd0'],
    bags: ['#1d1f22', '#2a2d31', '#36412f', '#3d3448'],
    bottle: '#cfe2dc',
    bottleCap: '#3aa65a',
    rubble: ['#8a8a88', '#96958f', '#77787a', '#9d9b95', '#6a6b6c'],
    boards: ['#c29463', '#a6743f', '#b8996e'],
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
    colour: { dirt: '#6e6353', contact: '#1e1d1b', grit: '#5f5a52' },
    alpha: { dirt: 0.55, contact: 0.45, grit: 0.6 },
    litter: ['#f1efe8', '#c9a066', '#e6e1d4'],
    /**
     * Shipping lines on containers (fictional: no real brands): one long side only, `width` m at most (`share` of the
     * container's length), 4:1, its middle `y` up the container unit, nudged `along` m from the middle.
     */
    logo: { names: ['KESTREL', 'ORBIT LINE', 'NORDA', 'HALDEN'], width: 2.6, share: 0.42, y: 0.66, along: 0.45, paint: '#f2efe6' },
    /** On walls: a spray (`spray` the share of marks) or a warning sign; heights of their middles, sizes. */
    spray: { share: 0.5, y: 1.5, arrow: [1.3, 0.65], tag: 0.75, colours: ['#b8e63a', '#d94fc0', '#2fc9a0'] },
    warning: { y: 2.2, size: 0.42, yellow: '#e8c547', ink: '#2a2d30', plate: '#f2efe6' },
    /** Walls that get marks: at least this tall and this long. */
    wallHeight: 2.5,
    wallLength: 3,
    bay: 4,
  },
  /**
   * Puddles: an outline of `points` pushed in and out by up to `wobble` of its radius, a water middle (`water`, sRGB,
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
    waterTower: { colour: '#e8e6e0', legs: '#8e949a', roof: '#a83a52', tank: 0.42 },
    crane: { colour: '#d9c24a', leg: 0.9 },
    containers: { colours: ['#4f8a57', '#7a8288', '#cdb338', '#4f7a80', '#8a6a9a'], length: 6.1, height: 2.6 },
    chimney: { colour: '#e8e4dc', band: '#8a3a4a', bands: 2, top: 0.62 },
    powerLine: { colour: '#9aa0a6', leg: 0.25, wire: 0.1, sag: 2.5, wires: 3 },
    /** Round pieces' sides. */
    segments: 12,
  },
  /**
   * Chimney smoke (render/smokePlumes.ts): `puffs` soft puffs per chimney on a loop `period` s long, rising `rise` m
   * with the wind bending them (`windShare` of the match's wind, eased over `windEase` s), growing from `size[0]` to
   * `size[1]` m and fading out. Unlit, fogged; `night` darkens it under a night preset. Frozen under Reduced motion.
   */
  smoke: { puffs: 22, period: 9, rise: 16, spread: 2.2, windShare: 1.6, windEase: 2.5, size: [2.2, 8] as const, opacity: 0.55, colour: '#ece9e3', night: 0.35, fadeIn: 0.08, seed: 3301 },
  /** The dust motes' fade with height: full up to `full` m over the ground, gone by `none` (dust hangs low). */
  motes: { full: 1.6, none: 6 },
} as const;

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

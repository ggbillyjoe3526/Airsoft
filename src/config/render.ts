import { matchOverWhistlesDuration } from './audio';
import type { ImpactMaterial } from './sounds';

/** Presentation tuning. Kept conservative for integrated GPUs. */
export const RENDER = {
  /**
   * Horizontal field of view in degrees on a 16:9 screen (CS ≈ 106°, Valorant 103°). Wider screens get
   * more horizontal view with the same vertical FOV ("Hor+"), so ultrawide doesn't fisheye. The default for the Field of
   * view setting: 90 (owner, 2026-10-04; was 100).
   */
  horizontalFov16x9: 90,
  near: 0.05,
  far: 250,
  /** Anisotropic filtering for surface textures; keeps floor detail readable at grazing angles. */
  textureAnisotropy: 4,
  /**
   * Exposure under ACES filmic tone mapping (M14): a touch over 1, so sunny concrete reads bright and friendly rather
   * than grey, without washing out the team colours.
   */
  toneMappingExposure: 1.08,
  /**
   * Leaning tilts the view by this much at full lean (radians), a fraction of the body's tilt: enough to
   * feel the peek without making the world swing.
   */
  leanCameraRoll: 0.12,
} as const;

/**
 * The sky, haze and the trees round the yard (M14, render/atmosphere.ts): a clear summer day. The haze matches the
 * horizon so far things fade into the sky. It starts at 32 m and is still thin at the longest sight line on the field
 * (34 m on Depot), so nobody is ever hidden by it.
 */
export const ATMOSPHERE = {
  /** Sky dome colours: straight up, at the horizon, and below it (seen only over low walls). */
  zenith: 0x5f9fd8,
  horizon: 0xd3e5f1,
  below: 0xc4d0cc,
  /** A warm glow round the sun's direction: its colour and how tightly it gathers (higher = smaller). */
  sunGlow: 0xfff0d2,
  sunGlowPower: 6,
  /** How quickly the sky darkens from the horizon up (higher = a thinner pale band at the horizon). */
  horizonFalloff: 2.2,
  /** Sky dome radius (metres): inside the camera's far plane. Segments: enough for a smooth gradient. */
  skyRadius: 200,
  skyWidthSegments: 32,
  skyHeightSegments: 16,
  /** Linear haze in the horizon colour (metres from the camera). */
  fogNear: 32,
  fogFar: 210,
  /**
   * A ring of trees beyond the walls, so the yard sits somewhere: how many, how far from the field's centre
   * (metres), how tall, and their greens. One merged mesh, never casting shadows.
   */
  trees: {
    count: 70,
    ringMin: 62,
    ringMax: 100,
    heightMin: 10,
    heightMax: 18,
    /** Radius as a share of the height (pines are slim, broadleaves rounder). */
    pineWidth: 0.2,
    broadWidth: 0.3,
    /** Share of the trees that are broadleaves (a round crown on a trunk) rather than pines. */
    broadShare: 0.45,
    colors: [0x5f8a4e, 0x6f9a52, 0x557d4c, 0x7aa05a],
    trunk: 0x6b5843,
    seed: 4141,
  },
} as const;
/**
 * The Field of view setting on Settings, Graphics (M15b): horizontal degrees on a 16:9 screen, as
 * RENDER.horizontalFov16x9 (the default). The range is a first guess: wide enough for a wider view, narrow enough
 * that nothing fisheyes or tunnels.
 */
export const FOV_SETTING = { min: 80, max: 120, step: 1 } as const;

export type QualityPreset = 'low' | 'medium' | 'high';

/**
 * What a quality preset sets (Settings → Graphics → Quality, M14). Everything applies at once except antialiasing,
 * which needs a new WebGL context: it follows the preset the game loaded with (the next load picks up a change).
 */
export interface QualitySettings {
  /** Caps devicePixelRatio; high-DPI laptops with iGPUs pay a lot for full resolution. */
  maxPixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: 1024 | 2048;
  /** PCF filter radius in shadow-map texels: softer shadow edges cost more samples' worth of blur. */
  shadowRadius: number;
  /**
   * Surface relief: the surface textures double as bump maps, so slab joints, mortar, planks and container ribs
   * catch the sun. Costs a few texture reads per pixel on every surface.
   */
  surfaceRelief: boolean;
  /** Dust motes drifting in the sunlight round you (render/dustMotes.ts); 0 draws none. */
  dustMotes: number;
  /** The held replica picks up soft reflections (an environment map), so its plastic has a moulded sheen. */
  replicaSheen: boolean;
}

/**
 * Render quality presets (M14: the Settings picker is back now the art pass gives it real work to scale). High is
 * the full look and the default (Low in a browser drawing in software, see startingQuality); Medium keeps shadows and relief at a lower cost; Low drops shadows, antialiasing,
 * relief, dust and the replica's sheen for integrated graphics. `?quality=low|medium|high` still overrides the saved
 * pick for one visit, to measure frame cost (Phase 3 audit C-04).
 */
export const QUALITY: Record<QualityPreset, QualitySettings> = {
  low: { maxPixelRatio: 1, antialias: false, shadows: false, shadowMapSize: 1024, shadowRadius: 1, surfaceRelief: false, dustMotes: 0, replicaSheen: false },
  medium: { maxPixelRatio: 1, antialias: true, shadows: true, shadowMapSize: 1024, shadowRadius: 1.5, surfaceRelief: true, dustMotes: 90, replicaSheen: true },
  high: { maxPixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 2048, shadowRadius: 2.5, surfaceRelief: true, dustMotes: 180, replicaSheen: true },
};

export const DEFAULT_QUALITY: QualityPreset = 'high';

/**
 * The preset a browser drawing in software starts on when nothing is saved (audit M-02): High there runs at about two
 * frames a second and the simulation in slow motion; Low at four times that.
 */
export const SOFTWARE_RENDERING_QUALITY: QualityPreset = 'low';

/**
 * The preset a visit starts with: `?quality=` if given, else the saved pick, else SOFTWARE_RENDERING_QUALITY when the
 * browser draws in software and DEFAULT_QUALITY otherwise. `automatic` marks the software fallback: it is not saved, so
 * the same browser with its graphics acceleration back on starts on the default again.
 */
export function startingQuality(
  fromUrl: QualityPreset | null,
  saved: QualityPreset | null,
  softwareRendering: boolean,
): { preset: QualityPreset; automatic: boolean } {
  const picked = fromUrl ?? saved;
  if (picked !== null) return { preset: picked, automatic: false };
  return softwareRendering ? { preset: SOFTWARE_RENDERING_QUALITY, automatic: true } : { preset: DEFAULT_QUALITY, automatic: false };
}

/** The Quality picker's options (Settings → Graphics), cheapest first. */
export const QUALITY_CHOICES: readonly { id: QualityPreset; label: string; blurb: string }[] = [
  { id: 'low', label: 'Low', blurb: 'For integrated graphics: no shadows, relief or dust, and no edge smoothing from the next time the game loads.' },
  { id: 'medium', label: 'Medium', blurb: 'Shadows and surface relief at a lower cost: a good middle for most laptops.' },
  { id: 'high', label: 'High', blurb: 'The full look: sharper on high-DPI screens, softer shadows, dust in the sunlight.' },
];

/** The preset a `?quality=` value names, or null for a missing or unknown value. */
export function parseQuality(value: string | null): QualityPreset | null {
  return value !== null && Object.hasOwn(QUALITY, value) ? (value as QualityPreset) : null;
}

/**
 * Bright, friendly daylight: a warm late-morning sun and a cool sky fill (M14). The hemisphere's ground colour is the
 * sunlit concrete's bounce, so shaded sides stay warm and readable, never murky.
 */
export const LIGHTING = {
  hemiSky: 0xcfe2ff,
  hemiGround: 0x8f8268,
  hemiIntensity: 1.45,
  sunColor: 0xffe4bd,
  sunIntensity: 2.7,
  /** Sun position relative to the map centre (metres): high enough that walls throw short, readable shadows. */
  sunOffset: { x: 20, y: 42, z: 14 },
  /** Extra margin around the level box for the shadow camera (metres). */
  shadowMargin: 2,
  shadowBias: -0.0004,
  shadowNormalBias: 0.03,
} as const;

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
} as const;

/** The surface textures (render/proceduralTextures.ts), drawn on canvases as each match loads. */
export type SurfaceTextureId = 'concrete' | 'blockWall' | 'crate' | 'corrugated' | 'steelPlate' | 'barrier' | 'sandbag' | 'gabion';

/**
 * The look of the field's surfaces and props (M14, render/proceduralTextures.ts and render/mapMeshes.ts). Everything
 * here is drawing only: blocks collide, cover and steer bots exactly as their data says.
 */
export const SURFACES = {
  /** Texture size in pixels (square, a power of two): eight of these are about 11 MB of GPU memory with mipmaps. */
  textureSize: 512,
  /** Metres one texture repeat covers, for the textures mapped in world space (crates are mapped once per face). */
  worldSize: { concrete: 4, blockWall: 1.6, crate: 1.2, corrugated: 2, steelPlate: 1.2, barrier: 1, sandbag: 1.2, gabion: 1.2 } satisfies Record<SurfaceTextureId, number>,
  /** How strongly each texture's light and dark read as relief when surface relief is on (bump scale). */
  relief: { concrete: 1.2, blockWall: 2.2, crate: 1.6, corrugated: 3, steelPlate: 2.4, barrier: 0.8, sandbag: 2.4, gabion: 1.8 } satisfies Record<SurfaceTextureId, number>,
  /**
   * Grime and contact shade near the floor: the sides of walls, containers, crates and barriers darken towards their
   * foot over this height (metres), to this share of their colour at the very bottom.
   */
  grimeHeight: 0.55,
  grimeShade: 0.72,
  /** Each block's brightness varies by up to this share (by its position), so neighbouring props don't look cloned. */
  shadeJitter: 0.07,
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
    gabion: { sandTop: 0.04, sandInset: 0.05 },
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
    sand: 0xc8b48a,
    palletWood: 0xd8ccb4,
    strap: 0x34383c,
    cageSteel: 0x9aa0a6,
    rubble: 0x8a8174,
  },
} as const;

/** BB and impact visuals. BBs are drawn bigger than 6 mm so they read at speed. */
export const BB_VISUALS = {
  radius: 0.018,
  color: 0xfffbe8,
  /**
   * A BB is never drawn smaller than this on screen: its radius grows with distance so it stays a
   * visible dot at 10-30 m (radians of view; 0.003 ≈ 5 px wide at 1080p).
   */
  minAngularRadius: 0.003,
  /** Trail length in seconds of flight (streak = velocity × this, never longer than the flight so far). */
  trailSeconds: 0.022,
  trailColor: 0xfff4cc,
  trailOpacity: 0.75,
  /**
   * Glowing BBs (M33b, the Loadout's Glowing BBs row): glow-in-the-dark green, drawn a little larger and with a longer
   * streak so a shot can be followed all the way, at night above all. Presentation only: they fly like any BB.
   */
  glow: {
    color: 0x9dff7a,
    trailColor: 0x5cff4a,
    minAngularRadius: 0.0045,
    trailSeconds: 0.05,
  },
  /**
   * Your own BBs are drawn leaving the replica's muzzle and blend onto their true (eye-line) path over
   * this many seconds (~10 m), so you can see them fly instead of edge-on along your line of sight.
   */
  muzzleConvergeTime: 0.12,
  /** Close to a wall the blend finishes at this fraction of the flight time, so the BB visibly arrives. */
  convergeBeforeImpact: 0.7,
  /** Point-blank shots still blend over at least this long (s) instead of snapping. */
  minConvergeTime: 0.01,
  /** Debug BB-path overlay: how many recent paths, and points per path. */
  debugPaths: 48,
  debugPathPoints: 150,
  debugPathColor: 0xff3fa4,
} as const;

/** Settings for a pool of puffs (see ImpactPuffs). */
export interface PuffConfig {
  max: number;
  lifetime: number;
  growTime: number;
  /** Size on the first frame as a share of full size (0..1): growth over `growTime` starts here, not at nothing. */
  startScale: number;
  radius: number;
  minAngularRadius: number;
  color: number;
  opacity: number;
  drift: number;
}

export const IMPACT_PUFFS: PuffConfig = {
  max: 64,
  lifetime: 0.35,
  /** Seconds to reach full size. */
  growTime: 0.06,
  /** Half size at once, so a close-range hit shows a puff on its first frame rather than a near-empty one (M28). */
  startScale: 0.5,
  radius: 0.06,
  /**
   * Never smaller than this on screen (radians of view; 0.013 ≈ 20 px wide at 1080p), so a puff reads
   * at 20 m and isn't hidden inside the crosshair's centre gap.
   */
  minAngularRadius: 0.013,
  /** Bright warm dust, strong enough to stand out on grey concrete and dark wood (each material tints it, IMPACT_DUST). */
  color: 0xfff1c9,
  opacity: 0.8,
  /** Upward drift while fading (m/s). */
  drift: 0.15,
};

/**
 * What a BB kicks up by the material it hits (M14; the same material its tick sounds by, audio/soundMaterials.ts): a
 * tint over IMPACT_PUFFS' colour and a size. Pale grit off concrete, a tan crumb of wood, only a faint grey breath off
 * steel. Light and toy-like: dust, never sparks.
 */
export const IMPACT_DUST: Readonly<Record<ImpactMaterial, { tint: number; scale: number }>> = {
  concrete: { tint: 0xf4f0ea, scale: 1 },
  wood: { tint: 0xf2cf98, scale: 0.85 },
  metal: { tint: 0xc9d2dc, scale: 0.6 },
  /** Ground (M33c, terrain): a puff of brown soil. */
  earth: { tint: 0xb89a72, scale: 0.9 },
};

/**
 * A gas replica's breath (M14): each shot of a gas pistol puffs a little propellant from the muzzle, pushed forward
 * (`muzzleSpeed`, m/s), and a smaller one out of the ejection port to the right as the slide cycles. No flash, no
 * casings: a toy's puff of gas.
 */
export const GAS_PUFFS: PuffConfig & { muzzleSpeed: number; portScale: number; portSpeed: number; portBack: number } = {
  max: 16,
  lifetime: 0.5,
  growTime: 0.07,
  startScale: 0,
  radius: 0.045,
  /** Small even far away: a hint, not a marker (0.004 ≈ 6 px wide at 1080p). */
  minAngularRadius: 0.004,
  color: 0xf2f6fa,
  opacity: 0.45,
  drift: 0.12,
  muzzleSpeed: 1.6,
  /** The port puff: its size (share of the muzzle's), speed, and where it starts (this share of the way back from the muzzle to your eye). */
  portScale: 0.45,
  portSpeed: 0.7,
  portBack: 0.15,
};

/**
 * Dust motes drifting in the sunlight round you (M14, render/dustMotes.ts): how many is the quality preset's
 * (QualitySettings.dustMotes); they fill a cube `box` metres across centred on the camera, wrapping round it as you move.
 * Reduced motion turns them off.
 */
export const DUST_MOTES = {
  box: 14,
  /** World size of a mote (metres): a few pixels a couple of metres off, a speck further away. */
  size: 0.045,
  /**
   * Near the camera a world-size point balloons into a blurry blob (half a metre off it would be ~50 px), so motes fade
   * out closer than `fadeFar` and are gone by `fadeNear` (metres), and no mote is ever drawn bigger than `maxPixels`
   * (device pixels). They also fade over the last `edgeFade` metres before the box's edge, so none pops as it wraps.
   */
  fadeNear: 0.8,
  fadeFar: 1.8,
  maxPixels: 10,
  edgeFade: 1.5,
  color: 0xfff4dc,
  opacity: 0.65,
  /**
   * The motes ride the match's wind (M30), the one that drifts the BBs, so it can be read from them: `windShare` of its
   * speed (1: dust moves with the air). `breeze` (m/s) is a faint stir on top, so they drift even on a calm day, and each
   * mote wanders round that: amplitude (m) and rate (rad/s).
   */
  windShare: 1,
  breeze: { x: 0.04, y: 0.02, z: 0.02 },
  wander: 0.25,
  wanderRate: 0.35,
  seed: 707,
} as const;

/**
 * A BB landing on a player: a bigger, brighter burst of fabric dust that lingers a little, so a hit is
 * unmistakable even at 30 m (the "HIT!" sign follows a moment later). No blood, ever.
 */
export const HIT_PUFFS: PuffConfig = {
  max: 8,
  lifetime: 0.6,
  growTime: 0.05,
  startScale: 0,
  radius: 0.16,
  minAngularRadius: 0.03,
  color: 0xffffff,
  opacity: 0.9,
  drift: 0.3,
};

/** Third-person camera used while you're out, watching someone still in play. */
export const SPECTATOR = {
  /** Behind and above the watched player's head (metres). */
  distance: 2.6,
  height: 0.55,
  /** The camera looks at a point this far ahead of the watched player's head. */
  lookAhead: 3,
  /** Kept this far in front of any wall between the head and the camera. */
  wallPadding: 0.25,
  /** How quickly the camera follows (1/s). */
  followRate: 10,
} as const;

/** Heads-up display. */
export const HUD = {
  /** The magazine count turns to a warning colour at or below this fraction of a full magazine. */
  lowAmmoFraction: 0.2,
  /** How long a short HUD notice (e.g. "No fuller magazine" after a reload that can't help) stays up (s). */
  noticeTime: 1.4,
  /** Said when a ricochet ticks you in a match where ricochets don't count (M20). */
  ricochetNotice: "Ricochet · doesn't count, play on",
  /** Said when your BB reaches someone after a bounce and doesn't count (M20). */
  ricochetShooterNotice: "Your BB ricocheted · doesn't count",
  /** How long "Round N" stays up after a round starts (seconds). */
  roundStartMessageTime: 1.8,
  /** The round clock turns to a warning colour at or below this many seconds. */
  lowClockSeconds: 20,
  /** The result screen appears this long after the match-over whistles end (see matchOverScreenDelay). */
  matchOverScreenPause: 0.3,
  /**
   * The crosshair's arms open to show where your BBs can go: the gap is this many standard deviations
   * of the current spread (replica spread × stance and movement), on screen, but never under the
   * player's own smallest gap (Settings → Crosshair, config/matchInfo.ts). Gaps change only in steps of
   * crosshairGapStep pixels (fewer DOM writes).
   */
  crosshairSpreadSigmas: 2,
  crosshairGapStep: 0.5,
} as const;

/** First-person replica rendering and motion. */
export const VIEWMODEL = {
  /** Paint the muzzle orange like many real-world replicas. Off by default (user preference). */
  orangeTips: false,
  fov: 50,
  /** How far the model lags behind mouse turns (radians of turn → metres of offset). */
  swayPerRadian: 0.05,
  swayMax: 0.035,
  /** Spring stiffness for sway/kick recovery (1/s). */
  returnRate: 14,
  bobAmount: 0.012,
  bobFrequency: 1.7,
  /**
   * Recoil kick per shot: metres back and metres up. A lift, not a tilt: the barrel stays parallel to the view, so
   * BBs drawn from the muzzle to the crosshair stay in line with it through full auto (owner playtest, 2026-10-03).
   */
  kickBack: 0.028,
  kickLift: 0.012,
  /** The sprint carry is gone once this share of the post-sprint fire lockout is left (render/viewmodel.ts sprintCarry). */
  carrySquareAt: 0.25,
  /** Recoil kick never stacks beyond this many shots' worth. */
  kickMax: 1.5,
  /** How much of the mouse sway and walk bob goes away with the sight raised to your eye (0..1). */
  aimSteady: 0.75,
  /**
   * The share of the recoil kick left with the sight raised: a full kick would lift the optic's glass off the HUD
   * dot. A quarter keeps the dot inside the glass even at kickMax (a viewmodel test pins it).
   */
  aimKick: 0.25,
  /** Viewmodel camera clip planes (metres); the replica is always within arm's reach. */
  near: 0.01,
  far: 5,
  /** How far the replica drops while drawing / sprinting (metres). */
  drawDrop: 0.22,
  sprintDrop: 0.06,
  sprintTilt: 0.5,
  /**
   * Reload: the replica lifts slightly and cants about its own grip (radians at the midpoint: muzzle
   * up, roll top-right, turn) so it stays on screen without covering the crosshair, while the magazine slides out along the magwell,
   * stays out, then is pushed back in. Phase times are fractions of the replica's reloadTime.
   */
  reload: {
    tilt: 0.3,
    roll: -0.55,
    turn: 0.35,
    /** Lifted up (m) and brought in towards the centre of view (m), so the magwell and hand are in sight. */
    lift: 0.14,
    inward: 0.1,
    magTravel: 0.14,
    /**
     * While the magazine is out, it (and the support hand holding it) drops this much further (m) out
     * of view and comes back: the old one is stowed and a fresh one fetched.
     */
    swapTravel: 0.3,
    /** Seconds for the support hand to move between its grip and the magazine. */
    handMoveTime: 0.15,
    magOutEnd: 0.28,
    magInStart: 0.62,
    /** Seated right at the end, when the reloadEnd click plays. */
    magSeated: 0.97,
  },
  /** Pitch-down (radians) of the replica at the start of a draw. */
  drawTilt: 0.6,
  /**
   * Calling your hit: the replica drops out of view and your left hand rises to this spot (camera
   * space, metres) over `raiseTime` seconds.
   */
  hitDrop: 0.5,
  /** Being hit jolts the replica like this many times a full recoil kick. */
  hitJolt: 1.5,
  raisedHand: [-0.3, -0.02, -0.62] as const,
  raiseFrom: 0.35,
  raiseTime: 0.25,
  /**
   * The replica's sheen (QualitySettings.replicaSheen): a soft studio environment reflected in its plastic at this
   * strength, so the polymer reads as moulded toy plastic rather than flat paint.
   */
  sheenIntensity: 0.32,
  /** Viewmodel lighting: [sky, ground, intensity] hemisphere, warm key from above-right, cool rim from behind. */
  light: {
    hemi: [0xe8f0ff, 0x4a4438, 1.3],
    keyColor: 0xfff0d8,
    keyIntensity: 2.2,
    keyPosition: [0.6, 1, 0.4],
    rimColor: 0xcfe0ff,
    rimIntensity: 1.2,
    rimPosition: [-0.8, 0.4, -1],
  },
} as const;

/** How long after the match is decided the result screen appears: once the whistles have finished. */
export function matchOverScreenDelay(): number {
  return matchOverWhistlesDuration() + HUD.matchOverScreenPause;
}

/**
 * Flag mode's pole: a site's flagpole on a weighted base, with the attackers' flag climbing it as
 * they raise it, and a painted ring on the floor marking how close you must be to work the rope.
 */
export const FLAG_VISUALS = {
  poleHeight: 3.4,
  poleRadius: 0.035,
  poleColor: 0xe9e6dd,
  poleRoughness: 0.5,
  poleMetalness: 0.3,
  poleSegments: 10,
  baseRadius: 0.28,
  /** The base tapers to this radius at the top (metres). */
  baseTopRadius: 0.22,
  baseSegments: 16,
  baseRoughness: 0.9,
  baseHeight: 0.14,
  baseColor: 0x6f6a60,
  /** Flag cloth size (metres) and where its bottom edge sits at the bottom and top of the pole. */
  clothWidth: 0.95,
  clothHeight: 0.62,
  clothLowest: 0.3,
  clothHighest: 2.72,
  /** Segments along the cloth: enough for a smooth ripple. */
  clothSegments: 8,
  clothRoughness: 0.8,
  /** Cloth ripple: waves along the cloth (per metre), speed (rad/s) and how far the free edge flaps (metres). */
  waveNumber: 6,
  waveSpeed: 7,
  waveAmplitude: 0.07,
  /** Ring on the floor at the rope's reach: neutral when nobody works it, else the team working it. */
  ringWidth: 0.08,
  ringColor: 0xffffff,
  ringContestedColor: 0xffe14d,
  ringOpacity: 0.6,
  ringSegments: 48,
  /** Height of the ring above the floor (metres): just enough not to flicker against it. */
  ringLift: 0.01,
  /** Screen marker over the pole: anchor height (metres), and kept this far in from the screen edge (px). */
  markerHeight: 3.7,
  markerEdge: 36,
  /** Closer than this to the pole (metres, while playing) the marker hides: the pole is right there. */
  markerHideWithin: 5,
} as const;

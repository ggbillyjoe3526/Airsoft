// The sky and haze, the environment and tone mapping, the retro look, contact shadows, daylight and night lighting,
// torches, light pools and signs. Split from config/render.ts in G5, which re-exports every name here: import from
// there.

/**
 * The sky, haze and the trees round the yard (M14, render/atmosphere.ts): a clear summer day. The haze matches the
 * horizon so far things fade into the sky. It starts at 32 m and is still thin at the longest sight line on the field
 * (34 m on Depot), so nobody is ever hidden by it.
 */
export const ATMOSPHERE = {
  /** Sky dome colours: straight up, at the horizon, and below it (seen only over low walls). */
  zenith: 0x3f82d6,
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
  /**
   * The dome's draw order (audit REN-05): after every opaque object (order 0), so the depth test leaves only the sky's
   * own pixels to shade; drawn first it filled the whole screen under the field, about 9 % of a Low frame.
   */
  skyRenderOrder: 1,
  /** Linear haze in the horizon colour (metres from the camera). */
  fogNear: 32,
  fogFar: 210,
  /**
   * A ring of trees beyond the walls, so the yard sits somewhere: how many, how far from the field's centre
   * (metres; a field whose far corner is within `ringClearance` of `ringMin` pushes the ring out, keeping its width:
   * every map gets it, none has trees inside), how tall, and their greens. One merged mesh, never casting shadows.
   */
  trees: {
    count: 70,
    ringMin: 62,
    ringMax: 100,
    ringClearance: 20,
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
  /**
   * The detailed ring (QualitySettings.trees 2; audit section 5 "Sky and trees"): more trees, broadleaves of two or
   * three stacked crowns (radii as a share of the first, each offset sideways up to `crownJitter` of its radius), pines
   * of two cone tiers, seven-sided trunks; every crown darker on its lower half (`underShade`) and warmer on the sun's
   * side (`sunWarm`, baked: free self-shading). A hedge of shrubs runs round the field just outside its walls.
   */
  detailedTrees: {
    count: 110,
    crowns: [1, 0.78, 0.6],
    crownLift: [0, 0.55, 1],
    crownJitter: 0.3,
    pineTiers: 2,
    trunkSides: 7,
    underShade: 0.8,
    sunWarm: 0.12,
    warmColour: 0xffe2a8,
    shrubs: { spacing: 3, gapFrom: 1.2, gapTo: 3.2, radiusMin: 0.75, radiusMax: 1.25, squash: 0.8, colors: [0x5b8448, 0x678f4d, 0x51773f] },
  },
  /**
   * Clouds and the sun's disc (QualitySettings.clouds, row 21): `count` flat-bottomed cumulus clouds round the sky at
   * `radius` metres, `widthMin`..`widthMax` wide, `elevationMin`..`elevationMax` radians above the horizon, each a few
   * overlapping soft discs (vertex colours and alpha, `opacity` at the middle, `shade` underneath; no texture), and the
   * sun as a soft disc `sunSize` radians across. One mesh: no fog (they are the sky), no depth writes, after the field.
   */
  clouds: {
    count: 9,
    radius: 180,
    widthMin: 34,
    widthMax: 62,
    elevationMin: 0.09,
    elevationMax: 0.3,
    opacity: 0.92,
    shade: 0xd8e2ee,
    sunSize: 0.035,
    sunColour: 0xfff6dc,
    seed: 3301,
  },
} as const;

/**
 * The held replica's sheen and the environment lighting (render/replicaSheen.ts, QualitySettings.replicaSheen and
 * .environment): the game's own sky prefiltered once into a half-float target (768 × 1024, about 6.3 MB), blurred by
 * `blur` (PMREM sigma, radians) so plastic reads moulded, not mirrored.
 */
export const REPLICA_SHEEN = { blur: 0.04 } as const;

/**
 * The environment map is the game's own sky (audit section 5, F1): the dome's colours (render/atmosphere.ts skyColour)
 * over a disc of sunlit concrete, so players, replicas, the flag and steel pick up a blue sky from above and a warm
 * ground from below, at every quality level the same. `intensity` is scene.environmentIntensity: a share of the sky's
 * light on top of the hemisphere fill, not instead of it. The scene is drawn once into the PMREM and freed.
 */
export const ENVIRONMENT = {
  intensity: 0.35,
  /** The ground under the sky: sunlit concrete (sRGB), as a disc `groundRadius` wide `groundDrop` below the eye. */
  ground: 0xa7a194,
  groundRadius: 40,
  groundDrop: 1,
  /** The sky sphere's size and segments (inside the PMREM camera's far plane, 100). */
  skyRadius: 20,
  skyWidthSegments: 32,
  skyHeightSegments: 16,
} as const;

/** Tone mapping (Settings → Graphics; not part of a preset, audit section 5 F2): how bright colours are rolled off. */
export type ToneMappingId = 'aces' | 'agx' | 'neutral';

/**
 * The tone mapping row (F2, owner decision: Neutral). ACES (the look until the overhaul) desaturates the team blue and
 * orange and greys the sky; Khronos PBR Neutral keeps saturated mid-tones (the clean, stylised look) and AgX sits
 * between. Each has its own exposure so sunny concrete reads about as bright under all three.
 */
export const TONE_MAPPING = {
  default: 'neutral' as ToneMappingId,
  /** ACES at 1.08 is M14's: a touch over 1, so sunny concrete reads bright and friendly rather than grey. */
  exposure: { aces: 1.08, agx: 1.15, neutral: 1 } satisfies Record<ToneMappingId, number>,
} as const;

/** The look the retro pixel filter draws with (Settings → Dev, M42). */
export interface RetroLook {
  /** CSS pixels per retro pixel, each way. */
  pixelSize: number;
  /** Shades of each of red, green and blue (2 or more): 6 gives 216 colours. */
  levels: number;
}

/**
 * The retro pixel filter (M42, Settings → Dev, render/retroFilter.ts): the 3D view drawn at 1 / pixel size of the page's
 * size and shown with no smoothing, then crushed to a few levels per channel with a 4×4 ordered dither. Engine-wide.
 */
export const RETRO = {
  /**
   * A BB's ball is never drawn narrower than this many retro pixels, nor its streak thinner than `trailMinPixels`: at
   * 8 px a pixel, the normal 5 px dot would fall between the low-resolution view's samples and blink out.
   */
  bbMinPixels: 2,
  trailMinPixels: 1,
} as const;

/**
 * Contact shadows (F5, render/contactShadows.ts): a soft dark disc on the floor under every player, one draw call for
 * all of them, on every preset (free: a few dozen triangles). It grounds a figure on Low, where there are no shadow
 * maps, and under a wall's shade on every preset. Radius (m) standing and fully crouched (a crouch hugs the floor),
 * darkness at the centre, rings and sides of the disc, and its lift off the floor (m).
 */
export const CONTACT_SHADOWS = {
  radius: 0.42,
  crouchedRadius: 0.36,
  darkness: 0.42,
  /** The disc's darkness at its middle ring (a share of `darkness`), at `middle` of the radius out. */
  middleShade: 0.55,
  middle: 0.5,
  segments: 12,
  lift: 0.015,
  maxFigures: 16,
} as const;

/**
 * Bright, friendly daylight: a warm sun and a cool sky fill (M14). The hemisphere's ground colour is the sunlit
 * concrete's bounce, so shaded sides stay warm and readable, never murky. G6 (the approved v3 look, Breath of the Wild's
 * light): the sun lower (about 35° up) and warmer, so walls and figures take it across their faces and throw longer
 * shadows, and a bluer, stronger sky fill, so the shade reads cool; the sun a touch stronger to keep the ground's light.
 */
export const LIGHTING = {
  hemiSky: 0xb6d0f2,
  hemiGround: 0xa08e70,
  hemiIntensity: 1.6,
  sunColor: 0xffd9aa,
  sunIntensity: 3.1,
  /**
   * Sun position relative to the map centre (metres): about 35° above the horizon (G6; 60° before), as far out as
   * before (49 m), so the shadow camera's reach is unchanged.
   */
  sunOffset: { x: 32.5, y: 27.8, z: 23 },
  /** Extra margin around the level box for the shadow camera (metres). */
  shadowMargin: 2,
  shadowBias: -0.0004,
  /**
   * Normal bias in shadow-map texels (REN-08): acne hides behind about half a texel whatever the texel's size, so the
   * bias follows it (0.03 m at Medium's 5.9 cm texels on Depot; a third of that on High's view-fitted map).
   */
  shadowNormalBiasTexels: 0.5,
  /**
   * The view-fitted shadow map (QualitySettings.shadowFollowsView: High, and Medium at night on a field wider than the view since M52): a disc of
   * `radius` metres centred `ahead` metres in front of the camera along the ground (so 26 m ahead and 10 m behind are
   * shadowed). At 2048² the texels are 1.9 cm, against 2.9 cm for the whole of Depot; at 1024² 3.9 cm, against 10 cm
   * for the whole of Woodland under its low moon. The disc moves in whole texels, so edges don't crawl.
   */
  shadowView: { radius: 18, ahead: 8 },
} as const;

/** The values a sky is painted from (sRGB hex colours; render/atmosphere.ts skyColour). */
export interface SkyPalette {
  zenith: number;
  horizon: number;
  below: number;
  /** A glow round the key light's direction (the sun's warmth, the moon's halo) and how tightly it gathers. */
  sunGlow: number;
  sunGlowPower: number;
  horizonFalloff: number;
}

/** The looks a map can be lit with (M33f): its data lists the ones it offers (MapData.lighting), the first by default. */
export type LightingPresetId = 'day' | 'night';

/**
 * Everything that makes a map's light (M33f, render/lightingPreset.ts): the sky, the haze, the hemisphere fill, the key
 * light (the sun or the moon) and its disc in the sky, the clouds' colours, the environment map's ground and strength
 * and a factor on the tone mapping's exposure. Any map can use any preset; Renderer.setLighting and addLighting apply it.
 */
export interface LightingPreset {
  /** A night look: the play cues of the dark (glowing BBs, night sight) go with it. */
  night: boolean;
  sky: SkyPalette;
  /** Linear haze (Renderer's fog and background), metres from the camera. */
  fog: { colour: number; near: number; far: number };
  hemi: { sky: number; ground: number; intensity: number };
  /**
   * The shadow-casting key light: colour, intensity and its place relative to the field's centre (metres). A map's
   * `moonOver` turns it towards a point, keeping its height above the horizon. `disc` is its disc in the sky (Clouds on).
   */
  key: { colour: number; intensity: number; offset: { x: number; y: number; z: number }; disc: { colour: number; size: number } };
  /** The clouds' underside and top colours and their opacity at the middle. */
  clouds: { shade: number; top: number; opacity: number };
  /** The environment map's ground (sRGB) and scene.environmentIntensity. */
  environment: { ground: number; intensity: number };
  /** Times the tone mapping's own exposure (TONE_MAPPING.exposure). */
  exposureScale: number;
  /**
   * The held replica's own lights (M33h, render/viewmodel.ts): a hemisphere fill, a key and a rim, colours and
   * intensities. Their directions are VIEWMODEL.light's. The day preset's are VIEWMODEL.light's exactly.
   */
  viewmodel: { hemi: { sky: number; ground: number; intensity: number }; key: { colour: number; intensity: number }; rim: { colour: number; intensity: number } };
  /**
   * Weapon torches under this light (M33h, render/torchBeams.ts). `beam` 0 builds nothing (the day: the torch is left
   * off the replica, sim/torch.ts partsUnder). Otherwise: the drawn beam's strength (the cone, additive), the lens
   * glare's and the lit spot's where a beam lands; `spot` the real spot light's intensity on your own torch (candela, Medium and High); `spill` how far the held
   * replica's key light turns to the torch's colour and `spillIntensity` how much stronger it gets while yours is on
   * (bounce from the beam); `figureLift` the glow a figure in someone's beam takes where no real light reaches it.
   */
  torch: { beam: number; glare: number; hitSpot: number; spot: number; spill: number; spillIntensity: number; figureLift: number };
  /**
   * The night sky (M33i, render/nightSky.ts): `stars` stars (0: none), and the moon's disc `moonSize` radians across in
   * `moonColour` (0: none) inside a halo `halo` times as wide at `haloAlpha` at its middle. On every quality, so Low has
   * its moon too. Nothing by day.
   */
  nightSky: { stars: number; moonSize: number; moonColour: number; halo: number; haloAlpha: number };
}

/**
 * The held replica's own lights by day (VIEWMODEL.light): the day preset's `viewmodel` group is made of these. Exported
 * for config/renderView.ts's VIEWMODEL (G5's split); read VIEWMODEL.light elsewhere.
 */
export const VIEWMODEL_LIGHT = {
  hemi: [0xe8f0ff, 0x4a4438, 1.3],
  keyColor: 0xfff0d8,
  keyIntensity: 2.2,
  keyPosition: [0.6, 1, 0.4],
  rimColor: 0xcfe0ff,
  rimIntensity: 1.2,
  rimPosition: [-0.8, 0.4, -1],
} as const;

/** The night key light's height above the horizon (degrees) and distance from the field's centre (m). */
const MOON = { elevationDeg: 18, distance: 48 } as const;
const MOON_ELEVATION = (MOON.elevationDeg * Math.PI) / 180;

/**
 * The lighting presets (M33f). `day` is the look every map had before (M14 and FA7), built from the constants above
 * field by field, so Depot, the range and the test maps draw exactly as before. `night`: a dark blue sky with a pale
 * moon halo, haze from 20 m, a dim cool fill and a low moon (18°) as the key light, so it rims the tops of hills facing
 * it while the faces turned away stay dark; first guesses, tuned in the browser.
 */
export const LIGHTING_PRESETS: Readonly<Record<LightingPresetId, LightingPreset>> = {
  day: {
    night: false,
    sky: { zenith: ATMOSPHERE.zenith, horizon: ATMOSPHERE.horizon, below: ATMOSPHERE.below, sunGlow: ATMOSPHERE.sunGlow, sunGlowPower: ATMOSPHERE.sunGlowPower, horizonFalloff: ATMOSPHERE.horizonFalloff },
    fog: { colour: ATMOSPHERE.horizon, near: ATMOSPHERE.fogNear, far: ATMOSPHERE.fogFar },
    hemi: { sky: LIGHTING.hemiSky, ground: LIGHTING.hemiGround, intensity: LIGHTING.hemiIntensity },
    key: { colour: LIGHTING.sunColor, intensity: LIGHTING.sunIntensity, offset: LIGHTING.sunOffset, disc: { colour: ATMOSPHERE.clouds.sunColour, size: ATMOSPHERE.clouds.sunSize } },
    clouds: { shade: ATMOSPHERE.clouds.shade, top: 0xffffff, opacity: ATMOSPHERE.clouds.opacity },
    environment: { ground: ENVIRONMENT.ground, intensity: ENVIRONMENT.intensity },
    exposureScale: 1,
    viewmodel: {
      hemi: { sky: VIEWMODEL_LIGHT.hemi[0], ground: VIEWMODEL_LIGHT.hemi[1], intensity: VIEWMODEL_LIGHT.hemi[2] },
      key: { colour: VIEWMODEL_LIGHT.keyColor, intensity: VIEWMODEL_LIGHT.keyIntensity },
      rim: { colour: VIEWMODEL_LIGHT.rimColor, intensity: VIEWMODEL_LIGHT.rimIntensity },
    },
    torch: { beam: 0, glare: 0, hitSpot: 0, spot: 0, spill: 0, spillIntensity: 0, figureLift: 0 },
    nightSky: { stars: 0, moonSize: 0, moonColour: 0, halo: 0, haloAlpha: 0 },
  },
  night: {
    night: true,
    sky: { zenith: 0x0a1224, horizon: 0x1d2b46, below: 0x0e1218, sunGlow: 0x9fb4d6, sunGlowPower: 10, horizonFalloff: 1.6 },
    fog: { colour: 0x1d2b46, near: 20, far: 140 },
    // M52 (audit REN-02): a paler moon and a warmer ground fill, both brighter, and a touch more exposure. Under the old
    // blue moon (0xb8c8ff × 0.6, fill 0.4) Neutral tone mapping took browns near black (earth (5,2,5) sRGB); now earth
    // reads (19,11,13), the cabin's boards (20,12,2) and a mid skin tone (48,31,25), and the neon signs glow as before
    // (render/nightSwatch.test.ts works these out without WebGL).
    hemi: { sky: 0x3a4c78, ground: 0x2a2620, intensity: 1 },
    key: {
      colour: 0xc8d4ff,
      intensity: 1,
      offset: { x: Math.cos(MOON_ELEVATION) * MOON.distance, y: Math.sin(MOON_ELEVATION) * MOON.distance, z: 0 },
      disc: { colour: 0xe8eeff, size: 0 },
    },
    clouds: { shade: 0x121826, top: 0x3c475e, opacity: 0.5 },
    environment: { ground: 0x1c1f26, intensity: 0.2 },
    exposureScale: 1.3,
    // The held replica by moonlight (M33h): a dim cool fill, a pale moon key, a faint blue rim. Before, it stayed lit as
    // by day at night (KNOWN_ISSUES, M33f).
    viewmodel: { hemi: { sky: 0x6a7ca8, ground: 0x22242c, intensity: 0.55 }, key: { colour: 0xb8c8ff, intensity: 0.7 }, rim: { colour: 0x8fa6e0, intensity: 0.6 } },
    torch: { beam: 0.16, glare: 1, hitSpot: 0.55, spot: 160, spill: 0.6, spillIntensity: 0.8, figureLift: 0.35 },
    // M33i: the moon and stars on every quality (render/nightSky.ts); the clouds' key disc is off (size 0), so Medium and
    // High don't draw two moons.
    nightSky: { stars: 520, moonSize: 0.05, moonColour: 0xf1f4ff, halo: 4.5, haloAlpha: 0.22 },
  },
};

/**
 * The weapon torches drawn (M33h, render/torchBeams.ts), on any preset whose `torch.beam` is above 0. Everyone's torch
 * but your own is three instanced draws for the whole match: a cone (`coneSegments` round, `coneShare` of the beam's
 * reach or up to what it lands on, fading out along it), a glare at the lens (`glareSize` m, growing to `glareGrow`
 * times as it points at you; seen from within `glareFromDeg` of its axis) and a lit disc where the beam lands
 * (`spotSegments` round, its brightness falling with the distance over the reach, `spotLift` off the surface, at least
 * `spotMinSize` m across). The lens is `lensForward` m ahead of the eye and `lensDown` below it. Your own torch on
 * Medium and High is one real spot light (no shadow: it sits by the eye, so its shadows would hide behind what casts
 * them), which takes one of the night lights (QualitySettings.poolLights), so the scene's real light count never changes.
 */
export const TORCH_BEAMS = {
  coneSegments: 14,
  coneShare: 0.6,
  /** The cone fades in over this share of its length from the lens, and out by its end. */
  coneFadeIn: 0.04,
  glareSize: 0.09,
  glareGrow: 4,
  glareFromDeg: 70,
  spotSegments: 16,
  spotLift: 0.03,
  spotMinSize: 0.3,
  lensForward: 0.45,
  lensDown: 0.12,
  /**
   * Your own beam on Low, seen from behind the lens (no real spot): a soft glow `hazeAt` m ahead (or where the beam
   * lands, if nearer), as bright as `hazeGain` times the preset's cone.
   */
  hazeAt: 6,
  hazeGain: 1.5,
  /** The real spot light's falloff (physical: 2). */
  decay: 2,
} as const;

/**
 * Light pools on a night field (M33f, render/lightPools.ts; MapLight in map/nightSight.ts), drawn under a night preset
 * only (M34e). Every pool glows: a bright core (`core` of the pool's radius, its colour `coreWhite` of the way to white) inside faint additive halos (`size` times the core, at `alpha`; they
 * add up towards the middle, so the glow fades out in steps), one mesh for all. The ground under a pool is lit by one additive mesh for all pools (a disc of `rings` × `segments`,
 * `strength` at the middle fading to nothing at the radius, `lift` off the ground), unless a real point light
 * (QualitySettings.poolLights) shines on it: those take the nearest pools to the eye, by distance to the pool's edge, and
 * one moves to another pool only when that is `hysteresis` metres nearer, fading out and in over `fadeSeconds`. Each
 * reaches `reach` times the pool's radius with physical falloff (decay 2), `intensityPerArea` candela per square metre of
 * the pool's radius, and casts no shadow.
 */
export const POOL_LIGHTS = {
  core: 0.03,
  coreWhite: 0.5,
  halos: [
    { size: 2, alpha: 0.1 },
    { size: 3.5, alpha: 0.06 },
  ],
  glowDetail: 1,
  rings: 6,
  segments: 16,
  strength: 0.18,
  lift: 0.04,
  hysteresis: 3,
  fadeSeconds: 0.3,
  reach: 1.5,
  decay: 2,
  intensityPerArea: 0.5,
} as const;

/**
 * Signs and lit windows (M34e, render/mapSigns.ts; MapSign in map/mapTypes.ts), one mesh for all of a map's. By Night
 * they are unlit and self-lit: a neon sign at its colour times `neon`, a window at `window`; by Day a neon sign is a
 * painted board, its colour `paint` of the way to `board`, and a window is dark glass (`glass`), lit by the sun.
 * Each stands `offset` m off its wall, so it never fights the wall for depth. Painted markings (M34f, kind `paint`) are
 * their colour by Day and Night, lit like the floor under them, in a mesh of their own (`map-paint`). A city prop's
 * screens and product windows glow by Night as lit windows (render/cityProps.ts propSigns).
 */
export const SIGNS = {
  neon: 1.4,
  window: 0.7,
  paint: 0.45,
  board: 0x6a6f78,
  glass: 0x27303a,
  offset: 0.02,
} as const;

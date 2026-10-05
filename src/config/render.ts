import { matchOverWhistlesDuration } from './audio';
import type { BlockFinish } from '../map/mapTypes';
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
 * The Field of view setting on Settings, Graphics (M15b): horizontal degrees on a 16:9 screen, as
 * RENDER.horizontalFov16x9 (the default). The range is a first guess: wide enough for a wider view, narrow enough
 * that nothing fisheyes or tunnels.
 */
export const FOV_SETTING = { min: 80, max: 120, step: 1 } as const;

export type QualityPreset = 'low' | 'medium' | 'high';
/** What the Quality picker and the settings store hold: a preset, or the player's own mix of the Custom rows. */
export type QualityChoice = QualityPreset | 'custom';
/** The presets, cheapest first. */
export const QUALITY_PRESETS: readonly QualityPreset[] = ['low', 'medium', 'high'];

/** Shadow map sizes (texels per side): each step is four times the depth fill and memory (4 / 16 / 64 MB). */
export type ShadowMapSize = 1024 | 2048 | 4096;
/** Surface texture sizes (pixels per side): eight textures with mipmaps are 2.8 / 11.2 / 44.7 MB. */
export type TextureSize = 256 | 512 | 1024;
/** Anisotropic filtering levels (1 = off); the browser clamps to what the graphics card offers. */
export type Anisotropy = 1 | 2 | 4 | 8 | 16;
/**
 * How much modelled detail an asset group carries (FA8, final alpha audit section 5): `low` is the mesh as it was before
 * the visual overhaul (Low's cost), `high` adds the overhaul's shapes, finishes and edge highlights.
 */
export type DetailLevel = 'low' | 'high';
/** The detail levels, cheapest first. */
export const DETAIL_LEVELS: readonly DetailLevel[] = ['low', 'high'];

/**
 * What a quality preset or the Custom rows set (Settings → Graphics; final alpha audit section 4). Every field applies
 * at once, antialiasing too (a new WebGL context, Renderer.setQuality). Fields are added, never renamed: each new one
 * gets a value on every preset, a Custom row (config/graphics.ts) and a `graphics.<field>` key in the settings store.
 */
export interface QualitySettings {
  /** Resolution as a share of the screen's (0.5..1): the browser scales the picture up. The first lever on an iGPU. */
  renderScale: number;
  /** Caps devicePixelRatio; high-DPI laptops with iGPUs pay a lot for full resolution. */
  maxPixelRatio: number;
  /** 4× multisampling on the screen's framebuffer. */
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: ShadowMapSize;
  /**
   * Shadow softness in shadow-map texels. A look setting only: the filter takes the same five samples at any radius
   * (Three.js r186 PCFShadowMap), so it costs nothing (audit REN-09).
   */
  shadowRadius: number;
  /**
   * The sun's shadow map follows the view (REN-08): it covers a disc round the ground ahead of you
   * (LIGHTING.shadowView), not the whole field, so each texel is about a third of the ground and shadows of rails, posts
   * and limbs are sharp; past it nothing casts a shadow. Off, one map covers the whole field.
   */
  shadowFollowsView: boolean;
  /** Figures, the flag's cloth and the range targets are shaded by walls and containers, not only cast shadows (REN-07). */
  figureShadows: boolean;
  /**
   * Surface relief: the surface textures double as bump maps, so slab joints, mortar, planks and container ribs
   * catch the sun. Costs a few texture reads per pixel on every surface.
   */
  surfaceRelief: boolean;
  /** The surface textures' size (REN-13): sharper close up, more memory. */
  textureSize: TextureSize;
  /** Anisotropic filtering on the surface textures: keeps the floor sharp at grazing angles (REN-13). */
  anisotropy: Anisotropy;
  /** Dust motes drifting in the sunlight round you (render/dustMotes.ts); 0 draws none. */
  dustMotes: number;
  /** The held replica picks up soft reflections (an environment map), so its plastic has a moulded sheen. */
  replicaSheen: boolean;
  /**
   * Environment lighting (audit section 5, F1): the game's own sky, prefiltered once, lights and reflects in players,
   * the flag, the range's targets and steel floors (scene.environment), and is the replica's sheen too (one map, 6.3 MB).
   * The map's painted surfaces never take it (render/surfaceMaterials.ts withoutEnvironment): they are most of the screen.
   */
  environment: boolean;
  /**
   * How surface relief is drawn (F4): a normal map worked out from each texture (one read a pixel, sharper), or the
   * texture itself as a bump map (three reads and derivatives: the look before the overhaul). Nothing while relief is off.
   */
  normalMaps: boolean;
  /**
   * Map detail (F3 and the map, flag and range asset groups): bevelled edges with a light edge, a soft baked occlusion
   * in corners and under overhangs on a finer floor grid, painted signs and stencils, more prop detail, the flag's and
   * the range targets' finer parts. Static geometry, built once (a change rebuilds the map); off is the look before.
   */
  mapDetail: boolean;
  /** Trees round the field: 0 none, 1 the simple ring (the look before the overhaul), 2 layered crowns and a hedge. */
  trees: TreeDetail;
  /** Clouds and the sun's disc in the sky (row 21): one merged mesh of soft discs, no texture. */
  clouds: boolean;
  // FA8 (visual overhaul: figures, replicas, attachments, hands and effects; audit section 5 rows 17-20, 23).
  /**
   * Players' detail (row 17): `high` models the head, goggles, gloves, kit and clothing folds, with glossy goggles, helmet
   * shells and replicas from a per-vertex finish on the figure's one material (no extra draw call; render/figureFinish.ts).
   */
  figureDetail: DetailLevel;
  /**
   * The held replica and its parts (FA8): `high` adds bevelled edges with a lighter edge highlight, real rail slots,
   * ring sights, a moulded speckle finish (two 128² textures), glass lenses and an emissive laser lens.
   */
  replicaDetail: DetailLevel;
  /** The first-person gloves and sleeves (row 18): `high` adds knuckle pads, wrist straps, joint seams and sleeve folds. */
  handDetail: DetailLevel;
  /** A soft warm glow round every BB in flight (row 19), so a BB at 25 m is a warm dot, not a grey pixel. */
  bbGlow: boolean;
  /** Impact grit (row 20): a BB hitting a surface throws a few chips of it and a faint ring of dust round the puff. */
  impactGrit: boolean;
  /** A faint beam from the laser module's lens (row 23): off on every preset (a toy cue; real ones are invisible by day). */
  laserBeam: boolean;
  // M33f: night lighting.
  /**
   * Night lights (M33f): how many of a map's light pools (MapData.lights, fires and lanterns) light the scene with a real
   * point light, the nearest to you; the rest, and every pool on 0, light only the ground under them (one additive mesh).
   * A fixed number for the match, so no shader is rebuilt as you move. Nothing on a map without light pools.
   */
  poolLights: PoolLightCount;
}

/** Night lights (QualitySettings.poolLights): real point lights on the nearest light pools. */
export type PoolLightCount = 0 | 2 | 4;

/** Trees round the field (QualitySettings.trees). */
export type TreeDetail = 0 | 1 | 2;

/**
 * Render quality presets (M14; the ladder reworked by the final alpha audit, section 4, REN-01/02/23). High is the full
 * look for a discrete GPU; Medium is a true middle for integrated graphics (shadows, relief and smoothing, a smaller
 * shadow map and textures, no sheen); Low drops everything that costs fill rate and renders at 80 % of the screen's
 * resolution (REN-01). `?quality=low|medium|high|custom` overrides the saved pick for one visit, to measure frame cost
 * (Phase 3 audit C-04).
 */
export const QUALITY: Record<QualityPreset, QualitySettings> = {
  low: { renderScale: 0.8, maxPixelRatio: 1, antialias: false, shadows: false, shadowMapSize: 1024, shadowRadius: 1, shadowFollowsView: false, figureShadows: false, surfaceRelief: false, textureSize: 256, anisotropy: 1, dustMotes: 0, replicaSheen: false,
    environment: false, normalMaps: false, mapDetail: false, trees: 1, clouds: false, figureDetail: 'low', replicaDetail: 'low', handDetail: 'low', bbGlow: false, impactGrit: false, laserBeam: false, poolLights: 0 },
  medium: { renderScale: 1, maxPixelRatio: 1.25, antialias: true, shadows: true, shadowMapSize: 1024, shadowRadius: 1.5, shadowFollowsView: false, figureShadows: true, surfaceRelief: true, textureSize: 512, anisotropy: 4, dustMotes: 90, replicaSheen: true,
    environment: true, normalMaps: true, mapDetail: true, trees: 2, clouds: true, figureDetail: 'high', replicaDetail: 'high', handDetail: 'high', bbGlow: true, impactGrit: true, laserBeam: false, poolLights: 2 },
  high: { renderScale: 1, maxPixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 2048, shadowRadius: 2.5, shadowFollowsView: true, figureShadows: true, surfaceRelief: true, textureSize: 1024, anisotropy: 16, dustMotes: 180, replicaSheen: true,
    environment: true, normalMaps: true, mapDetail: true, trees: 2, clouds: true, figureDetail: 'high', replicaDetail: 'high', handDetail: 'high', bbGlow: true, impactGrit: true, laserBeam: false, poolLights: 4 },
};

/** The fields of a QualitySettings, in the order the Custom rows show them. */
export const QUALITY_FIELDS = Object.keys(QUALITY.high) as readonly (keyof QualitySettings)[];

/**
 * The settings in force for a choice: a preset's row, or (Custom) High's row overlaid with the saved custom fields.
 * The custom fields are trusted: the store's loader (ui/menus/savedChoices.ts loadCustomQuality) has checked them.
 */
export function resolveQuality(choice: QualityChoice, custom: Partial<QualitySettings>): QualitySettings {
  if (choice !== 'custom') return QUALITY[choice];
  const q: QualitySettings = { ...QUALITY.high };
  for (const field of QUALITY_FIELDS) {
    const v = custom[field];
    if (v !== undefined) (q as unknown as Record<string, unknown>)[field] = v;
  }
  return q;
}

/** Which preset a settings object equals in every field, or 'custom'. */
export function qualityChoiceOf(q: QualitySettings): QualityChoice {
  return QUALITY_PRESETS.find((p) => QUALITY_FIELDS.every((f) => QUALITY[p][f] === q[f])) ?? 'custom';
}

/**
 * The renderer's pixel ratio for a screen's devicePixelRatio: the DPI cap, then the render scale (REN-01). Below 1 the
 * game renders fewer pixels than the screen has and the browser scales the picture up (the HUD is HTML, so stays crisp).
 */
export function effectivePixelRatio(devicePixelRatio: number, q: QualitySettings): number {
  return Math.min(devicePixelRatio, q.maxPixelRatio) * q.renderScale;
}

/** What the graphics card is, by the renderer name the browser reports (render/gpuCheck.ts gpuTier). */
export type GpuTier = 'software' | 'integrated' | 'discrete' | 'unknown';

/**
 * The preset a first visit starts on by GPU (REN-03): Low when the browser draws in software (audit M-02: High there
 * runs at about two frames a second), Medium on integrated graphics and when the name is hidden (Firefox's
 * fingerprinting protection), High on a discrete card.
 */
export const TIER_QUALITY: Readonly<Record<GpuTier, QualityPreset>> = { software: 'low', integrated: 'medium', unknown: 'medium', discrete: 'high' };

/**
 * The quality a visit starts with: `?quality=` if given, else the saved pick, else the GPU tier's preset. `automatic`
 * marks the game's own pick: it is never saved (the same browser on a better GPU, or with its acceleration back on,
 * starts on that GPU's preset), and only an automatic pick steps down by itself when frames run slow (QUALITY_STEP_DOWN).
 */
export function startingQuality(
  fromUrl: QualityChoice | null,
  saved: QualityChoice | null,
  custom: Partial<QualitySettings>,
  tier: GpuTier,
): { choice: QualityChoice; settings: QualitySettings; automatic: boolean } {
  const picked = fromUrl ?? saved;
  if (picked !== null) return { choice: picked, settings: resolveQuality(picked, custom), automatic: false };
  const choice = TIER_QUALITY[tier];
  return { choice, settings: QUALITY[choice], automatic: true };
}

/** The Quality picker's options (Settings → Graphics), cheapest first, then Custom. */
export const QUALITY_CHOICES: readonly { id: QualityChoice; label: string; blurb: string }[] = [
  { id: 'low', label: 'Low', blurb: 'For integrated graphics: no shadows, relief, edge smoothing or dust, the plain map and sky, and 80 % resolution, scaled up.' },
  { id: 'medium', label: 'Medium', blurb: 'Shadows, players in shade, surface relief, sky reflections, the detailed map, trees and clouds, at a lower cost: a good middle for most laptops.' },
  { id: 'high', label: 'High', blurb: 'The full look: sharp textures, a finer shadow map that follows your view and dust in the sunlight.' },
  { id: 'custom', label: 'Custom', blurb: 'Your own mix of the rows below.' },
];

/** The choice a `?quality=` value names, or null for a missing or unknown value. */
export function parseQuality(value: string | null): QualityChoice | null {
  return QUALITY_CHOICES.find((c) => c.id === value)?.id ?? null;
}

/**
 * The automatic step-down (REN-03): while the game's own pick is in force (nothing saved, no `?quality=`), frame times
 * are watched in windows of `windowSeconds` of play; when `windows` windows in a row have a 95th percentile over
 * `p95Ms` (or over `capSlack` frames of a frame-rate cap, whichever is longer), the next preset down applies, once per
 * match, between rounds, and the HUD says so for `noticeSeconds`. It is never saved. A window is slow when more than
 * `slowShare` of its frames are over the threshold (that is what a 95th percentile over it means).
 */
export const QUALITY_STEP_DOWN = { windowSeconds: 2, p95Ms: 20, slowShare: 0.05, windows: 2, capSlack: 1.25, noticeSeconds: 5 } as const;

/**
 * Frame-rate cap (Settings → Graphics; REN-16, CORE-25): frames a second the game draws at most (0 = as many as the
 * screen shows). Not part of a preset. The simulation keeps its 60 ticks a second whatever the cap.
 */
export const FRAME_RATE_CAPS = [0, 30, 60, 120, 144] as const;
export type FrameRateCap = (typeof FRAME_RATE_CAPS)[number];
/**
 * A frame is drawn up to `slackMs` early, so a cap equal to the screen's rate never drops to every other frame on a
 * slightly early vsync; more than `resetFrames` frame periods behind, the schedule restarts from now (no burst to catch up).
 */
export const FRAME_PACING = { slackMs: 1, resetFrames: 2 } as const;

/**
 * The debug overlay's frame breakdown (REN-17): simulation, draw and GPU milliseconds a frame, each a running average
 * where every new frame weighs `smoothing`.
 */
export const FRAME_TIMING = { smoothing: 0.1 } as const;

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
  /**
   * Normal bias in shadow-map texels (REN-08): acne hides behind about half a texel whatever the texel's size, so the
   * bias follows it (0.03 m at Medium's 5.9 cm texels on Depot; a third of that on High's view-fitted map).
   */
  shadowNormalBiasTexels: 0.5,
  /**
   * The view-fitted shadow map (QualitySettings.shadowFollowsView, High): a disc of `radius` metres centred `ahead`
   * metres in front of the camera along the ground (so 26 m ahead and 10 m behind are shadowed). At 2048² the
   * texels are 1.9 cm, against 2.9 cm for the whole of Depot. The disc moves in whole texels, so edges don't crawl.
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

/** The held replica's own lights by day (VIEWMODEL.light): the day preset's `viewmodel` group is made of these. */
const VIEWMODEL_LIGHT = {
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
    hemi: { sky: 0x3a4c78, ground: 0x1a1c22, intensity: 0.4 },
    key: {
      colour: 0xb8c8ff,
      intensity: 0.6,
      offset: { x: Math.cos(MOON_ELEVATION) * MOON.distance, y: Math.sin(MOON_ELEVATION) * MOON.distance, z: 0 },
      disc: { colour: 0xe8eeff, size: 0 },
    },
    clouds: { shade: 0x121826, top: 0x3c475e, opacity: 0.5 },
    environment: { ground: 0x1c1f26, intensity: 0.2 },
    exposureScale: 1.15,
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
  // again under the trees. At night Neutral tone mapping still takes browns and greys near black (KNOWN_ISSUES), so the
  // spawns stay on grass.
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

/** Every surface texture (render/proceduralTextures.ts). */
export type SurfaceTextureId = CoreSurfaceId | NatureSurfaceId | CitySurfaceId;

/**
 * The look of the field's surfaces and props (M14, render/proceduralTextures.ts and render/mapMeshes.ts). Everything
 * here is drawing only: blocks collide, cover and steer bots exactly as their data says.
 */
export const SURFACES = {
  /** Metres one texture repeat covers, for the textures mapped in world space (crates are mapped once per face). */
  worldSize: { concrete: 4, blockWall: 1.6, crate: 1.2, corrugated: 2, steelPlate: 1.2, barrier: 1, sandbag: 1.2, gabion: 1.2, bark: 1.6, planks: 1.6, stone: 1.6, groundDetail: 4, plaster: 2.4, cladding: 1.6, tiles: 0.6, asphalt: 3, paving: 1.2, glass: 1.2 } satisfies Record<SurfaceTextureId, number>,
  /** How strongly each texture's light and dark read as relief when surface relief is on (bump scale). */
  relief: { concrete: 1.2, blockWall: 2.2, crate: 1.6, corrugated: 3, steelPlate: 2.4, barrier: 0.8, sandbag: 2.4, gabion: 1.8, bark: 2.6, planks: 1.8, stone: 1.8, groundDetail: 1, plaster: 0.6, cladding: 1.6, tiles: 1.4, asphalt: 1.4, paving: 1.6, glass: 0.4 } satisfies Record<SurfaceTextureId, number>,
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
  /**
   * Normal maps (QualitySettings.normalMaps, audit section 5 F4): each texture's brightness read as height and turned
   * into a normal map (render/surfaceNormals.ts heightToNormal). The slope scale per surface, for the original
   * 256-pixel drawing (the maps at other sizes are scaled to match, so relief reads the same at any texture size).
   */
  normalStrength: { concrete: 1.4, blockWall: 2.2, crate: 2, corrugated: 3.2, steelPlate: 2.8, barrier: 1, sandbag: 2.6, gabion: 2, bark: 2.8, planks: 2, stone: 2, groundDetail: 1.2, plaster: 0.6, cladding: 1.8, tiles: 1.6, asphalt: 1.6, paving: 1.8, glass: 0.4 } satisfies Record<SurfaceTextureId, number>,
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

/** BB and impact visuals. BBs are drawn bigger than 6 mm so they read at speed. */
export const BB_VISUALS = {
  radius: 0.018,
  color: 0xfffbe8,
  /**
   * The ball is two-toned (FA8): lit cream (`color`) on top, this warm grey underneath, blended over the sphere's
   * middle, so a BB reads as a ball in the sun rather than a flat disc. Free: a colour per vertex.
   */
  shadeColor: 0xc8bba0,
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
   * streak so a shot can be followed all the way, at night above all. Presentation only: they fly like any BB. A
   * Loadout choice, so drawn on every graphics preset (it costs nothing: a colour); `glow` below is FA8's halo.
   */
  glowInDark: {
    color: 0x9dff7a,
    trailColor: 0x5cff4a,
    minAngularRadius: 0.0045,
    trailSeconds: 0.05,
  },
  /**
   * The streak's width as an angle (radians of view; 0.0018 ≈ 1.8 px at 1080p, 2.3 px at 1440p): a camera-facing ribbon
   * (audit REN-19), the same on screen at any pixel ratio, where a WebGL line is one device pixel (fainter on high-DPI).
   */
  trailAngularWidth: 0.0018,
  /**
   * Your own BBs are drawn leaving the replica's muzzle and blend onto their true (eye-line) path over
   * this many seconds (~10 m), so you can see them fly instead of edge-on along your line of sight.
   */
  muzzleConvergeTime: 0.12,
  /** Close to a wall the blend finishes at this fraction of the flight time, so the BB visibly arrives. */
  convergeBeforeImpact: 0.7,
  /** Point-blank shots still blend over at least this long (s) instead of snapping. */
  minConvergeTime: 0.01,
  /**
   * The glow round each BB (QualitySettings.bbGlow, FA8): a soft warm dot `scale` times the ball's size, added (not
   * blended) at `opacity`, so a BB at 25 m is a warm dot and not a grey pixel. One more instanced draw while BBs fly.
   */
  glow: { scale: 2.6, opacity: 0.35, color: 0xffe2a8 },
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
 * Impact grit (QualitySettings.impactGrit, FA8): with each impact puff, a fainter, wider ring of dust (IMPACT_RINGS) and
 * `perImpact` chips of the surface (in its dust tint) thrown out at `speed` m/s, falling under `gravity` and gone after
 * `lifetime` s. Each chip is a small square `size` metres across (never under `minAngularSize` radians on screen),
 * spinning. Dust and splinters, never sparks. A pool of `max` chips (the oldest reused), one draw call.
 */
export const IMPACT_GRIT = {
  max: 256,
  perImpact: [4, 6] as const,
  speed: [2, 4] as const,
  gravity: 9.8,
  lifetime: 0.35,
  size: [0.006, 0.012] as const,
  minAngularSize: 0.0016,
  /** Thrown out towards the side the BB came from (its shooter's): this much of the direction, the rest random and up. */
  toward: 0.6,
  up: 0.5,
  spin: 18,
  /** Chips are a touch darker than the dust's tint, so they read against the puff. */
  shade: 0.75,
  seed: 4413,
} as const;

/** The faint ring of dust round an impact puff with impact grit on (FA8): wider, fainter and slower than the puff. */
export const IMPACT_RINGS: PuffConfig = {
  ...IMPACT_PUFFS,
  max: 32,
  lifetime: 0.5,
  growTime: 0.12,
  startScale: 0.4,
  radius: IMPACT_PUFFS.radius * 1.8,
  minAngularRadius: IMPACT_PUFFS.minAngularRadius * 1.8,
  opacity: 0.25,
  drift: 0.08,
};

/**
 * A gas replica's breath (M14): each shot of a gas pistol puffs a little propellant from the muzzle, pushed forward
 * (`muzzleSpeed`, m/s), and a smaller one out of the ejection port to the right as the slide cycles. No flash, no
 * casings: a toy's puff of gas.
 */
export const GAS_PUFFS: PuffConfig & { muzzleSpeed: number; portScale: number; portSpeed: number; portBack: number } = {
  max: 16,
  lifetime: 0.35,
  growTime: 0.07,
  startScale: 0,
  radius: 0.045,
  /** Small even far away: a hint, not a marker (0.004 ≈ 6 px wide at 1080p). */
  minAngularRadius: 0.004,
  // A cool, short breath (FA8): gas, not smoke.
  color: 0xe8f0ff,
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
 * (QualitySettings.dustMotes, at most `max`: the Custom row's top); they fill a cube `box` metres across centred on the
 * camera, wrapping round it as you move. Reduced motion turns them off.
 */
export const DUST_MOTES = {
  max: 300,
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
  /** Extraction (M43): how long the banner says you're back in, after a respawn (seconds). */
  respawnMessageTime: 2.4,
  /** Extraction (M44): how long the line under the crosshair says what a case held, and that you dropped your finds (s). */
  caseFoundTime: 2.6,
  caseDroppedTime: 6,
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
  /**
   * Viewmodel lighting by day: [sky, ground, intensity] hemisphere, warm key from above-right, cool rim from behind. A
   * map's lighting preset sets the colours and strengths (LightingPreset.viewmodel, M33h); the day preset's are these.
   */
  light: VIEWMODEL_LIGHT,
} as const;

/** How long after the match is decided the result screen appears: once the whistles have finished. */
export function matchOverScreenDelay(): number {
  return matchOverWhistlesDuration() + HUD.matchOverScreenPause;
}

/**
 * Flag mode's pole: a site's flagpole on a weighted base, with the attackers' flag climbing it as
 * they raise it, and a painted ring on the floor marking how close you must be to work the rope.
 */
/**
 * Extraction's exits (M43, render/exitRenderer.ts): a ring painted on the floor, site cones round it and a sign on a
 * post, green while the exit is open, grey while a late exit is still shut. Closed exits aren't drawn.
 */
export const EXIT_VISUALS = {
  openColor: 0x3fcf6a,
  shutColor: 0x8a8a84,
  /** The painted ring: its width (m), how far it floats over the floor (no z-fighting) and how see-through it is. */
  ringWidth: 0.18,
  ringLift: 0.02,
  ringOpacity: 0.85,
  /** The inside of the ring: a faint wash so the zone reads from a distance. */
  fillOpacity: 0.14,
  ringSegments: 40,
  /** Site cones round the ring: how many, and their size (m). */
  cones: 6,
  coneRadius: 0.13,
  coneHeight: 0.42,
  coneColor: 0xf08a24,
  coneSegments: 8,
  /** The sign's post and board (m), and the board's text. */
  postHeight: 2.1,
  postRadius: 0.04,
  postColor: 0xd9d6cc,
  boardWidth: 0.9,
  boardHeight: 0.42,
  openText: 'EXIT',
  shutText: 'LATE EXIT',
  /** The board's canvas (pixels). */
  boardPixels: { width: 256, height: 120 },
  /** Screen markers (ui/flagMarker.ts): kept this far inside the screen edge (px), hidden within this distance (m). */
  markerEdge: 36,
  markerHideWithin: 4,
  /** The marker's anchor above the exit's floor (m): about the top of the sign. */
  markerHeight: 2.4,
} as const;

/**
 * Extraction's cases (M44): site props by pool.md Key, each a body with a lid that hinges up at the back (a door on
 * its left side for the locker) and a painted band so it reads across a yard. Sizes in metres (width, height, depth;
 * the front is the spot's facing). A kind with no entry looks like a field case. The dropped case wears your team's
 * colour as its band.
 */
export const CASE_VISUALS = {
  kinds: {
    'ammo-can': { size: [0.42, 0.24, 0.2], lid: 0.05, opens: 'lid', body: 0x4f5a37, top: 0x46502f, band: 0xd9c14a, bandHeight: 0.04 },
    'field-case': { size: [0.86, 0.3, 0.56], lid: 0.08, opens: 'lid', body: 0x25292b, top: 0x1c1f21, band: 0xe0782a, bandHeight: 0.05 },
    locker: { size: [0.9, 1.8, 0.5], lid: 0.03, opens: 'door', body: 0x6b7378, top: 0x5c6368, band: 0xe8c547, bandHeight: 0.12 },
    dropped: { size: [0.5, 0.26, 0.32], lid: 0.06, opens: 'lid', body: 0x5d5a3f, top: 0x524f36, band: 0xffffff, bandHeight: 0.05 },
  },
  /** How far an opened lid (rad, back over its hinge) and the locker's door (rad, outwards) swing. */
  lidOpenAngle: 1.9,
  doorOpenAngle: 1.7,
  /** The band sits this far up the body (fraction of its height). */
  bandAt: 0.62,
  roughness: 0.75,
} as const;

export const FLAG_VISUALS = {
  poleHeight: 3.4,
  poleRadius: 0.035,
  poleColor: 0xe9e6dd,
  /** The pole's paint as before the overhaul; with Environment lighting, brushed aluminium that picks up the sky (`poleLit`). */
  poleRoughness: 0.5,
  poleMetalness: 0.3,
  poleLit: { roughness: 0.35, metalness: 0.7 },
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
  /** Drawn after the floor with a depth offset, so it never flickers against it at a distance. */
  ringRenderOrder: 1,
  /**
   * Detail with QualitySettings.mapDetail (audit section 5, "Flagpole and cloth"): a ball finial, a rope down the pole
   * to a cleat, a finer cloth (`clothDetailSegments` along and down) painted with the site's flag (`design`: a BB
   * roundel between two stripes, white so the team colour tints it) with a darker hem (`hemShade`, `hem` of the cloth's
   * size), and a ripple damped near the pole (`ripplePower` 1 is the plain cloth's straight growth).
   */
  detail: {
    finialRadius: 0.055,
    ropeRadius: 0.006,
    ropeOffset: 0.05,
    cleat: { width: 0.02, height: 0.12, depth: 0.03, at: 1.1 },
    ropeColor: 0xd9d2c0,
    clothDetailSegments: [16, 10] as const,
    ripplePower: 1.6,
    hemShade: 0.82,
    hem: 0.08,
    design: { width: 256, height: 168, stripe: '#d6d6d6', roundel: '#ffffff', ring: '#cfcfcf', bb: '#3a3d40' },
  },
  /** Screen marker over the pole: anchor height (metres), and kept this far in from the screen edge (px). */
  markerHeight: 3.7,
  markerEdge: 36,
  /** Closer than this to the pole (metres, while playing) the marker hides: the pole is right there. */
  markerHideWithin: 5,
} as const;

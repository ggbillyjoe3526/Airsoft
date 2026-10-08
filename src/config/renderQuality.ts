// The quality presets, the Custom mix, the starting pick and its step-down, and the frame-rate choices. Split from
// config/render.ts in G5, which re-exports every name here: import from there.

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';
/** What the Quality picker and the settings store hold: a preset, or the player's own mix of the Custom rows. */
export type QualityChoice = QualityPreset | 'custom';
/** The presets, cheapest first. */
export const QUALITY_PRESETS: readonly QualityPreset[] = ['low', 'medium', 'high', 'ultra'];

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
   * and limbs are sharp; past it nothing casts a shadow. Off, one map covers the whole field, by day only: under a night
   * preset the map follows the view whatever this says (M52, audit REN-08: the low moon stretches a whole-field map).
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
  // G6: materials and baked lighting.
  /**
   * Baked bounce light (G6, render/bakedLight.ts) on a map that ships a bake (MapData.bakedLight): `pixel` reads the
   * probe grid on every surface pixel (one 3D texture read), `vertex` bakes it into the map's vertex colours when the
   * map is built (no per-pixel cost), `off` draws without it. Figures read it on the CPU either way.
   */
  bakedLight: BakedLightMode;
  /**
   * Weathering (G6, render/surfaceShader.ts): dirt creeping up from the ground, patches, rain streaks and rust on
   * steel, worked out per pixel in world space, so it never repeats with the texture. A rebuild of the map's shaders.
   */
  weathering: boolean;
  // G5: the post stack (render/post/, tuned in config/post.ts). All off draws the frame straight to the screen, as before.
  /** Ambient occlusion (GTAO): soft shade where surfaces meet, worked out at this share of the resolution; 0 is off. */
  ambientOcclusion: AmbientOcclusionScale;
  /** Bloom: emissive accents, neon, glowing BBs and the sun's glare spill a soft glow. */
  bloom: boolean;
  /** Temporal antialiasing: a jittered view blended over frames, so grass, wire and rails stop shimmering in motion. */
  temporalAA: boolean;
  /** Light shafts from the sun or the moon, at reduced resolution, while it is on or near the screen. */
  lightShafts: boolean;
  /** Screen-space reflections, only on surfaces flagged reflective (puddles and glass). */
  reflections: boolean;
  /** Film grain and a slight colour fringe at the screen's edges. */
  lensFinish: boolean;
}

/** How baked bounce light is drawn (QualitySettings.bakedLight). */
export type BakedLightMode = 'off' | 'vertex' | 'pixel';
/** The baked-light modes, cheapest first. */
export const BAKED_LIGHT_MODES: readonly BakedLightMode[] = ['off', 'vertex', 'pixel'];

/** Night lights (QualitySettings.poolLights): real point lights on the nearest light pools. */
export type PoolLightCount = 0 | 2 | 4 | 8;

/** Ambient occlusion (QualitySettings.ambientOcclusion): off, half or full resolution. */
export type AmbientOcclusionScale = 0 | 0.5 | 1;

/** Trees round the field (QualitySettings.trees). */
export type TreeDetail = 0 | 1 | 2;

/**
 * Render quality presets (M14; the ladder reworked by the final alpha audit, section 4, REN-01/02/23). High is the full
 * look for a discrete GPU; Medium is a true middle for integrated graphics (shadows, relief and smoothing, a smaller
 * shadow map and textures, no sheen); Low drops everything that costs fill rate and renders at 80 % of the screen's
 * resolution (REN-01). Ultra (G5) is above High for a fast discrete card at 4K: a 4096 shadow map at the softest radius,
 * up to 2× high-DPI resolution, the most dust and night lights, and every post effect at full quality; the GPU check never
 * picks it (TIER_QUALITY). `?quality=low|medium|high|ultra|custom` overrides the saved pick for one visit, to measure frame cost
 * (Phase 3 audit C-04).
 */
export const QUALITY: Record<QualityPreset, QualitySettings> = {
  low: { renderScale: 0.8, maxPixelRatio: 1, antialias: false, shadows: false, shadowMapSize: 1024, shadowRadius: 1, shadowFollowsView: false, figureShadows: false, surfaceRelief: false, textureSize: 256, anisotropy: 1, dustMotes: 0, replicaSheen: false,
    environment: false, normalMaps: false, mapDetail: false, trees: 1, clouds: false, figureDetail: 'low', replicaDetail: 'low', handDetail: 'low', bbGlow: false, impactGrit: false, laserBeam: false, poolLights: 0,
    bakedLight: 'vertex', weathering: false,
    ambientOcclusion: 0, bloom: false, temporalAA: false, lightShafts: false, reflections: false, lensFinish: false },
  medium: { renderScale: 1, maxPixelRatio: 1.25, antialias: true, shadows: true, shadowMapSize: 1024, shadowRadius: 1.5, shadowFollowsView: false, figureShadows: true, surfaceRelief: true, textureSize: 512, anisotropy: 4, dustMotes: 90, replicaSheen: true,
    environment: true, normalMaps: true, mapDetail: true, trees: 2, clouds: true, figureDetail: 'high', replicaDetail: 'high', handDetail: 'high', bbGlow: true, impactGrit: true, laserBeam: false, poolLights: 2,
    bakedLight: 'pixel', weathering: true,
    ambientOcclusion: 0, bloom: true, temporalAA: false, lightShafts: false, reflections: false, lensFinish: false },
  high: { renderScale: 1, maxPixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 2048, shadowRadius: 2.5, shadowFollowsView: true, figureShadows: true, surfaceRelief: true, textureSize: 1024, anisotropy: 16, dustMotes: 180, replicaSheen: true,
    environment: true, normalMaps: true, mapDetail: true, trees: 2, clouds: true, figureDetail: 'high', replicaDetail: 'high', handDetail: 'high', bbGlow: true, impactGrit: true, laserBeam: false, poolLights: 4,
    bakedLight: 'pixel', weathering: true,
    ambientOcclusion: 0.5, bloom: true, temporalAA: true, lightShafts: true, reflections: false, lensFinish: false },
  ultra: { renderScale: 1, maxPixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 4096, shadowRadius: 4, shadowFollowsView: true, figureShadows: true, surfaceRelief: true, textureSize: 1024, anisotropy: 16, dustMotes: 300, replicaSheen: true,
    environment: true, normalMaps: true, mapDetail: true, trees: 2, clouds: true, figureDetail: 'high', replicaDetail: 'high', handDetail: 'high', bbGlow: true, impactGrit: true, laserBeam: false, poolLights: 8,
    bakedLight: 'pixel', weathering: true,
    ambientOcclusion: 1, bloom: true, temporalAA: true, lightShafts: true, reflections: true, lensFinish: true },
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
  { id: 'medium', label: 'Medium', blurb: 'Shadows, players in shade, surface relief, sky reflections, the detailed map, trees, clouds and a soft glow on lights, at a lower cost: a good middle for most laptops.' },
  { id: 'high', label: 'High', blurb: 'For a gaming graphics card: sharp textures, a finer shadow map that follows your view, dust in the sunlight, soft shade where surfaces meet, light shafts and temporal smoothing.' },
  { id: 'ultra', label: 'Ultra', blurb: 'For a fast graphics card at 4K: the sharpest, softest shadows, full-resolution shade, reflections in puddles and glass, the most dust and night lights, and a film finish.' },
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
 * Frame-rate cap (Settings → Graphics; REN-16, CORE-25; 240 since G5): frames a second the game draws at most (0 =
 * Unlimited, the default: as many as the screen shows). Not part of a preset. The simulation keeps its 60 ticks a second whatever the cap.
 */
export const FRAME_RATE_CAPS = [0, 30, 60, 120, 144, 240] as const;
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

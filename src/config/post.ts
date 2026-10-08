import { ATMOSPHERE } from './render';

/**
 * The post stack's tuning (G5, render/post/): the passes QualitySettings turns on (ambientOcclusion, bloom, temporalAA,
 * lightShafts, reflections, lensFinish) read their numbers here. Every pass works on the linear, unclipped picture before
 * tone mapping, except the lens finish, which works on the finished one. First values from the concept
 * (concept/graphics-overhaul/post.ts), tuned on Depot and Neon Heights captures.
 */
export const POST = {
  /**
   * Ambient occlusion (Three.js's GTAO shader, render/post/ambientOcclusionPass.ts), worked out from the depth alone (the
   * normals rebuilt from it, so the scene is drawn once): `radius` metres round each point, `samples` directions, then a
   * Poisson denoise of `denoise.samples` taps in `denoise.rings` rings `denoise.radius` pixels wide; blended in at
   * `intensity` (1 = the full occlusion).
   */
  ao: {
    radius: 0.8,
    distanceExponent: 1.5,
    thickness: 2,
    scale: 1.2,
    distanceFallOff: 1,
    samples: 16,
    intensity: 0.9,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16, radiusExponent: 2 },
    /** The denoise's rotation noise: a square of this many texels, from this seed. */
    noiseSize: 64,
    noiseSeed: 0x5eed,
  },
  /**
   * Bloom (Three.js's UnrealBloomPass): only what is brighter than `threshold` in its brightest channel (linear, before
   * tone mapping; fading in over `softness` above it) glows. The game's lit surfaces and sky stay just under 1 there,
   * so the sun's disc, neon, emissive accents and glowing BBs glow and a sunlit wall doesn't; by luminance a saturated
   * neon sign (a pink at 1.4 is about 0.6) never would. `radius` is how far the glow spreads (0..1).
   */
  bloom: { strength: 0.5, radius: 0.5, threshold: 1, softness: 0.15 },
  /**
   * Temporal antialiasing (render/post/temporalAAPass.ts): the projection is moved by a sub-pixel step from a Halton
   * (2, 3) sequence of `jitterSamples` each frame, and the last frames' picture, reprojected through the depth and the
   * previous view, is blended in at `history` (clipped to the colours round the pixel this frame, so a moving player
   * leaves no ghost), then sharpened by `sharpen` to make up for the blend's softening. A camera that moves more than
   * `cutDistance` metres in a frame has cut (a new round's spawn, the next player watched): the history is forgotten.
   */
  taa: { jitterSamples: 8, history: 0.9, sharpen: 0.2, cutDistance: 3 },
  /**
   * Light shafts (render/post/lightShaftsPass.ts): the sky's pixels within `sunRadius` (a share of the screen's height)
   * of the sun or moon, blurred along `samples` steps towards it over `length` of the way, each step weighing `decay`
   * of the last, at `resolution` of the screen, added back at `strength` (by Night the moon's). The pass is skipped while
   * the sun is behind you or further than `margin` screen-heights off the edge. A pixel is sky when its depth is past
   * `skyFrom` metres (the sky dome is ATMOSPHERE.skyRadius away; scenery stops well short of it).
   */
  lightShafts: {
    resolution: 0.5,
    samples: 48,
    length: 0.9,
    decay: 0.96,
    sunRadius: 0.35,
    strength: { day: 1.6, night: 2 },
    margin: 0.5,
    skyFrom: ATMOSPHERE.skyRadius * 0.9,
  },
  /**
   * Reflections (render/post/reflectionPass.ts): screen-space, only on reflective surfaces. A mesh is reflective when its
   * `userData.reflective` is a strength above 0 (G8's puddles), or its name starts with one of `meshNames` (the map's
   * merged glass, render/mapMeshes.ts, at `glass`). The reflected ray walks `steps` steps of up to `maxDistance` metres
   * in all, takes a hit within `thickness` metres behind the depth, refines it `refine` times, and fades out over
   * `edgeFade` of the screen at the edges.
   */
  reflections: {
    meshNames: ['map-glass'],
    glass: 0.6,
    steps: 48,
    maxDistance: 24,
    thickness: 0.5,
    refine: 4,
    edgeFade: 0.1,
    /** Schlick's reflectance looking straight at the surface (water and glass, about 2 to 4 %; raised a little to read). */
    fresnelBase: 0.08,
  },
  /**
   * The lens finish (render/post/lensPass.ts): film grain strongest in the mid-tones, and colour fringing towards the
   * corners. The grain's pattern moves by `grainStride` pixels a frame and repeats after `grainCycle` frames.
   */
  lens: { grain: 0.028, fringe: 0.006, grainCycle: 997, grainStride: 7 },
} as const;

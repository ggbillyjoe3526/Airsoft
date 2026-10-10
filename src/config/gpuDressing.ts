/**
 * The node renderer's GPU-driven dressing (WebGPU overhaul W5; render/webgpu/compute/): grass blades on a map's grass
 * ground and stand-ins (impostors) for a wood beyond its fence, on Medium and up, for maps whose dressing asks for them
 * (MapDressing.grass and .forest). Imported only by the node renderer's lazy chunk: the WebGL path and Low draw neither.
 */

/** The presets that draw them: Low draws neither (no dearer than before W5). */
export type GpuDressingTier = 'medium' | 'high' | 'ultra';

/**
 * Grass (compute/grassLayout.ts, grassField.ts). The blades sit on a square round the camera and `levels` − 1 square
 * rings round it, each twice as far apart as the one inside (a clipmap): `spacing` m apart in the square, `half` lattice
 * steps from the middle to the edge of each, so the square holds 4·half² blade slots and each ring 4·(half² − hole²)
 * (hole = half/2 − 2: the one inside covers that), and the grass thins with distance by four a ring. Each slot's blade
 * is jittered within its lattice square by a hash of its world lattice point, so blades stay put as the camera moves.
 * Slots: Medium 41,952, High 93,696, Ultra 159,892 (the concept's 160,000).
 * - `fade`: the last share of a ring's reach over which its blades thin to the next ring's density (shrinking, never
 *   popping); `far`: the share of the outermost ring's reach where the last blades start shrinking away.
 * - Blades: `width` (m, the inner ring's; `widen` times wider each ring out, so the thinner grass still covers),
 *   `height` the map's height times a share in this range, `lean` (the tip's reach sideways, a share of the height).
 * - Colour: the ground's own (the terrain's vertex colours under the blade), `root` darker at its foot to `tip` lighter
 *   at its tip, each blade up to `jitter` lighter or darker; its normal leans `normalUp` of the way to straight up, so
 *   the blades light as the ground they grow from does.
 * - `wind`: the tip's sway (m) and its rate (rad/s), its phase moving across the field `scale` rad a metre; never
 *   under Reduced motion.
 * - `mask`: grass grows on the ground grid's grass cells (none under the trees, on earth, gravel or boards), off every
 *   block standing on the ground (`margin` m round its footprint) and every puddle, on a grid `cell` m fine.
 */
export const GPU_GRASS = {
  tiers: {
    medium: { spacing: 0.3, half: 64, levels: 3 },
    high: { spacing: 0.2, half: 84, levels: 4 },
    ultra: { spacing: 0.15, half: 110, levels: 4 },
  } satisfies Record<GpuDressingTier, { spacing: number; half: number; levels: number }>,
  fade: 0.18,
  far: 0.75,
  width: 0.04,
  widen: 1.7,
  height: [0.55, 1.15] as const,
  lean: 0.3,
  root: 0.6,
  tip: 1.1,
  jitter: 0.14,
  normalUp: 0.8,
  wind: { sway: 0.045, rate: 1.6, scale: 0.35 },
  mask: { cell: 0.25, margin: 0.1 },
} as const;

/**
 * Tree stand-ins beyond the fence (compute/forestStandIns.ts, forestAtlas.ts): `share` of the map's trees on each
 * preset, stood at least `fence` m outside the field's bounds (behind a treeline there, so none is seen up close), out to `reach` m from its middle, never within `apart`
 * m of each other, on the skyline's hills where they stand on one. Each is a picture of one of the game's own tree
 * shapes (the detailed ring's pines and broadleaves, render/atmosphere.ts), taken from `views` sides into an atlas of
 * `tile`-pixel squares (colour and normals, so the scene's lights shade them as they would the shapes), `height` m tall
 * (the ring's range), drawn turned to the camera, the two nearest views blended. Culled on the GPU by the view and by
 * `drawTo` m.
 */
export const GPU_FOREST = {
  share: { medium: 0.45, high: 0.7, ultra: 1 } satisfies Record<GpuDressingTier, number>,
  fence: 12,
  reach: 150,
  apart: 2.2,
  height: [9, 17] as const,
  variants: 6,
  views: 8,
  tile: 128,
  /** Each stand-in is a little darker or lighter (up to this share) so no two neighbours match. */
  jitter: 0.15,
  drawTo: 175,
  /** How far a stand-in's foot is sunk into the ground (m), so none floats on a hill's facets. */
  sink: 0.4,
  /** Pixels whose alpha is under this are cut (the picture's soft edge). */
  alphaTest: 0.5,
  seed: 7717,
} as const;

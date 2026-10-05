import type { LightingPresetId, SurfaceTextureId } from './render';

/**
 * Baked bounce light (G6; the concept's gi.ts, baked offline): `node pipeline/bake-light.mjs` turns a map's pieces into a
 * grid of solid voxels and casts rays from a grid of light probes. Rays that reach the sky keep the sky fill; rays that
 * hit a prop bring back its colour, brighter where the sun reaches it. The game reads the probes as the map loads
 * (render/bakedLight.ts). `bake` is everything the bake reads (a change asks for a re-bake: render/lightBake.ts hashes
 * it); `look` is how the game draws it (free to tune without a re-bake).
 */
export const BAKED_LIGHT = {
  bake: {
    /** The bake's own version: part of every map's bake hash, so a change to the algorithm asks for a re-bake. */
    version: 1,
    /** The lighting preset a bake is made under (the night maps are lit by their lamps; they opt out). */
    preset: 'day' as LightingPresetId,
    /** Voxel size for the solid grid (metres). */
    voxel: 0.2,
    /**
     * Probe spacing (metres): every 0.6 m across the field and up to `headroom` above its highest block (Depot's file is
     * about 155 KB gzipped; 0.5 m would be 250).
     */
    probe: 0.6,
    headroom: 1,
    /** Rays per probe, spread evenly over the sphere (a Fibonacci set), and how far each looks for a blocker (metres). */
    rays: 64,
    maxDist: 7,
    /**
     * A ray that hits at or below this height (metres) has reached open ground: the hemisphere light's ground colour
     * already gives the ground's bounce, so it counts as open, not as a blocker.
     */
    groundY: 0.06,
    /** A hit's light: the sun's share (the average cosine on a lit face) when the sun reaches it, plus the sky's share. */
    sunShare: 0.5,
    skyShare: 0.5,
    /** The bounce is the hits' light over all rays, times `gain`. */
    gain: 2,
    /** Sky visibility: the open share of the rays times `openGain`, plus `openFloor`, at most 1 (fill comes mostly from above). */
    openGain: 1.15,
    openFloor: 0.05,
    /** Probes inside solid voxels take the average of their open neighbours, this many passes deep. */
    fillPasses: 6,
    /**
     * Each surface texture's mean colour as a share of white (linear), times a piece's colour: what a prop of that
     * texture reflects. Measured by eye from the drawings; the bake never needs a canvas.
     */
    albedo: {
      concrete: 0.42, blockWall: 0.5, crate: 0.45, corrugated: 0.8, steelPlate: 0.5, barrier: 0.85, sandbag: 0.42, gabion: 0.2, paint: 0.85,
      bark: 0.3, planks: 0.45, stone: 0.4, groundDetail: 0.5, plaster: 0.8, cladding: 0.75, tiles: 0.6, asphalt: 0.15, paving: 0.4, glass: 0.1,
    } satisfies Record<SurfaceTextureId, number>,
  },
  look: {
    /** Per pixel (Medium and up): how far the sky fill follows the probes' sky visibility, and the bounce's strength. */
    occlusion: 1,
    bounce: 1.6,
    /** Metres off a surface, along its normal, its probes are read (a wall must not read the probes inside it). */
    lift: 0.28,
    /**
     * Vertex colours (Low): faces cut into tiles about `cell` metres across so the light has vertices to land on (large
     * faces only: a prop smaller than this keeps its box). Each vertex's colour is scaled by
     * 1 - `indirectShare` × (1 - sky visibility) + `bounce` × the bounce light: the sky fill's share of a sunlit
     * surface's light, and the bounce over the sun and fill's sum, on Low's Lambert surfaces.
     */
    vertex: { cell: 4, indirectShare: 0.45, bounce: 0.45 },
    /**
     * Figures (every preset, render/characterRenderer.ts): read `height` metres above their feet; their colour is scaled as
     * a vertex's (`indirectShare`), and the bounce glows on them at `bounce` (an emissive term, no new shader).
     */
    figure: { height: 1.1, indirectShare: 0.4, bounce: 0.12 },
  },
} as const;

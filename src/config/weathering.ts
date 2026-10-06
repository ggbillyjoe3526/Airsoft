import type { SurfaceTextureId } from './render';

/**
 * Wear and weathering (G6): what the texture library draws into its textures (render/textureLibrary.ts), and the
 * world-space grime the map's surface shaders add on Medium and up (QualitySettings.weathering,
 * render/surfaceShader.ts). Look only: nothing here changes what collides or what a bot sees.
 */

/** Marks drawn into a library texture, each 0 (none) to 1 (heavy). */
export interface TextureWear {
  /** Dark rain streaks running down the tile. */
  streaks: number;
  /** Rust blooms (brown, rougher). */
  rust: number;
  /** Chipped paint showing what is under it. */
  chips: number;
  /** Fine light scratches. */
  scratches: number;
}

/** The shader's weathering on one surface: grime (dirt, creep, streaks) and rust on steel, each 0..1. */
export interface ShaderWear {
  grime: number;
  rust: number;
}

export const WEATHERING = {
  /** Wear drawn into each library drawing. */
  textures: {
    blockWall: { streaks: 0.7, rust: 0, chips: 0.15, scratches: 0.1 },
    gabion: { streaks: 0.3, rust: 0.25, chips: 0, scratches: 0 },
    paint: { streaks: 0.6, rust: 0.6, chips: 1, scratches: 0.8 },
  } satisfies Partial<Record<SurfaceTextureId, TextureWear>>,
  /**
   * The shader term per surface (the concept's MATS grime and rust). Floors take a little (patches only matter on
   * the ground); painted and bare steel rust; plastic, glass and the woods' surfaces take little or none.
   */
  shader: {
    concrete: { grime: 0.6, rust: 0 },
    blockWall: { grime: 1, rust: 0 },
    crate: { grime: 0.7, rust: 0 },
    corrugated: { grime: 0.8, rust: 1 },
    steelPlate: { grime: 0.7, rust: 0.4 },
    barrier: { grime: 0.6, rust: 0 },
    sandbag: { grime: 0.5, rust: 0 },
    gabion: { grime: 0.5, rust: 0 },
    bark: { grime: 0, rust: 0 },
    planks: { grime: 0.7, rust: 0 },
    stone: { grime: 0.3, rust: 0 },
    groundDetail: { grime: 0, rust: 0 },
    plaster: { grime: 0.8, rust: 0 },
    cladding: { grime: 0.6, rust: 0.3 },
    tiles: { grime: 0.5, rust: 0 },
    asphalt: { grime: 0.3, rust: 0 },
    paving: { grime: 0.5, rust: 0 },
    glass: { grime: 0, rust: 0 },
    paint: { grime: 0.7, rust: 0.7 },
  } satisfies Record<SurfaceTextureId, ShaderWear>,
  /**
   * The shader's world-space noise (metres): dirt patches about 1 / `patchScale` m across with grain at `fineScale`;
   * dirt creeping `creep` m up a wall's foot (plus up to `creepVary` where the grain says); streaks `streakAcross`
   * per metre across and stretched `streakAlong` along the fall; rust blooms at `rustScale`. `dirt` is the grime's
   * colour as a share of the surface's (greyed by `grey`), and how much grime roughens a standard material.
   */
  noise: { patchScale: 0.33, fineScale: 3.7, creep: 0.45, creepVary: 0.5, streakAcross: 9, streakAlong: 0.22, rustScale: 1.1 },
  mix: { patches: 0.38, creep: 0.6, streaks: 0.32, grey: 0.45, dirt: [0.6, 0.55, 0.48], rust: [0.36, 0.17, 0.07], rustStrength: 0.85, roughen: 0.6 },
  /**
   * Stains on the ground (map detail, render/mapDecals.ts; their pictures in the signs' atlas): the floors are cut into
   * squares `cell` m across and each square holds one stain with chance `chance` (from `seed` and the square, so the
   * same map always gets the same stains), `size` m across (a tyre mark `tyre` wide and a quarter as deep), at least
   * `inset` m inside its floor's edge, never where a block stands within `clearance` m above the floor (no stain is
   * hidden under a prop or a ceiling). Kinds by weight: oil, dirt, a crack, tyre marks, scuffs.
   */
  stains: {
    seed: 0x5a17,
    cell: 4,
    chance: 0.55,
    size: { min: 1.1, max: 2.2 },
    tyre: 3.2,
    inset: 0.3,
    clearance: 2.4,
    weights: { oil: 3, dirt: 4, crack: 2, tyre: 1, scuffs: 2 },
    colour: { oil: '#1d1c1a', dirt: '#5b5246', crack: '#2b2a28', tyre: '#262523' },
    alpha: { oil: 0.55, dirt: 0.4, crack: 0.7, tyre: 0.45, scuffs: 0.35 },
  },
} as const;

/** A kind of ground stain (WEATHERING.stains). */
export type StainKind = keyof typeof WEATHERING.stains.weights;

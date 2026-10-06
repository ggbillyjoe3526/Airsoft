import type { ImpactMaterial } from './sounds';

// BBs, impact and gas puffs, impact dust and grit, dust in the air and hit puffs. Split from config/render.ts in G5,
// which re-exports every name here: import from there.

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

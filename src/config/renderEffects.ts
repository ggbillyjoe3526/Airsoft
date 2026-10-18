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
   * Loadout choice, so drawn on every graphics preset (it costs nothing: a colour). The ball is lit itself, with nothing
   * drawn round it (the owner's 0.1 Dev 5 playtest, note 3, took away FA8's halo round every BB).
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
  /** About a BB's own knock, not a cloud (Dev 6 playtest item 24: 0.06 read as kicked-up dirt). */
  radius: 0.035,
  /**
   * Never smaller than this on screen (radians of view; 0.008 ≈ 12 px wide at 1080p), so a puff still says where a
   * BB landed at 20 m, small enough to stay a speck (it was 0.013, about 20 px, before Dev 6 playtest item 24).
   */
  minAngularRadius: 0.008,
  /** Pale warm dust, a touch see-through so it reads on grey concrete and dark wood without a bloom (IMPACT_DUST tints it). */
  color: 0xfff1c9,
  opacity: 0.6,
  /** Upward drift while fading (m/s). */
  drift: 0.1,
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
  /** Leaves (Dev 6 item 44): a faint green breath of torn leaf; the leaves that flutter out are LEAF_FLECKS. */
  leaves: { tint: 0xa9c98a, scale: 0.7 },
};

/**
 * A run into a noisy prop (NP1, config/noise.ts): a puff of dust knocked off it where it was hit, in its material's dust
 * (IMPACT_DUST) and this many times a BB's puff (7 × 0.035 m, the size it had before the BB's puff was toned down), so
 * the knock shows from across the yard. Dust, never debris.
 */
export const PROP_BUMP_DUST = { scale: 7 };

/**
 * Impact grit (QualitySettings.impactGrit, FA8): with each impact puff, a fainter, wider ring of dust (IMPACT_RINGS) and
 * `perImpact` chips of the surface (in its dust tint) thrown out at `speed` m/s, falling under `gravity` and gone after
 * `lifetime` s. Each chip is a small square `size` metres across (never under `minAngularSize` radians on screen),
 * spinning. Dust and splinters, never sparks. A pool of `max` chips (the oldest reused), one draw call.
 */
export const IMPACT_GRIT = {
  max: 256,
  /** A few crumbs, not a spray (Dev 6 playtest item 24: it was 4 to 6 chips at 2 to 4 m/s). */
  perImpact: [2, 3] as const,
  speed: [1.2, 2.4] as const,
  gravity: 9.8,
  lifetime: 0.35,
  size: [0.005, 0.009] as const,
  minAngularSize: 0.0016,
  /** Thrown out towards the side the BB came from (its shooter's): this much of the direction, the rest random and up. */
  toward: 0.6,
  up: 0.5,
  spin: 18,
  /** Chips are a touch darker than the dust's tint, so they read against the puff. */
  shade: 0.75,
  seed: 4413,
} as const;

/**
 * Leaves knocked out of a bush by a BB (Dev 6 item 44, render/effects/leafFlecks.ts): a BB the leaves stop sends `perStop` of them
 * fluttering out, one that brushes through an edge `perBrush`, at every quality (they say where your BB went). Each is a
 * small leaf `size` metres long (never under `minAngularSize` radians on screen), thrown out at `speed` m/s, mostly back
 * towards the shooter's side (`toward`) and up (`up`), then falling under `gravity` but held back by the air (`drag`,
 * per second: they drift down at about gravity / drag), swaying `sway` m/s side to side every `swayPeriod` s and turning
 * over as they go, gone after `lifetime` s (fading over its last `fade`). Greens picked from `colours`, darker by up to
 * `shade`. They come to rest on the ground under the bush. A pool of `max` (the oldest reused), one draw call.
 */
export const LEAF_FLECKS = {
  // Full auto into a bush (13 a second, up to 6 leaves each, 1.1 s each) keeps about 86 in the air (BP5: at 48 they
  // were cut short mid-air).
  max: 96,
  perStop: [4, 6] as const,
  perBrush: [1, 2] as const,
  speed: [0.8, 1.8] as const,
  toward: 0.5,
  up: 0.6,
  gravity: 6,
  drag: 5,
  sway: 0.5,
  swayPeriod: [0.5, 0.9] as const,
  spin: 7,
  lifetime: 1.1,
  fade: 0.35,
  size: [0.035, 0.055] as const,
  minAngularSize: 0.002,
  colours: [0x4f7d3c, 0x5f8f45, 0x3f6a33, 0x7a9a4a] as const,
  shade: 0.25,
  seed: 4451,
} as const;

/** The faint ring of dust round an impact puff with impact grit on (FA8): wider, fainter and slower than the puff. */
export const IMPACT_RINGS: PuffConfig = {
  ...IMPACT_PUFFS,
  max: 32,
  lifetime: 0.5,
  growTime: 0.12,
  startScale: 0.4,
  radius: IMPACT_PUFFS.radius * 1.6,
  minAngularRadius: IMPACT_PUFFS.minAngularRadius * 1.6,
  /** Barely there: a haze round the puff, not a second cloud (Dev 6 playtest item 24; it was 0.25). */
  opacity: 0.12,
  drift: 0.06,
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
 * Dust motes drifting in the sunlight round you (M14, render/effects/dustMotes.ts): how many is the quality preset's
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

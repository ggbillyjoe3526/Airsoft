import { matchOverWhistlesDuration } from './audio';

/** Presentation tuning. Kept conservative for integrated GPUs. */
export const RENDER = {
  /**
   * Horizontal field of view in degrees on a 16:9 screen (CS ≈ 106°, Valorant 103°). Wider screens get
   * more horizontal view with the same vertical FOV ("Hor+"), so ultrawide doesn't fisheye.
   */
  horizontalFov16x9: 100,
  near: 0.05,
  far: 250,
  /** Caps devicePixelRatio; high-DPI laptops with iGPUs pay a lot for full resolution. */
  maxPixelRatio: 1.5,
  antialias: true,
  /** Anisotropic filtering for surface textures; keeps floor detail readable at grazing angles. */
  textureAnisotropy: 4,
  shadows: true,
  shadowMapSize: 2048,
  skyColor: 0xa9c6de,
  fogNear: 60,
  fogFar: 160,
} as const;

/** Bright, friendly daylight: hemisphere fill plus one shadow-casting sun. */
export const LIGHTING = {
  hemiSky: 0xdfeeff,
  hemiGround: 0x6b6250,
  hemiIntensity: 1.6,
  sunColor: 0xfff1d6,
  sunIntensity: 2.2,
  /** Sun position relative to the map centre (metres). */
  sunOffset: { x: 18, y: 40, z: 12 },
  /** Extra margin around the level box for the shadow camera (metres). */
  shadowMargin: 2,
  shadowBias: -0.0005,
  shadowNormalBias: 0.03,
  /** PCF filter radius; softens shadow edges a little. */
  shadowRadius: 2,
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
  /** Trail length in seconds of flight (streak = velocity × this). */
  trailSeconds: 0.022,
  trailColor: 0xfff4cc,
  trailOpacity: 0.75,
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
  radius: 0.06,
  /**
   * Never smaller than this on screen (radians of view; 0.013 ≈ 20 px wide at 1080p), so a puff reads
   * at 20 m and isn't hidden inside the crosshair's centre gap.
   */
  minAngularRadius: 0.013,
  /** Bright warm dust, strong enough to stand out on grey concrete and dark wood. */
  color: 0xfff1c9,
  opacity: 0.8,
  /** Upward drift while fading (m/s). */
  drift: 0.15,
};

/**
 * A BB landing on a player: a bigger, brighter burst of fabric dust that lingers a little, so a hit is
 * unmistakable even at 30 m (the "HIT!" sign follows a moment later). No blood, ever.
 */
export const HIT_PUFFS: PuffConfig = {
  max: 8,
  lifetime: 0.6,
  growTime: 0.05,
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
  /** How long "Round N" stays up after a round starts (seconds). */
  roundStartMessageTime: 1.8,
  /** The round clock turns to a warning colour at or below this many seconds. */
  lowClockSeconds: 20,
  /** The result screen appears this long after the match-over whistles end (see matchOverScreenDelay). */
  matchOverScreenPause: 0.3,
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
  /** Recoil kick per shot: metres back and radians up. */
  kickBack: 0.028,
  kickUp: 0.05,
  /** Recoil kick never stacks beyond this many shots' worth. */
  kickMax: 1.5,
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

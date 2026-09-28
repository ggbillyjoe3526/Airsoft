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
  /** Trail length in seconds of flight (streak = velocity × this). */
  trailSeconds: 0.022,
  trailColor: 0xfff4cc,
  trailOpacity: 0.75,
  /** Debug BB-path overlay: how many recent paths, and points per path. */
  debugPaths: 48,
  debugPathPoints: 150,
  debugPathColor: 0xff3fa4,
} as const;

export const IMPACT_PUFFS = {
  max: 64,
  lifetime: 0.35,
  /** Seconds to reach full size. */
  growTime: 0.06,
  radius: 0.045,
  color: 0xd9d2c3,
  opacity: 0.4,
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
  /** How far the replica drops while reloading / drawing / sprinting (metres). */
  reloadDrop: 0.12,
  drawDrop: 0.22,
  sprintDrop: 0.06,
  sprintTilt: 0.5,
} as const;

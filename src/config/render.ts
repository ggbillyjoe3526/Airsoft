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

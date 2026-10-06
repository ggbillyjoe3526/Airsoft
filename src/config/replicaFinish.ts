/**
 * The held replicas' finish on Replica detail and Hand detail `high` (FA8; final alpha audit section 5, "First-person
 * replicas", "Attachments" and the hands). Toy polymer with a moulded speckle, painted steel that picks up the sky when
 * there is an environment to reflect, a lighter bevel on every edge (the CS edge highlight), friendly wear on the
 * edges a hand rubs. Low keeps the replicas as they were. Colours are sRGB hex; lengths in metres.
 */
export const REPLICA_FINISH = {
  /**
   * The moulded speckle: a `size`² height field of 1-pixel noise round `grey` (±`noise`, 0..255), used as the roughness
   * map (so the mean roughness is the material's roughness × grey / 255) and, through a Sobel pass, as a normal map of
   * `normalStrength`. One pair of small textures shared by every replica material that takes it.
   */
  speckle: { size: 128, grey: 153, noise: 8, normalStrength: 2.5, seed: 9127 },
  /** Speckle texels per metre of surface (0.3 mm a texel on polymer): a fine grain, a coarser stipple on rubber grips and pads. */
  density: { polymer: 3400, rubber: 1100 },
  /** How strongly the speckle's normal map tilts the light (Three.js normalScale). */
  normalScale: 0.35,
  /** Mean roughness of the textured materials (the material's own roughness is this over the speckle's mean). */
  roughness: { polymer: 0.5, furniture: 0.56, mag: 0.52, rubber: 0.95 },
  /**
   * Painted steel: reads as metal only with something to reflect, so with the replica's sheen (an environment map) it
   * is metallic and smoother; without one it stays as it was, a dull painted grey (black otherwise).
   */
  metal: { color: 0x5f646c, lit: { metalness: 0.75, roughness: 0.38 }, unlit: { metalness: 0.35, roughness: 0.45 } },
  /** Bevel faces this much lighter; worn edges (charging handle, magazine release, grip's front strap, slide serrations) more. */
  edgeLight: 1.08,
  wearLight: 1.16,
  /** Boxes at least `minSize` on every side get rounded corners of `radius` (one segment); smaller ones stay sharp. */
  bevel: { radius: 0.0032, minSize: 0.009 },
  /** Optic glass: a faint tint, glossy enough to glint in the sheen. */
  glass: { color: 0x9fd0ff, opacity: 0.18, roughness: 0.05 },
  /** The laser module's lens glows: emissive at this strength over a dark red body (tone mapping rolls it off, no bloom). */
  laserGlow: 2,
  laserBody: 0x400808,
  /**
   * The weapon torch's lens (M33h): a dark glass while it is off; on, it glows the light's colour, emissive at `glow`
   * (High) or flat (Low). Its bezel's knurling is `knurls` rubber rings.
   */
  torch: { lensOff: 0x2a3038, glow: 3, knurls: 3 },
  /**
   * A replica drawn without a scheme (nothing calls for one: a tool or a test): the black and tan of before G2, with a
   * grey accent line. Each held replica is otherwise drawn in its scheme (config/schemes.ts).
   */
  unpainted: { body: 0x2a2c31, furniture: 0xb79c70, detail: 0x363a40, accent: 0x7d838c, steel: 0x5f646c },
  /** A glowing accent line (Ghost's cyan line, the Cyber Pistol's lines and core): emissive at this strength. */
  accentGlow: 2.5,
  /** The red dot's dot, seen on the sight's glass (high): a tiny bead lit like the laser's lens. */
  dot: { radius: 0.0011 },
  /** Stippled grip panels and foregrip bands (G2): the furniture's colour this bright. */
  stippleShade: 0.72,
  /** The steps a profile's rounded corners (`corner`) and its bevel (`bevel`) are drawn in, per replica detail. */
  profileSteps: { low: { corner: 3, bevel: 1 }, high: { corner: 5, bevel: 2 } },
  /** BBs seen through the standard magazine's witness window. */
  witnessBb: 0xfff4dc,
  /** Real rail slots: a tooth every `pitch`, `tooth` long. */
  rail: { pitch: 0.01, tooth: 0.005 },
  /**
   * The AEG's swapped barrels (M29b): the outer barrel's `radius` (a long barrel carries it on), the tight-bore's heavier
   * steel `sleeveRadius`; on high, a `collar` that long and round where a barrel joins or is crowned, dark flutes
   * `fluteWidth` wide and `fluteDepth` deep, and `segments` round.
   */
  barrel: { radius: 0.009, sleeveRadius: 0.0105, collar: 0.012, collarRadius: 0.0118, fluteWidth: 0.003, fluteDepth: 0.0006, segments: 16 },
  /**
   * A silencer (M29b; six-sided since G2): an accent `ring` this long at `ringAt` of the body, `ringProud` proud of it.
   * High adds a steel thread `adapter` this long at `adapterShare` of its radius, end caps `capStep` narrower than the
   * body, `grooves` steel bands round its back, the dark bore at the front (`boreShare` of its radius, `boreDepth` deep),
   * the round parts `segments` round.
   */
  silencer: { ring: 0.005, ringAt: 0.2, ringProud: 1.04, adapter: 0.008, adapterShare: 0.66, capStep: 0.0015, grooves: 4, groovePitch: 0.006, boreShare: 0.35, boreDepth: 0.002, segments: 24 },
  /**
   * The laser beam (QualitySettings.laserBeam, off on every preset): a line from the lens this long in the viewmodel's
   * space, fading out, at this opacity (additive). No dot is drawn in the world yet, so it stops short of anything.
   */
  laserBeam: { length: 1.2, opacity: 0.55 },
  /**
   * Hand detail `high`: the knuckle pad this much lighter than the glove, the finger joints' seams and the sleeve's
   * inner fold this share of their colour.
   */
  hands: { knuckleLight: 1.14, seamShade: 0.85, foldShade: 0.8 },
} as const;

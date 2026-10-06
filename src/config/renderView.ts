import { matchOverWhistlesDuration } from './audio';
import { VIEWMODEL_LIGHT } from './renderLighting';

// The camera, the field of view, the spectator camera, the HUD, the held replica and the mode markers (exits, cases,
// the flag). Split from config/render.ts in G5, which re-exports every name here: import from there.

/** Presentation tuning. Kept conservative for integrated GPUs. */
export const RENDER = {
  /**
   * Horizontal field of view in degrees on a 16:9 screen (CS ≈ 106°, Valorant 103°). Wider screens get
   * more horizontal view with the same vertical FOV ("Hor+"), so ultrawide doesn't fisheye. The default for the Field of
   * view setting: 90 (owner, 2026-10-04; was 100).
   */
  horizontalFov16x9: 90,
  near: 0.05,
  far: 250,
  /**
   * Leaning tilts the view by this much at full lean (radians), a fraction of the body's tilt: enough to
   * feel the peek without making the world swing.
   */
  leanCameraRoll: 0.12,
} as const;

/**
 * The Field of view setting on Settings, Graphics (M15b): horizontal degrees on a 16:9 screen, as
 * RENDER.horizontalFov16x9 (the default). The range is a first guess: wide enough for a wider view, narrow enough
 * that nothing fisheyes or tunnels.
 */
export const FOV_SETTING = { min: 80, max: 120, step: 1 } as const;

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
  /** How long a short HUD notice (e.g. "No fuller magazine" after a reload that can't help) stays up (s). */
  noticeTime: 1.4,
  /** Said when a ricochet ticks you in a match where ricochets don't count (M20). */
  ricochetNotice: "Ricochet · doesn't count, play on",
  /** Said when your BB reaches someone after a bounce and doesn't count (M20). */
  ricochetShooterNotice: "Your BB ricocheted · doesn't count",
  /** How long "Round N" stays up after a round starts (seconds). */
  roundStartMessageTime: 1.8,
  /** Extraction (M43): how long the banner says you're back in, after a respawn (seconds). */
  respawnMessageTime: 2.4,
  /** Extraction (M53, audit UI-02): how long the banner says a late exit opened, or that a minute is left (seconds). */
  runNewsTime: 2.4,
  /** Extraction (M44): how long the line under the crosshair says what a case held, and that you dropped your finds (s). */
  caseFoundTime: 2.6,
  caseDroppedTime: 6,
  /**
   * A progress bar (reload, case, count) runs on one CSS transition, so the page is told once, not per percent (M64,
   * audit UI-11). It starts the run again when the game's own progress is this many seconds off the transition's
   * (a long frame), and stands the bar when that progress has not moved for this long (a pause), so the bar never
   * reads a lie.
   */
  barDriftSeconds: 0.15,
  /** The round clock turns to a warning colour at or below this many seconds. */
  lowClockSeconds: 20,
  /** The result screen appears this long after the match-over whistles end (see matchOverScreenDelay). */
  matchOverScreenPause: 0.3,
  /**
   * The crosshair's arms open to show where your BBs can go: the gap is this many standard deviations
   * of the current spread (replica spread × stance and movement), on screen, but never under the
   * player's own smallest gap (Settings → Crosshair, config/matchInfo.ts). Gaps change only in steps of
   * crosshairGapStep pixels (fewer DOM writes).
   */
  crosshairSpreadSigmas: 2,
  crosshairGapStep: 0.5,
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
  /**
   * Recoil kick per shot: metres back and metres up. A lift, not a tilt: the barrel stays parallel to the view, so
   * BBs drawn from the muzzle to the crosshair stay in line with it through full auto (owner playtest, 2026-10-03).
   */
  kickBack: 0.028,
  kickLift: 0.012,
  /** The sprint carry is gone once this share of the post-sprint fire lockout is left (render/viewmodel.ts sprintCarry). */
  carrySquareAt: 0.25,
  /** Recoil kick never stacks beyond this many shots' worth. */
  kickMax: 1.5,
  /** How much of the mouse sway and walk bob goes away with the sight raised to your eye (0..1). */
  aimSteady: 0.75,
  /**
   * The share of the recoil kick left with the sight raised: a full kick would lift the optic's glass off the HUD
   * dot. A quarter keeps the dot inside the glass even at kickMax (a viewmodel test pins it).
   */
  aimKick: 0.25,
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
  /**
   * The replica's sheen (QualitySettings.replicaSheen): a soft studio environment reflected in its plastic at this
   * strength, so the polymer reads as moulded toy plastic rather than flat paint.
   */
  sheenIntensity: 0.32,
  /**
   * Viewmodel lighting by day: [sky, ground, intensity] hemisphere, warm key from above-right, cool rim from behind. A
   * map's lighting preset sets the colours and strengths (LightingPreset.viewmodel, M33h); the day preset's are these.
   */
  light: VIEWMODEL_LIGHT,
} as const;

/** How long after the match is decided the result screen appears: once the whistles have finished. */
export function matchOverScreenDelay(): number {
  return matchOverWhistlesDuration() + HUD.matchOverScreenPause;
}

/**
 * Flag mode's pole: a site's flagpole on a weighted base, with the attackers' flag climbing it as
 * they raise it, and a painted ring on the floor marking how close you must be to work the rope.
 */
/**
 * Extraction's exits (M43, render/exitRenderer.ts): a ring painted on the floor, site cones round it and a sign on a
 * post, green while the exit is open, grey while a late exit is still shut. Closed exits aren't drawn.
 */
export const EXIT_VISUALS = {
  openColor: 0x3fcf6a,
  shutColor: 0x8a8a84,
  /** The painted ring: its width (m), how far it floats over the floor (no z-fighting) and how see-through it is. */
  ringWidth: 0.18,
  ringLift: 0.02,
  ringOpacity: 0.85,
  /** The inside of the ring: a faint wash so the zone reads from a distance. */
  fillOpacity: 0.14,
  ringSegments: 40,
  /** Site cones round the ring: how many, and their size (m). */
  cones: 6,
  coneRadius: 0.13,
  coneHeight: 0.42,
  coneColor: 0xf08a24,
  coneSegments: 8,
  /** The sign's post and board (m), and the board's text. */
  postHeight: 2.1,
  postRadius: 0.04,
  postColor: 0xd9d6cc,
  boardWidth: 0.9,
  boardHeight: 0.42,
  openText: 'EXIT',
  shutText: 'LATE EXIT',
  /** The board's canvas (pixels). */
  boardPixels: { width: 256, height: 120 },
  /** Screen markers (ui/flagMarker.ts): kept this far inside the screen edge (px), hidden within this distance (m). */
  markerEdge: 36,
  markerHideWithin: 4,
  /** The marker's anchor above the exit's floor (m): about the top of the sign. */
  markerHeight: 2.4,
} as const;

/**
 * Extraction's cases (M44): site props by pool.md Key, each a body with a lid that hinges up at the back (a door on
 * its left side for the locker) and a painted band so it reads across a yard. Sizes in metres (width, height, depth;
 * the front is the spot's facing). A kind with no entry looks like a field case. The dropped case wears your team's
 * colour as its band.
 */
export const CASE_VISUALS = {
  kinds: {
    'ammo-can': { size: [0.42, 0.24, 0.2], lid: 0.05, opens: 'lid', body: 0x4f5a37, top: 0x46502f, band: 0xd9c14a, bandHeight: 0.04 },
    'field-case': { size: [0.86, 0.3, 0.56], lid: 0.08, opens: 'lid', body: 0x25292b, top: 0x1c1f21, band: 0xe0782a, bandHeight: 0.05 },
    locker: { size: [0.9, 1.8, 0.5], lid: 0.03, opens: 'door', body: 0x6b7378, top: 0x5c6368, band: 0xe8c547, bandHeight: 0.12 },
    dropped: { size: [0.5, 0.26, 0.32], lid: 0.06, opens: 'lid', body: 0x5d5a3f, top: 0x524f36, band: 0xffffff, bandHeight: 0.05 },
  },
  /** How far an opened lid (rad, back over its hinge) and the locker's door (rad, outwards) swing. */
  lidOpenAngle: 1.9,
  doorOpenAngle: 1.7,
  /** The band sits this far up the body (fraction of its height). */
  bandAt: 0.62,
  roughness: 0.75,
} as const;

export const FLAG_VISUALS = {
  poleHeight: 3.4,
  poleRadius: 0.035,
  poleColor: 0xe9e6dd,
  /** The pole's paint as before the overhaul; with Environment lighting, brushed aluminium that picks up the sky (`poleLit`). */
  poleRoughness: 0.5,
  poleMetalness: 0.3,
  poleLit: { roughness: 0.35, metalness: 0.7 },
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
  /** Drawn after the floor with a depth offset, so it never flickers against it at a distance. */
  ringRenderOrder: 1,
  /**
   * Detail with QualitySettings.mapDetail (audit section 5, "Flagpole and cloth"): a ball finial, a rope down the pole
   * to a cleat, a finer cloth (`clothDetailSegments` along and down) painted with the site's flag (`design`: a BB
   * roundel between two stripes, white so the team colour tints it) with a darker hem (`hemShade`, `hem` of the cloth's
   * size), and a ripple damped near the pole (`ripplePower` 1 is the plain cloth's straight growth).
   */
  detail: {
    finialRadius: 0.055,
    ropeRadius: 0.006,
    ropeOffset: 0.05,
    cleat: { width: 0.02, height: 0.12, depth: 0.03, at: 1.1 },
    ropeColor: 0xd9d2c0,
    clothDetailSegments: [16, 10] as const,
    ripplePower: 1.6,
    hemShade: 0.82,
    hem: 0.08,
    design: { width: 256, height: 168, stripe: '#d6d6d6', roundel: '#ffffff', ring: '#cfcfcf', bb: '#3a3d40' },
  },
  /** Screen marker over the pole: anchor height (metres), and kept this far in from the screen edge (px). */
  markerHeight: 3.7,
  markerEdge: 36,
  /** Closer than this to the pole (metres, while playing) the marker hides: the pole is right there. */
  markerHideWithin: 5,
} as const;

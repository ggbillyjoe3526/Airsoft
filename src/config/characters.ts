import { HITS } from './hits';

/**
 * What a human figure wears on its head (graphics overhaul G7; William, round 2: no bare faces): a high-cut helmet with
 * rails and a headset, a bump helmet, a balaclava, or a helmet with a full-face visor. Every one covers the face: the
 * goggles and a mesh mask, or the visor, and a neck gaiter below.
 */
export type Headgear = 'highCut' | 'bump' | 'balaclava' | 'visor';

/** One figure's looks: its headgear, whether it carries a pack and a radio, and how light its camo is. */
export interface FigureLook {
  readonly headgear: Headgear;
  /** A hydration pack on the carrier's back. */
  readonly pack: boolean;
  /** A radio pouch on the left of the carrier, its antenna up past the shoulder (on the detailed figure). */
  readonly radio: boolean;
  /** Its camo and shirt this many times as light as the team's (FIGURE.palette), so a team doesn't look cloned. */
  readonly tone: number;
}

/**
 * The six looks (G7, from the concept's four heads): every head masked, a mix of packs and radios, a little lighter or
 * darker camo each. Figure `id` wears look `id % 6`, so every player in a 3 v 3 looks different. Robots take the pack.
 */
const LOOKS: readonly FigureLook[] = [
  { headgear: 'highCut', pack: true, radio: true, tone: 1 },
  { headgear: 'balaclava', pack: false, radio: false, tone: 0.92 },
  { headgear: 'visor', pack: true, radio: false, tone: 1.06 },
  { headgear: 'bump', pack: false, radio: true, tone: 0.96 },
  { headgear: 'bump', pack: true, radio: false, tone: 1.08 },
  { headgear: 'highCut', pack: false, radio: false, tone: 0.98 },
];

/** A colour as [hue, saturation, lightness] in sRGB, each 0..1; a hue of -1 takes the team colour's own. */
export type Hsl = readonly [hue: number, sat: number, light: number];

/**
 * Third-person figures (graphics overhaul G7, the v3 concept William approved): airsoft players in camo under a plate
 * carrier, every face covered, or robots in a light or dark shell wearing the same carrier. Blocky and near-modular
 * (Marathon), bold colour (Valorant). The team colour is exact on the carrier all round the torso, the knee pads, the
 * armbands and the helmets, so teams read across the map; everything else is derived from it (FIGURE.palette), so the
 * colour-blind sets dress their teams too. Colours are flat vertex colours on one material per figure, so each figure
 * costs four draw calls.
 */
export const FIGURE = {
  colors: {
    glove: 0x26292e,
    /** Pouches, straps and headset cups; the darker for webbing, belts and the hood under a helmet. */
    gear: 0x4b5059,
    gearDark: 0x2b2f35,
    boots: 0x3a332b,
    sole: 0x24221f,
    /** Rubber: goggle frames, a mask's trim, a visor's seal. */
    rubber: 0x1f2125,
    /** Moulded black plastic: rails, a magazine's top, an antenna. */
    polymer: 0x24272c,
    /** The perforated steel mesh mask. */
    mask: 0x5f646b,
    buckle: 0x9ea4aa,
    /** A weapon torch's lens on a figure's replica (M33h): pale glass; its glow is the torch beams' glare. */
    torchLens: 0xdde6ee,
  },
  /**
   * How a team's clothes are derived from its colour (`teamColor`, the colour-blind sets included): warm team colours
   * (hue below `warmBelow` or above `warmAbove`) dress in tan camo, the rest in a cool grey of their own hue, both too
   * grey to be read as a team colour. The goggles' tint and the robots' glow take the team's hue; its dark (a back
   * panel, a balaclava) is its colour this much less saturated and lighter.
   */
  palette: {
    warmBelow: 0.2,
    warmAbove: 0.92,
    camo: { cool: [-1, 0.11, 0.47], warm: [0.11, 0.26, 0.58] } as Readonly<Record<'cool' | 'warm', Hsl>>,
    shirt: { cool: [-1, 0.12, 0.37], warm: [0.11, 0.21, 0.5] } as Readonly<Record<'cool' | 'warm', Hsl>>,
    lens: [-1, 0.55, 0.25] as Hsl,
    glow: [-1, 1, 0.64] as Hsl,
    dark: { sat: 0.85, light: 0.58 },
    /** The neck gaiter: the shirt this bright. */
    gaiter: 0.8,
    /** Camo blotches on the detailed figure: its darker and lighter tones, and the blotches' size (metres). */
    camoDark: 0.74,
    camoLight: 1.14,
    camoScale: 0.11,
  },
  /**
   * Robots (Settings › Look › Robots): a light shell for the first team and a dark one for the second, as the concept
   * (light and dark tell the teams apart with little colour vision too), dark joints, chrome pistons, a dark visor.
   */
  robot: {
    shells: [0xd9dee4, 0x4b5159] as readonly number[],
    joint: 0x2c3036,
    chrome: 0xc9cdd3,
    visor: 0x10161e,
  },
  looks: LOOKS,
  /** The figures' one material: matte fabric and plastic. */
  roughness: 0.82,
  /** Body layout (metres, feet at y = 0, facing -Z). Head height and crouch come from the hit volume so they always match. */
  hipHeight: HITS.lean.pivotHeight,
  /** The thigh's widest radius, the hips' spread, and the torso's box (the hit volume is built round these). */
  legRadius: 0.092,
  hipSpread: 0.095,
  torso: { width: 0.4, height: 0.56, depth: 0.24, bottom: HITS.lean.pivotHeight },
  shoulderHeight: 1.43,
  shoulderSpread: 0.2,
  /** Upper arm and forearm lengths (metres): elbows sit between shoulder and wrist by two-bone IK. */
  upperArm: 0.3,
  forearm: 0.29,
  /** The knee and the foot's frame below the hip, and the ankle above the foot (metres). */
  knee: 0.44,
  foot: 0.82,
  ankle: 0.04,
  /**
   * Player detail (QualitySettings.figureDetail, FA8). `low` is Low's cost: plain blocks, limbs 8 sides round in two
   * rings, mitten hands. `high` chamfers every block (its bevels a shade lighter: the CS edge highlight), rounds limbs
   * and shells further, prints camo blotches, splits the hands into fingers and adds the small kit (laces, vents,
   * webbing, a boom mic, an antenna, pistons). [sides, rings] of limbs, the head, helmet shells and joints; `band`:
   * [pieces, rows] of a curved band (goggles, a mask); `cylinder`: sides of a headset cup or a hinge.
   */
  detail: {
    low: { limb: [8, 2], head: [10, 6], shell: [12, 6], joint: [6, 4], band: [6, 1], cylinder: 8, overhaul: false },
    high: { limb: [10, 4], head: [14, 8], shell: [18, 8], joint: [10, 6], band: [12, 2], cylinder: 12, overhaul: true },
  },
  /**
   * The detailed figure's finishes (FA8, render/figureFinish.ts): [roughness, metalness] per vertex on the figure's one
   * material. Fabric stays matte; goggle lenses, visors and helmet shells are moulded and glossy; robot shells satin;
   * replicas toy polymer with painted-steel barrels. Shapes on top: bevels this much lighter (`edgeLight`), cuffs and
   * soles `cuffShade` and `soleShade` of their colour, lids `lidLight` lighter.
   */
  finish: {
    fabric: [0.82, 0],
    lens: [0.08, 0.25],
    shell: [0.38, 0.08],
    robot: [0.45, 0.12],
    polymer: [0.5, 0],
    steel: [0.4, 0.65],
    /** The mesh mask: perforated steel reads as a dull grey at range, not a mirror. */
    mesh: [0.55, 0.25],
    chrome: [0.22, 0.9],
    rubber: [0.92, 0],
  },
  edgeLight: 1.1,
  cuffShade: 0.84,
  soleShade: 0.55,
  lidLight: 1.15,
  /**
   * Where the rifle sits in the aiming pose, relative to the shoulder-line pivot (metres; x right, y up,
   * z forward is negative): its butt, and its length to the muzzle. BBs from other players are drawn
   * leaving this muzzle.
   */
  rifle: { x: 0.06, y: -0.06, butt: 0.12, length: 0.98 },
  /**
   * Player detail `high` (FA8): a fitted silencer (M29b) on the rifle in place of its flash hider, this long and round,
   * ending at the muzzle so BBs still leave its front.
   */
  silencer: { length: 0.12, radius: 0.024 },
  /** The same for the pistol, held out in both hands (figures draw it when the pistol is the active replica). */
  pistol: { x: 0.03, y: -0.05, butt: -0.42, length: 0.2 },
  /**
   * A weapon torch on a figure's replica (M33h): a box `size` square and `length` long on the right of the rifle's
   * handguard (`rifleSide` out, its middle `rifleAt` ahead of the butt), or `pistolLength` long under the pistol's slide
   * (`pistolBelow` down, `pistolSize` of the rifle's thickness), its front at the muzzle; its lens `lensSize` of the body
   * square and `lensDepth` deep.
   */
  torch: { size: 0.032, length: 0.11, rifleSide: 0.045, rifleAt: 0.72, pistolBelow: 0.035, pistolLength: 0.07, pistolSize: 0.8, lensSize: 0.8, lensDepth: 0.008 },
  headRadius: 0.11,
  /** The head is built in a frame at the base of the neck, this far below the head's centre. */
  neckBelowHead: 0.15,
  headHeight: HITS.headHeight,
  /** Crouched, the upper body drops this far and the legs fold to fit. */
  crouchDrop: HITS.crouchDrop,
  /** Walk cycle: leg swing (radians) and strides per metre walked. */
  legSwing: 0.55,
  stridesPerMetre: 0.75,
  /** Legs swing only above this speed (m/s); a jump bigger than `maxStride` (m) in one frame is a teleport, not a step. */
  walkingSpeed: 0.2,
  maxStride: 1,
  /**
   * Calling a hit: the raised hand's wrist this high (metres, standing), and the rifle hanging from the other hand this
   * far (radians) off straight down, muzzle forward.
   */
  hitHand: 1.98,
  hangTilt: 0.25,
  /** Players out in the dead zone hold their replica pointing at the ground (radians of aim pitch). */
  outAimPitch: -0.9,
  /**
   * Hit flinch: the upper body jolts the way the BB was travelling (radians of lean), snapping in over
   * `rise` seconds and easing back over `time`, just before the hand goes up.
   */
  flinch: { lean: 0.32, rise: 0.05, time: 0.4 },
  /**
   * "HIT!" sign above a player calling their hit. Past `stableFrom` metres it grows with distance (FA8), so it stays the
   * size it is there on screen (about 45 px tall at 1080p with the default field of view) across the longest sight line,
   * its bottom edge kept where it was.
   */
  callout: { height: 2.25, width: 0.62, aspect: 0.45, color: '#ffffff', background: '#d8262e', stableFrom: 6 },
} as const;

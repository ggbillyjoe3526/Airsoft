import { HITS } from './hits';

/** What a figure wears on its head: a cap, a bump helmet with a headset, or just its hair with a sweatband. */
export type Headgear = 'cap' | 'helmet' | 'hair';
/** Over the top: a light chest rig (front panel and pouches) or a plate carrier (front and back plates, a pack). */
export type Vest = 'rig' | 'carrier';

/** One figure's looks: casual clothes, the vest and headgear over them, its skin, and a mesh mask or a bare face. */
export interface FigureLook {
  readonly top: number;
  readonly trousers: number;
  readonly vest: Vest;
  readonly vestColor: number;
  readonly pouches: number;
  readonly headgear: Headgear;
  /** The cap, helmet or hair colour. */
  readonly hat: number;
  /** A mesh lower-face mask in this colour, or null: goggles only, the face shows. */
  readonly mask: number | null;
  readonly skin: number;
  /** A hoodie: its hood lies behind the neck on the detailed figure (QualitySettings.figureDetail, FA8). */
  readonly hood: boolean;
}

/**
 * The six looks (M14 rework): a weekend game at a site, not a military unit. Hoodies, tees, jeans and work trousers in
 * greys, sand, cream and greens, with a mix of rigs and carriers, caps, helmets and bare heads; most faces show
 * (goggles only), two wear a mesh mask in a light or matching colour. Figure `id` wears look `id % 6`, so every player
 * in a 3 v 3 looks different. None of these reads as a team colour (characterModels.test.ts).
 */
const LOOKS: readonly FigureLook[] = [
  { top: 0x4d5157, trousers: 0x4b5263, vest: 'rig', vestColor: 0x2f3134, pouches: 0x3b3e42, headgear: 'cap', hat: 0x2a2b2d, mask: null, skin: 0xe3b796, hood: true }, // charcoal hoodie, jeans
  { top: 0xbcad8e, trousers: 0x5e584c, vest: 'carrier', vestColor: 0x958c6a, pouches: 0x7d7660, headgear: 'helmet', hat: 0xa08c68, mask: 0xb3a689, skin: 0xc68e68, hood: false }, // sand tee, brown work trousers
  { top: 0x587a50, trousers: 0x8f8466, vest: 'rig', vestColor: 0x63674e, pouches: 0x55593f, headgear: 'hair', hat: 0x2a2622, mask: null, skin: 0x8a5a3c, hood: true }, // green hoodie, khakis
  { top: 0x9fa0a3, trousers: 0x35373b, vest: 'carrier', vestColor: 0x6c6e52, pouches: 0x5f6148, headgear: 'cap', hat: 0x5b5e4a, mask: null, skin: 0xf0c9a8, hood: false }, // grey tee, black trousers
  { top: 0xd2c8b0, trousers: 0x515a6b, vest: 'rig', vestColor: 0x958c6a, pouches: 0x7d7660, headgear: 'helmet', hat: 0x2c2d2f, mask: 0x8d8f92, skin: 0xd9a47e, hood: true }, // cream hoodie, jeans
  { top: 0x7a7d62, trousers: 0x6a6d70, vest: 'carrier', vestColor: 0x34363a, pouches: 0x44474b, headgear: 'hair', hat: 0x4a4038, mask: null, skin: 0xb57a52, hood: false }, // olive tee, grey trousers
];

/**
 * Third-person look of players and bots: chunky stylised players at a weekend game (M14, reworked): casual clothes
 * under a chest rig or a plate carrier, full-seal goggles (a mesh mask on some), a cap, a bump helmet with a headset or
 * bare hair, knee and elbow pads, gloves, and the team colour as tape: a broad band round the torso (about a quarter
 * of a metre tall, under the arms, so it reads across the map), armbands, a band on the headgear and on each thigh.
 * Colours are flat vertex colours on one material per figure, so each figure costs a handful of draw calls.
 */
export const FIGURE = {
  colors: {
    skin: 0xd9a47e,
    boots: 0x3a332b,
    gloves: 0x2f302c,
    pads: 0x3b3d36,
    goggles: 0x1c1f24,
    lens: 0xa8dcf0,
    headset: 0x26282a,
    replica: 0x26282c,
    furniture: 0xb49a70,
    /** A weapon torch's lens on a figure's replica (M33h): pale glass; its glow is the torch beams' glare. */
    torchLens: 0xdde6ee,
  },
  looks: LOOKS,
  /** The team tape round the torso: height (metres) and its centre above the torso's bottom. */
  teamBand: { height: 0.26, centre: 0.17 },
  /** The figures' one material: matte fabric and plastic. */
  roughness: 0.82,
  /** Body layout (metres, feet at y = 0, facing -Z). Head height and crouch come from the hit volume so they always match. */
  hipHeight: HITS.lean.pivotHeight,
  /** Limb radii (metres): thigh at the hip and at the knee, shin at the calf; upper arm, forearm. */
  legRadius: 0.085,
  kneeRadius: 0.068,
  shinRadius: 0.064,
  hipSpread: 0.1,
  torso: { width: 0.4, height: 0.56, depth: 0.24, bottom: HITS.lean.pivotHeight },
  shoulderHeight: 1.43,
  shoulderSpread: 0.22,
  armRadius: 0.055,
  forearmRadius: 0.047,
  /** Mesh detail: segments round each limb and sphere (a figure stays a few thousand triangles). */
  radialSegments: 8,
  /**
   * Player detail (QualitySettings.figureDetail, FA8; audit section 5 "Third-person figures and kit"). `low` is the figure
   * as it was (Low's cost). `high` rounds the limbs and head further, shapes the head (jaw, ears), gives the goggles a
   * framed band with a glossy lens, the gloves a thumb and knuckle pad, the kit lids, soles, cuffs, a hood and a
   * hydration tube, darkens the torso's lower third and the hem (a baked "ambient occlusion") and lightens every bevel
   * (the CS edge highlight). Segments: limbs, spheres, and the head's [sides, rings]; `wrap`: an arc's and a full ring's.
   */
  detail: {
    low: { radialSegments: 8, sphereSegments: 10, head: [10, 6], wrap: [10, 14], overhaul: false },
    high: { radialSegments: 10, sphereSegments: 12, head: [14, 10], wrap: [16, 20], overhaul: true },
  },
  /**
   * The detailed figure's finishes (FA8, render/figureFinish.ts): [roughness, metalness] per vertex on the figure's one
   * material. Fabric stays matte; the goggle lens and helmet shells are moulded and glossy; the replica is toy polymer
   * with a painted-steel barrel. Shapes on top: bevels this much lighter (`edgeLight`), the torso's lower third and hem
   * down to `hemShade` of its colour, cuffs and soles `cuffShade` and `soleShade` of theirs, lids `lidLight` lighter.
   */
  finish: {
    fabric: [0.82, 0],
    skin: [0.6, 0],
    lens: [0.08, 0.25],
    shell: [0.38, 0.08],
    polymer: [0.5, 0],
    steel: [0.4, 0.65],
    rubber: [0.92, 0],
  },
  edgeLight: 1.1,
  hemShade: 0.8,
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
  headHeight: HITS.headHeight,
  /** Crouched, the upper body drops this far and the legs fold to fit. */
  crouchDrop: HITS.crouchDrop,
  /** Walk cycle: leg swing (radians) and strides per metre walked. */
  legSwing: 0.55,
  stridesPerMetre: 0.75,
  /** Legs swing only above this speed (m/s); a jump bigger than `maxStride` (m) in one frame is a teleport, not a step. */
  walkingSpeed: 0.2,
  maxStride: 1,
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

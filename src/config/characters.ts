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
}

/**
 * The six looks (M14 rework): a weekend game at a site, not a military unit. Hoodies, tees, jeans and work trousers in
 * greys, sand, cream and greens, with a mix of rigs and carriers, caps, helmets and bare heads; most faces show
 * (goggles only), two wear a mesh mask in a light or matching colour. Figure `id` wears look `id % 6`, so every player
 * in a 3 v 3 looks different. None of these reads as a team colour (characterModels.test.ts).
 */
const LOOKS: readonly FigureLook[] = [
  { top: 0x4d5157, trousers: 0x4b5263, vest: 'rig', vestColor: 0x2f3134, pouches: 0x3b3e42, headgear: 'cap', hat: 0x2a2b2d, mask: null, skin: 0xe3b796 }, // charcoal hoodie, jeans
  { top: 0xbcad8e, trousers: 0x5e584c, vest: 'carrier', vestColor: 0x958c6a, pouches: 0x7d7660, headgear: 'helmet', hat: 0xa08c68, mask: 0xb3a689, skin: 0xc68e68 }, // sand tee, brown work trousers
  { top: 0x587a50, trousers: 0x8f8466, vest: 'rig', vestColor: 0x63674e, pouches: 0x55593f, headgear: 'hair', hat: 0x2a2622, mask: null, skin: 0x8a5a3c }, // green hoodie, khakis
  { top: 0x9fa0a3, trousers: 0x35373b, vest: 'carrier', vestColor: 0x6c6e52, pouches: 0x5f6148, headgear: 'cap', hat: 0x5b5e4a, mask: null, skin: 0xf0c9a8 }, // grey tee, black trousers
  { top: 0xd2c8b0, trousers: 0x515a6b, vest: 'rig', vestColor: 0x958c6a, pouches: 0x7d7660, headgear: 'helmet', hat: 0x2c2d2f, mask: 0x8d8f92, skin: 0xd9a47e }, // cream hoodie, jeans
  { top: 0x7a7d62, trousers: 0x6a6d70, vest: 'carrier', vestColor: 0x34363a, pouches: 0x44474b, headgear: 'hair', hat: 0x4a4038, mask: null, skin: 0xb57a52 }, // olive tee, grey trousers
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
   * Where the rifle sits in the aiming pose, relative to the shoulder-line pivot (metres; x right, y up,
   * z forward is negative): its butt, and its length to the muzzle. BBs from other players are drawn
   * leaving this muzzle.
   */
  rifle: { x: 0.06, y: -0.06, butt: 0.12, length: 0.98 },
  /** The same for the pistol, held out in both hands (figures draw it when the pistol is the active replica). */
  pistol: { x: 0.03, y: -0.05, butt: -0.42, length: 0.2 },
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
  /** "HIT!" sign above a player calling their hit. */
  callout: { height: 2.25, width: 0.62, aspect: 0.45, color: '#ffffff', background: '#d8262e' },
} as const;

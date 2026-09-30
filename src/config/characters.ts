import { HITS } from './hits';

/**
 * Third-person look of players and bots: greybox figures in airsoft kit. Colours are flat vertex
 * colours on one material per figure, so each figure costs a handful of draw calls.
 */
export const FIGURE = {
  colors: {
    skin: 0xd9a47e,
    trousers: 0x5b5f4a,
    jacket: 0x7d7a6a,
    boots: 0x2d2a26,
    cap: 0x3f4136,
    goggles: 0x1c1f24,
    lens: 0x9fb8c8,
    replica: 0x26282c,
    furniture: 0xb49a70,
  },
  /** Body layout (metres, feet at y = 0, facing -Z). Head height and crouch come from the hit volume so they always match. */
  hipHeight: 0.92,
  legRadius: 0.075,
  hipSpread: 0.1,
  torso: { width: 0.4, height: 0.56, depth: 0.24, bottom: 0.92 },
  shoulderHeight: 1.43,
  shoulderSpread: 0.22,
  armRadius: 0.055,
  /**
   * Where the rifle sits in the aiming pose, relative to the shoulder-line pivot (metres; x right, y up,
   * z forward is negative): its butt, and its length to the muzzle. BBs from other players are drawn
   * leaving this muzzle.
   */
  rifle: { x: 0.06, y: -0.06, butt: 0.12, length: 0.98 },
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

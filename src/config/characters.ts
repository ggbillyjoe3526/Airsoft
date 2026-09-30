/**
 * Third-person look of players and bots: greybox figures in airsoft kit. Colours are flat vertex
 * colours on one shared material, so each figure costs a handful of draw calls.
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
  /** Body layout (metres, feet at y = 0, facing -Z). The head top is near HITS.standingTop. */
  hipHeight: 0.92,
  legRadius: 0.075,
  hipSpread: 0.1,
  torso: { width: 0.4, height: 0.56, depth: 0.24, bottom: 0.92 },
  shoulderHeight: 1.43,
  shoulderSpread: 0.22,
  armRadius: 0.055,
  headRadius: 0.11,
  headHeight: 1.62,
  /** Crouched, the upper body drops this far and the legs fold to fit (keeps the head under 1.15 m). */
  crouchDrop: 0.62,
  /** Walk cycle: leg swing (radians) and strides per metre walked. */
  legSwing: 0.55,
  stridesPerMetre: 0.75,
  /** "HIT!" sign above a player calling their hit. */
  callout: { height: 2.25, width: 0.62, aspect: 0.45, color: '#ffffff', background: '#d8262e' },
} as const;

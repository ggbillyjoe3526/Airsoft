/**
 * The single input interface for every character. The local player and the bots both drive the
 * simulation exclusively through one PlayerCommand per tick.
 */
export interface PlayerCommand {
  /** -1..1, forward is positive. Relative to `yaw`. */
  forward: number;
  /** -1..1, right is positive. Relative to `yaw`. */
  right: number;
  /**
   * Absolute view yaw in radians. Yaw 0 looks down -Z; positive yaw turns left (counter-clockwise
   * seen from above), matching a Three.js camera with Euler order 'YXZ'.
   */
  yaw: number;
  /** Absolute view pitch in radians, positive looks up. */
  pitch: number;
  sprint: boolean;
  /** Walk key held: slow and quiet. Overrides sprint. */
  walk: boolean;
  crouch: boolean;
  /** Lean (held): -1 left, 1 right, 0 upright. */
  lean: number;
  jump: boolean;
  /** Aim down sights (held): through the optic fitted to the replica in hand, or its iron sights (sim/aiming.ts). */
  aim: boolean;
  /** Trigger held. Semi-auto replicas fire on the press only. */
  fire: boolean;
  reload: boolean;
  /**
   * Loadout slot to switch to, or -1 for no switch. With the replica holstered, any slot (the one put away too) draws
   * it, the slower draw from the holster (sim/armament.ts).
   */
  switchTo: number;
  /**
   * Put the replica in hand away (one-shot; M92, the holster): nothing to fire or aim, a faster run (never past the
   * sprint), and a slower draw (sim/armament.ts, sim/movement.ts). A slot in `switchTo`, or a fresh trigger pull, aim or reload, draws it.
   */
  holster: boolean;
  /** Step the active replica's fire selector to its next mode (one-shot). */
  cycleFireMode: boolean;
  /**
   * Notches to turn the hop-up dial of the replica in hand this tick (one-shot; Dev 6 playtest item 15): positive for
   * more lift, negative for less, each notch HOP_UP.dialStep (sim/armament.ts). Bots leave it at 0.
   */
  hopUpSteps: number;
  /** Switch the weapon torch on the replica in hand on or off (one-shot; M33h, sim/torch.ts). */
  toggleTorch: boolean;
  /** Use key held (M44): opens the case beside you in Extraction. */
  use: boolean;
  /**
   * Toss a spare magazine to the teammate with this character id (one-shot; MG1, sim/magShare.ts), or -1 for none.
   * The simulation tosses only what its rules allow (canTossTo).
   */
  tossMag: number;
}

export function createCommand(): PlayerCommand {
  return {
    forward: 0,
    right: 0,
    yaw: 0,
    pitch: 0,
    sprint: false,
    walk: false,
    crouch: false,
    lean: 0,
    jump: false,
    aim: false,
    fire: false,
    reload: false,
    switchTo: -1,
    holster: false,
    cycleFireMode: false,
    hopUpSteps: 0,
    toggleTorch: false,
    use: false,
    tossMag: -1,
  };
}

/**
 * The single input interface for every character. The local player, bots and (later) remote
 * players all drive the simulation exclusively through one PlayerCommand per tick.
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
  jump: boolean;
  /** Trigger held. Semi-auto replicas fire on the press only. */
  fire: boolean;
  reload: boolean;
  /** Loadout slot to switch to, or -1 for no switch. */
  switchTo: number;
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
    jump: false,
    fire: false,
    reload: false,
    switchTo: -1,
  };
}

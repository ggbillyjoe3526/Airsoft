/** Rapier character controller tuning. Units: metres, radians. */
export const PHYSICS = {
  /** Skin gap the controller keeps from surfaces. */
  controllerOffset: 0.02,
  /** Rapier autostep settings. With our capsule it reliably clears only ~0.15 m (see maxWalkableLedge). */
  autostepHeight: 0.35,
  autostepMinWidth: 0.15,
  snapToGround: 0.3,
  maxSlopeClimb: (45 * Math.PI) / 180,
  /**
   * Tallest ledge a player reliably walks onto without jumping (measured: 0.15 m clean, 0.2–0.25 m
   * sticky, 0.3 m blocked). Maps must avoid ledges between this and the jump height.
   */
  maxWalkableLedge: 0.15,
} as const;

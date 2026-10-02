/** Rapier character controller tuning. Units: metres, radians. */
export const PHYSICS = {
  /** Skin gap the controller keeps from surfaces. */
  controllerOffset: 0.02,
  /**
   * Rapier autostep settings. With our capsule it reliably clears only ~0.15 m (see maxWalkableLedge).
   * Rapier's snap-to-ground is deliberately not used: it lifts the capsule ~3.5 cm where a floor's
   * triangles meet. The sim keeps characters on the floor with PhysicsWorld.probeGround instead.
   */
  autostepHeight: 0.35,
  autostepMinWidth: 0.15,
  maxSlopeClimb: (45 * Math.PI) / 180,
  /**
   * Ground probe: a sphere this much narrower than the capsule (so nearby walls never register as
   * ground), cast down from `groundProbeLift` above the feet. Starting above the feet lets it also
   * lift a character that has crept a hair into the floor.
   */
  groundProbeInset: 0.06,
  groundProbeLift: 0.1,
  /**
   * Standing characters rest this far above the ground: a little more than the controller skin, so
   * horizontal moves never graze the floor (grazing gives tilted contact normals that sap speed).
   * A character's `position` (capsule bottom) is therefore this far above the floor, and so are eye
   * heights measured from it; anything drawn or hit-tested at the feet must subtract it.
   */
  groundRestGap: 0.04,
  /**
   * Tallest ledge a player walks onto in every stance and direction (measured: 0.15 m always; 0.2–0.3 m
   * depends on speed, stance and angle). Maps must avoid ledges between this and uncrossable cover height
   * (checked for Depot in depot.test.ts).
   */
  maxWalkableLedge: 0.15,
  /**
   * Steepest ramp a map may use, as rise per metre of run: 1:2 (26.6°). Every pace, sprinting down
   * included, holds the ground on it; sprinting down 30° outruns the ground probe for ~0.3 s. At this
   * slope a 0.2 m nav cell rises 0.1 m, under maxWalkableLedge. Checked for every map in mapData.test.ts.
   */
  maxRampSlope: 0.5,
} as const;

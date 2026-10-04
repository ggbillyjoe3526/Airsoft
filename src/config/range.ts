/**
 * The practice range (M21): a walled concrete range with three lanes of targets at marked distances, opened from the
 * title screen. First guesses, to tune in play. The range's blocks are built from these numbers (map/range.ts); the
 * targets are simulated (sim/rangeTargets.ts) and drawn (render/rangeTargetsRenderer.ts) from them too.
 */

export type RangeTargetKind = 'steel' | 'figure';

export interface RangeLane {
  kind: RangeTargetKind;
  /** The lane's middle, across the range (m; the firing line's middle is x = 0). */
  x: number;
  /** Figures only: crouched, as someone behind low cover shows themselves. */
  crouched?: boolean;
  /** For the HUD readout ("Steel 30 m"). */
  label: string;
}

export const RANGE = {
  /**
   * Target distances from the firing line (m). Out past Depot's longest sightlines (about 50 m end to end): a 0.25 g
   * BB with the hop-up set right still carries to 60 m, it just takes a while to get there.
   */
  distances: [10, 20, 30, 40, 50, 60],
  /** Steel plates on the left, standing figures in the middle, crouched figures on the right. */
  lanes: [
    { kind: 'steel', x: -7, label: 'Steel' },
    { kind: 'figure', x: 0, label: 'Figure' },
    { kind: 'figure', x: 7, crouched: true, label: 'Crouched figure' },
  ] as readonly RangeLane[],
  /**
   * Each target in a lane sits this much further right than the one in front of it (m), so from the firing line none
   * hides another.
   */
  stagger: 0.9,
  /** Steel plates: radius (m) and the plate centre's height (chest height, m). The plate faces the firing line. */
  plateRadius: 0.2,
  plateHeight: 1.25,
  /**
   * Each plate hangs from a square post just behind it (m): its width, how far behind the plate it stands and how far
   * above the plate's top the hanger is. BBs stop on the post (a miss) as on a wall.
   */
  postWidth: 0.05,
  postBehind: 0.06,
  postAbovePlate: 0.1,
  /** A figure that's hit goes down and stands up again after this long (s). */
  figureDownTime: 1.5,
  /** Range size (m): half the width, the backstop's distance and height, the walls' height, the space behind the line. */
  halfWidth: 11,
  backstop: 66,
  backstopHeight: 5,
  wallHeight: 3,
  behindLine: 6,
  /** Where you stand when the range opens: this far behind the line's middle, facing downrange. */
  spawnBack: 2,
} as const;

/** Every target's lane and distance, in the order the range lists them (lane by lane, near to far). */
export function rangeLayout(): { lane: RangeLane; distance: number; x: number }[] {
  const out: { lane: RangeLane; distance: number; x: number }[] = [];
  for (const lane of RANGE.lanes) {
    RANGE.distances.forEach((distance, i) => {
      out.push({ lane, distance, x: lane.x + (i - (RANGE.distances.length - 1) / 2) * RANGE.stagger });
    });
  }
  return out;
}

/** How the range's targets and markers look (render/rangeTargetsRenderer.ts). */
export const RANGE_VISUALS = {
  /** Steel plates are painted (white, as at most ranges) so they read at 60 m. */
  steelColor: 0xe6e1d3,
  steelMetalness: 0.15,
  steelRoughness: 0.55,
  plateThickness: 0.025,
  plateSegments: 24,
  postColor: 0x4b5157,
  /** A plate that's hit swings back on its hanger and settles: angle (rad), wobble (rad/s), settling (1/s). */
  swingAngle: 0.35,
  swingRate: 16,
  swingDamping: 5,
  /** Plywood figures: colour, thickness, and the width of the body and of the head's disc (m). */
  figureColor: 0xb89466,
  figureRoughness: 0.9,
  figureThickness: 0.03,
  figureWidth: 0.42,
  /** A figure that's hit falls back over this long, and comes back up over this long at the end of its time down (s). */
  fallTime: 0.18,
  riseTime: 0.3,
  /** How far it lies back when down (rad; a little short of flat, as on a hinged stand). */
  downAngle: 1.45,
  /** Painted lines across the floor at each distance, and the boards on both walls saying how far. */
  lineColor: 0xe8e4d8,
  lineDepth: 0.12,
  lineLift: 0.004,
  signWidth: 1.2,
  signHeight: 0.6,
  signLift: 1.6,
  /** Each board is turned this far from the wall towards the firing line (rad), so it reads from there. */
  signTurn: 0.35,
  signColor: '#e8e4d8',
  signText: '#22262a',
} as const;

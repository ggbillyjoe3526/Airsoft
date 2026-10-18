/**
 * The practice range (M21): a walled concrete range with three lanes of targets at marked distances, opened from the
 * title screen. First guesses, to tune in play. The range's blocks are built from these numbers (map/range.ts); the
 * targets are simulated (sim/rangeTargets.ts) and drawn (render/match/rangeTargetsRenderer.ts) from them too. M93 added the
 * moving targets, the new target types and the timed challenge.
 */

/** What a target is made of: a steel plate rings when hit, a plywood figure falls back on its hinge. */
export type RangeTargetKind = 'steel' | 'figure';

/**
 * How a target moves (M93): it stands still; a pop-up figure lies flat, stands up for a few seconds and drops again (hit
 * it while it is up); a mover is a figure on a trolley running to and fro along a track across its face; a swinger is a
 * plate on a pendulum arm, swinging side to side.
 */
export type RangeTargetMotion = 'still' | 'popup' | 'mover' | 'swinger';

export interface RangeLane {
  kind: RangeTargetKind;
  /** The lane's middle, across the range (m; the firing line's middle is x = 0). */
  x: number;
  /** Figures only: crouched, as someone behind low cover shows themselves. */
  crouched?: boolean;
  /** For the HUD readout ("Steel 30 m"). */
  label: string;
}

/**
 * One target, wherever it stands (M93): the range lays its own out (rangeLayout); another place can hand its own list to
 * sim/rangeTargets.ts createRangeTargets. Every target faces along its `yaw`; the parts below are in its own frame.
 */
export interface RangeTargetSpec {
  kind: RangeTargetKind;
  motion: RangeTargetMotion;
  /**
   * Steel: the plate's centre, RANGE.plateHeight over its floor (the START plate's RANGE.start.height; a swinger's at the
   * bottom of its swing, under its pivot). Figures: where the feet are (a mover's on its trolley, in the middle of its
   * track).
   */
  x: number;
  y: number;
  z: number;
  /** Which way it faces (rad about +y; 0 faces +z, the range's firing line). */
  yaw: number;
  /** Steel: the plate's radius (m). */
  radius: number;
  /** Figures: crouched (the hit volume's crouched shape). */
  crouched: boolean;
  /** Movers: half the track's length (m) and the trolley's speed (m/s). */
  track: number;
  speed: number;
  /** Movers and swingers: how far into its cycle it starts (s), so two of a kind don't move in step. */
  phase: number;
  /** For the readout: "Steel", "Mover" … */
  label: string;
  /** Its marked distance (m), for the readout. */
  distance: number;
  /** The timed challenge's START plate (M93): standing only while the challenge is on, never lit, never a score. */
  start: boolean;
}

/** A spec from the fields that matter for it: a still target facing +z, unless said otherwise. */
export function targetSpec(s: Pick<RangeTargetSpec, 'kind' | 'x' | 'y' | 'z' | 'label' | 'distance'> & Partial<RangeTargetSpec>): RangeTargetSpec {
  return { motion: 'still', yaw: 0, radius: s.kind === 'steel' ? RANGE.plateRadius : 0, crouched: false, track: 0, speed: 0, phase: 0, start: false, ...s };
}

/** One of the range's other targets (M93), placed by hand where no lane target is behind it or in front of it. */
interface RangeFeature {
  kind: RangeTargetKind;
  motion: RangeTargetMotion;
  x: number;
  z: number;
  label: string;
  small?: boolean;
  crouched?: boolean;
  track?: number;
  speed?: number;
  phase?: number;
}

export const RANGE = {
  /**
   * Target distances from the firing line (m). Out past Depot's longest sightlines (about 50 m end to end), so the far
   * plates need holdover: a level 0.25 g rifle shot on its best hop-up stays on target to about 39 m and lands at about
   * 53 m (1.3 s); a 60 m plate takes aiming about 3° high, some 3.5 m over it (1.7 s of flight), or more hop-up
   * (audit SIM-16, measured with M30's flight; map/range.test.ts checks it).
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
  /** A figure that's hit goes down and stands up again after this long (s), the last `riseTime` of it rising. */
  figureDownTime: 1.5,
  riseTime: 0.3,
  /** Small steel (M93): plates of this radius (m), a quarter of a big plate's face, about a head's size. */
  smallPlateRadius: 0.1,
  /**
   * Pop-ups (M93), in free practice: each stands for `up` seconds (a random time between the two) and lies down for
   * `down` (rising at its end), or until it's hit. In the timed challenge they stand only when lit.
   */
  popup: { up: [2.5, 4.5], down: [2, 5] },
  /**
   * Movers (M93): the figure's feet ride a trolley `trolleyHeight` up (m), which waits `dwell` seconds at each end of
   * its track. A mover that's hit falls back on its trolley, which keeps running.
   */
  mover: { trolleyHeight: 0.12, dwell: 0.6 },
  /**
   * Swingers (M93): a plate on an arm `arm` long (m) from a pivot over it, swinging `amplitude` either side of straight
   * down (rad), once there and back every `period` seconds. Its frame's legs stand `frameClearance` (m) outside the
   * plate's widest swing, each `frameWidth` thick (m); BBs stop on them as on a plate's post.
   */
  swinger: { arm: 1, amplitude: Math.PI / 4, period: 2.4, frameClearance: 0.15, frameWidth: 0.06 },
  /**
   * The range's other targets (M93), set by hand in the gaps the lanes leave as seen from where you start, so that,
   * moving or not, none hides another (sim/rangeTargets.test.ts checks it): a walking mover on the left, near, and a
   * jogging one further out on the right; a swinger left of the middle; small steel and pop-ups on the right and at
   * both sides close in. Swingers' `x` is the pivot's; movers' is the middle of the track.
   */
  features: [
    { kind: 'figure', motion: 'mover', x: -7.8, z: -12, track: 1.6, speed: 1.4, phase: 0, label: 'Mover' },
    { kind: 'figure', motion: 'mover', x: 3.9, z: -40, track: 1.6, speed: 1.8, phase: 1.3, label: 'Mover' },
    { kind: 'steel', motion: 'swinger', x: -6.75, z: -20, label: 'Swinger' },
    { kind: 'steel', motion: 'still', small: true, x: 7.4, z: -15, label: 'Small steel' },
    { kind: 'steel', motion: 'still', small: true, x: 8.2, z: -15, label: 'Small steel' },
    { kind: 'steel', motion: 'still', small: true, x: 9, z: -15, label: 'Small steel' },
    { kind: 'steel', motion: 'still', small: true, x: 9.8, z: -15, label: 'Small steel' },
    { kind: 'figure', motion: 'popup', x: -7.6, z: -6, label: 'Pop-up' },
    { kind: 'figure', motion: 'popup', x: 7, z: -6, label: 'Pop-up' },
    { kind: 'figure', motion: 'popup', x: 4.94, z: -15, label: 'Pop-up' },
    { kind: 'figure', motion: 'popup', x: 9.56, z: -25, crouched: true, label: 'Crouched pop-up' },
  ] as readonly RangeFeature[],
  /**
   * The timed challenge's START plate (M93): low in the middle, a few metres past the line, below every sightline from
   * where you start, a big plate's size.
   */
  start: { x: 0, z: -5, height: 0.7 },
  /** Range size (m): half the width, the backstop's distance and height, the walls' height, the space behind the line. */
  halfWidth: 11,
  backstop: 66,
  backstopHeight: 5,
  wallHeight: 3,
  behindLine: 6,
  /** Where you stand when the range opens: this far behind the line's middle, facing downrange. */
  spawnBack: 2,
} as const;

/**
 * Every target on the range, as specs: the lanes first (lane by lane, near to far, as before M93, so their ids stay),
 * then the other targets (M93), then the START plate. All face the firing line.
 */
export function rangeLayout(): RangeTargetSpec[] {
  const out: RangeTargetSpec[] = [];
  for (const lane of RANGE.lanes) {
    RANGE.distances.forEach((distance, i) => {
      const x = lane.x + (i - (RANGE.distances.length - 1) / 2) * RANGE.stagger;
      out.push(targetSpec({ kind: lane.kind, x, y: lane.kind === 'steel' ? RANGE.plateHeight : 0, z: -distance, crouched: lane.crouched === true, label: lane.label, distance }));
    });
  }
  for (const f of RANGE.features) {
    const y = f.kind === 'steel' ? RANGE.plateHeight : f.motion === 'mover' ? RANGE.mover.trolleyHeight : 0;
    const radius = f.kind === 'steel' ? (f.small ? RANGE.smallPlateRadius : RANGE.plateRadius) : 0;
    out.push(targetSpec({ kind: f.kind, motion: f.motion, x: f.x, y, z: f.z, radius, crouched: f.crouched === true, track: f.track ?? 0, speed: f.speed ?? 0, phase: f.phase ?? 0, label: f.label, distance: -f.z }));
  }
  const s = RANGE.start;
  out.push(targetSpec({ kind: 'steel', x: s.x, y: s.height, z: s.z, label: 'START', distance: -s.z, start: true }));
  return out;
}

/** How the range's targets and markers look (render/match/rangeTargetsRenderer.ts). */
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
  riseTime: RANGE.riseTime,
  /** How far it lies back when down (rad; a little short of flat, as on a hinged stand). */
  downAngle: 1.45,
  /**
   * The timed challenge's lit targets (M93): painted in this colour and glowing a little (emissive, `litGlow`), so a lit
   * plate or figure stands out from the rest at any distance (a little matte, `litRoughness`).
   */
  litColour: 0xff7a1a,
  litGlow: 0.6,
  litRoughness: 0.6,
  /**
   * Moving targets' gear (M93), in the posts' grey: a mover's two rails (`gauge` apart, each `rail` wide and high, with a
   * stop block at each end) and its trolley; a pop-up's motor box beside its hinge (`gap` from the figure); a swinger's
   * arm (`arm` thick; its frame is as thick as RANGE.swinger says).
   */
  gear: {
    rail: 0.04,
    gauge: 0.3,
    stop: { width: 0.08, height: 0.1 },
    trolley: { width: 0.5, depth: 0.42 },
    popupBox: { width: 0.2, height: 0.16, depth: 0.24, gap: 0.03 },
    arm: 0.035,
  },
  /** How long the timed challenge's "Go!" and "Time!" stay over the middle of the screen (s; ui/rangeReadout.ts). */
  banner: { go: 0.8, time: 2.2 },
  /**
   * The START plate: safety orange with the word on it in white, so it reads from the line. Its painted face covers
   * `inset` of the plate's radius and stands `lift` (m) proud of it; the word's height and drop are fractions of the
   * texture.
   */
  start: { paint: '#f07a22', ink: '#ffffff', textureSize: 128, roughness: 0.6, inset: 0.97, lift: 0.002, font: 0.26, drop: 0.02 },
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
  /**
   * Detail with QualitySettings.mapDetail (audit section 5, "Range targets"): white paint with grey BB scuffs near the
   * plate's middle (`scuffs` of them, `scuffRadius` px on a `textureSize` canvas, rougher than the paint), the plate on
   * two short chains of `links` links from an arm off the post, a painted plywood figure (outline, head ring and centre
   * circle in `zoneInk`) on two hinge brackets, a safety-orange band on each steel post (the range has no teams, so the
   * one place orange is fine) and a shelf of BB bottles by the firing line.
   */
  detail: {
    textureSize: 256,
    scuffs: [24, 40],
    scuffRadius: [3, 9],
    scuffSpread: 0.45,
    scuffRoughness: 0.85,
    paintRoughness: 0.5,
    links: 3,
    linkRadius: 0.014,
    linkTube: 0.0035,
    chainSpread: 0.07,
    armDepth: 0.03,
    zoneInk: '#5a3f22',
    plywood: '#c4a072',
    hinge: { width: 0.06, height: 0.05, depth: 0.04, inset: 0.08 },
    metal: 0x8c939a,
    band: { colour: 0xf07a22, height: 0.12, at: 1.55 },
    shelf: { x: 9.6, z: 1.6, width: 0.9, depth: 0.4, height: 0.9, top: 0.04, colour: 0x6f7a6a },
    bottles: { count: 3, radius: 0.035, height: 0.18, colour: 0xf4f2ea, capColour: 0x3c4247 },
  },
} as const;

/**
 * The timed challenge (M93, the owner's playtest note 10), off by default (a toggle on the practice pause menu). Shoot the
 * START plate, wait out the countdown, then hit as many lit targets as you can before time runs out; the best score is
 * kept. Lit targets come `litAtOnce` at a time, chosen at random among those standing; each stays lit for `litTime` plus
 * `litPerMetre` for every metre of its distance (the BB's flight to a far one: from the line on the range, from where
 * you stand as it lights on a map, KI1), then goes out (a miss) and another lights. First guesses, to tune in play.
 */
export const RANGE_CHALLENGE = {
  /** Seconds of the run, and of the countdown before it. */
  runTime: 60,
  countdown: 3,
  litAtOnce: 2,
  litTime: 3,
  litPerMetre: 0.04,
  /** A target that was just hit or went out waits this long (s) before it can light again. */
  rest: 1,
  /**
   * In Practice on a map, where only targets in your sight light (M94): with none in sight, the run looks again this
   * often (s) rather than every tick, a ray per target each look.
   */
  lookAgain: 0.25,
  /** Where a best score is kept (stats/records.ts): the range's own; another place would keep its own. */
  course: 'range',
} as const;

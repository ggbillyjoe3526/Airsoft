import { HITS } from './hits';
import { MOVEMENT } from './movement';

/**
 * The rigged bot figures made in Blender (BF1, tools/blender/bot-figure/): the human and the robot,
 * `src/assets/models/characters/human.glb` and `robot.glb`, each with the export's sidecar (`human.json`, `robot.json`:
 * its clips, where the replicas sit in the fist and where the magazines go in the reloads). They are drawn only with the
 * Dev tab's "Disable figure models" and "Disable all models" both off (RM4, config/dev.ts); otherwise, as on a fresh
 * save, the built-in figures are. Players and bots wear them alike, and the player's own is their first-person body.
 */

/** The figure kinds, each a file pair under `src/assets/models/characters/`. */
export const FIGURE_RIG_KINDS = ['human', 'robot'] as const;
export type FigureRigKind = (typeof FIGURE_RIG_KINDS)[number];

const DEG = Math.PI / 180;

export const FIGURE_RIG = {
  /** Turn applied to the model about +Y (radians): the files face glTF's +Z, the figures face -Z. */
  yaw: Math.PI,
  /** Materials whose name starts with this (any case) are painted in each figure's team colour (Team, TeamPaint, TeamGlow). */
  teamMaterialPrefix: 'team',
  /** Above this many bytes a file is warned about. They are fetched only with both switches off, never on a fresh save. */
  warnBytes: 5_000_000,
  /**
   * The bones the legs' clips drive. Everything else is the upper body, which the aim, reload, switch and fire clips
   * (`upperBodyOnly` in the sidecar, authored over a still pelvis) take over from the legs' clip.
   */
  lowerBones: ['Root', 'Hips', 'Thigh_L', 'Shin_L', 'Foot_L', 'Toe_L', 'Thigh_R', 'Shin_R', 'Foot_R', 'Toe_R'] as readonly string[],
  /** The bones the drawing reads or moves itself. */
  bones: { hips: 'Hips', spine: 'Spine', grip: 'Grip_R', hand: 'Hand_L', arms: ['UpperArm_L', 'UpperArm_R'] as readonly string[] },
  /** The parts in the files, by role (each has `_LOD1` and `_LOD2` copies, except where the file lacks one). */
  parts: {
    human: { body: ['Body', 'Kit'], head: ['Head_HighCut'], pack: 'Kit_Pack', radio: 'Kit_Radio' },
    robot: { body: ['Body', 'Body_Neck'], head: ['Head_Optic', 'Head_Sensor'] },
  },
  /** The pitch the AimUp and AimDown clips are posed at (bot11.py clip_aim: ±60 degrees); the aim blends between them. */
  aimPitch: 60 * DEG,
  /**
   * The share of that pitch the aim clips turn the replica through (bot11.py clip_aim: the hands at `pitch * 0.55`, the
   * spine and head the rest of the way). The aim blends by the replica's pitch, so it points where the shot goes; past
   * the clips' reach the upper body leans the rest.
   */
  aimReach: 0.55,
  /** The Switch clip goes from the rifle to the pistol and holds the pistol from this share of it on (the sidecar's note). */
  switchPistolFrom: 0.35,
  /**
   * Distances (metres) beyond which a figure draws its LOD1 and LOD2 meshes, on Player detail High and Low. Within
   * `fullReplica` it holds the replica's whole model, beyond it the file's small figure version (but the whole model
   * while it reloads, so the magazine comes out).
   */
  lod: { high: [12, 28], low: [6, 16] } as Readonly<Record<'high' | 'low', readonly [number, number]>>,
  fullReplica: { high: 12, low: 6 } as Readonly<Record<'high' | 'low', number>>,
  /** Below this horizontal speed (m/s) a figure stands; the legs' hit volumes swing only above it too. */
  stillBelow: HITS.legs.walkingSpeed,
  /** The paces the walk blends into the run between (m/s): the movement's own. */
  walkSpeed: MOVEMENT.walkSpeed,
  runSpeed: MOVEMENT.runSpeed,
  /**
   * How fast the blends settle (seconds to about two thirds of the way): between standing and moving, the direction of
   * the step, the legs' modes (walk and run, sprint, the hit call, the walk-off), the upper body's (aim, reload,
   * switch), a jump, and the rifle's and the pistol's aim.
   */
  blend: { move: 0.12, direction: 0.1, mode: 0.12, overlay: 0.08, jump: 0.06, hold: 0.06 },
  /** The Jump clip's span (seconds) played over the time in the air: the take-off is skipped, the landing is the clip's. */
  jump: { from: 0.25, to: 0.55 },
  /**
   * A step goes back when its backward part is more than `share` of its speed: the crouched walk (made walking ahead)
   * then runs backwards. With the figures' legs in the hit volume (IM8) the walk cycle itself does, once the crouch is
   * more than `crouched` of the way down (sim/figureLegs.ts).
   */
  backStep: { share: 0.1, crouched: 0.5 },
  /**
   * The first-person body (your own figure seen when you look down): the model drawn this far behind the eyes (metres)
   * so the camera is never inside the chest, with the head and arms left out (the hands and replica in view are the
   * first-person ones). The arms are folded into the shoulders by scaling their bones to `armScale`.
   */
  firstPerson: { back: 0.17, armScale: 1e-3 },
  /** Thrown-away magazines out at most (the oldest goes first); each lies for its sidecar lifetime. */
  thrownMagazines: { max: 12 },
  /**
   * Resting on cover (M104), a placeholder until the figure redesign brings its own pose and clip (radians, at
   * Character.coverRest 1): the aim is posed `lean` higher and the spine leaned `lean` forward, so the upper body leans
   * over the cover by the share the aim clips don't turn (1 - aimReach, about 5°) while the bore stays on the shot. Not
   * on your own first-person body, and not on the built-in figures, which stay on their hit volume.
   */
  rest: { lean: 0.2 },
} as const;

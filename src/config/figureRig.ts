import { type FigureHitShape, HITS } from './hits';
import { MOVEMENT } from './movement';

/**
 * The rigged bot figures made in Blender (BF1, tools/blender/bot-figure/): the human and the robot,
 * `src/assets/models/characters/human.glb` and `robot.glb`, each with the export's sidecar (`human.json`, `robot.json`:
 * its clips, where the replicas sit in the fist and where the magazines go in the reloads). Every match draws them
 * (BD1; the built-in figures only when the files can't be loaded). Players and bots wear them alike, and the player's
 * own is their first-person body.
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
  /** Above this many bytes a file is warned about (both are fetched as the game starts, BD1). */
  warnBytes: 5_000_000,
  /**
   * The bones the legs' clips drive. Everything else is the upper body, which the aim, reload, switch and fire clips
   * (`upperBodyOnly` in the sidecar, authored over a still pelvis) take over from the legs' clip.
   */
  lowerBones: ['Root', 'Hips', 'Thigh_L', 'Shin_L', 'Foot_L', 'Toe_L', 'Thigh_R', 'Shin_R', 'Foot_R', 'Toe_R'] as readonly string[],
  /** The bones the drawing reads or moves itself. */
  bones: { hips: 'Hips', spine: 'Spine', chest: 'Chest', grip: 'Grip_R', hand: 'Hand_L' },
  /** The parts in the files, by role (each has `_LOD1` and `_LOD2` copies, except where the file lacks one). */
  parts: {
    human: {
      body: ['Body', 'Kit'],
      head: ['Head_HighCut', 'Head_Cap', 'Head_Boonie', 'Head_FullCut'],
      pack: 'Kit_Pack',
      radio: 'Kit_Radio',
    },
    robot: { body: ['Body', 'Body_Neck'], head: ['Head_Headset'] },
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
   * Distances (metres) beyond which a figure draws its LOD1 and LOD2 meshes, on Player detail High and Low (the Medium
   * preset is Low since BD1: four teammates at full detail at the spawn put Woodland 5v5 over its 200k), each line
   * crossed only `lodGive` past it (so a figure on the line doesn't flicker). At LOD0 it holds the replica's whole model,
   * beyond it the file's small figure version (but the whole model while it reloads, so the magazine comes out).
   */
  lod: { high: [12, 28], low: [6, 16] } as Readonly<Record<'high' | 'low', readonly [number, number]>>,
  lodGive: 0.5,
  /**
   * The layer of a figure's shadow twin (BD1): the body at its coarsest level of detail, in one draw, seen only by the
   * shadow-casting lights' cameras (their `shadow.camera.layers`, render/light/lighting.ts and render/light/torchBeams.ts), never by
   * the view. The body's own materials would cost a shadow draw each.
   */
  shadowLayer: 2,
  /** Below this horizontal speed (m/s) a figure stands; the legs' hit volumes swing only above it too. */
  stillBelow: HITS.legs.walkingSpeed,
  /** The paces the walk blends into the run between (m/s): the movement's own. */
  walkSpeed: MOVEMENT.walkSpeed,
  runSpeed: MOVEMENT.runSpeed,
  /**
   * How fast the blends settle (seconds to about two thirds of the way): between standing and moving, the direction of
   * the step, the legs' modes (walk and run, sprint, the hit call, the walk-off), the upper body's (aim, reload,
   * switch), a jump, and the rifle's and the pistol's aim. A vault (about half a second) comes in and goes out at
   * `vault`, and takes the aim's layer off as fast: the hit volume's legs follow it at once (sim/figureLegs.ts).
   */
  blend: { move: 0.12, direction: 0.1, mode: 0.12, overlay: 0.08, jump: 0.06, hold: 0.06, vault: 0.03 },
  /** The Jump clip's span (seconds) played over the time in the air: the take-off is skipped, the landing is the clip's. */
  jump: { from: 0.25, to: 0.55 },
  /**
   * A step goes back when its backward part is more than `share` of its speed: the crouched walk (made walking ahead)
   * then runs backwards. With the figures' legs in the hit volume (IM8) the walk cycle itself does, once the crouch is
   * more than `crouched` of the way down (sim/figureLegs.ts).
   */
  backStep: { share: 0.1, crouched: 0.5 },
  /** Thrown-away magazines out at most (the oldest goes first); each lies for its sidecar lifetime. */
  thrownMagazines: { max: 12 },
  /**
   * The Vault clip (M102, the figure redesign's: bot18.py), played by the vault's progress: its first `top` on the rise
   * onto the top (bot18.py VAULT_TOP), the rest across it (sim/figureLegs.ts vaultClipShare). A file without it plays
   * the legs' clips instead (the jump, tucked by the crouch).
   */
  vault: { top: 0.4 },
  /**
   * Holstered (M92; the clips are bot23.py's, BP4): the arms hang (the Holster clip, the Holster_Sprint's pumping arms
   * in a sprint) and the rifle rides slung across the back on the chest bone, as the built-in figures sling it
   * (config/characters.ts FIGURE.holster): its butt `buttX` to the right of the spine and `buttY` above the feet, `back`
   * behind the spine line (more over the human's pack), tilted `tilt` radians from upright with its muzzle down to the
   * left and its right side facing out. Drawn from the holster, the rifle comes to the hand FIGURE.holster.swapAt of the
   * way through the draw and the arms rise from hanging to the aim over the rest of it. A file without the clips holds
   * the replica in the hands while holstered.
   */
  sling: { buttX: 0.17, buttY: 1.42, tilt: 0.75, back: { human: 0.19, humanPack: 0.27, robot: 0.17 } },
} as const;

/**
 * Each figure's hit shape (HV1; owner, 2026-10-16: "fit to each figure"; config/hits.ts FigureHitShape): its points on
 * its own bones, so the volume follows the figure through every clip. Fitted to the drawn figure on every pose by
 * render/figures/riggedHitVolume.test.ts, which holds each to M85's bar (at most 4 % of the drawn body missed and 3 % of the
 * volume thin air); the human's covers all four heads, with and without the pack.
 */
export const FIGURE_HIT_SHAPES: Readonly<Record<FigureRigKind, FigureHitShape>> = {
  human: {
    head: { centre: { bone: 'Head', at: [0, 0.09, 0.016] }, radius: 0.13 },
    chest: { bottom: { bone: 'Spine1', at: [0, -0.04, -0.001] }, top: { bone: 'Chest', at: [0, 0.04, 0.01] }, halfWidth: 0.036, radius: 0.17 },
    shoulders: { left: { bone: 'Chest', at: [-0.09, 0.13, 0.005] }, right: { bone: 'Chest', at: [0.09, 0.13, 0.005] }, radius: 0.07 },
    hips: { bottom: { bone: 'Hips', at: [0, -0.065, -0.005] }, top: { bone: 'Hips', at: [0, 0.04, -0.005] }, halfWidth: 0.097, radius: 0.11 },
    legs: { thigh: 0.078, shin: 0.065, boot: 0.053 },
  },
  robot: {
    head: { centre: { bone: 'Head', at: [0, 0.087, 0] }, radius: 0.135 },
    chest: { bottom: { bone: 'Spine1', at: [0, 0.03, 0.014] }, top: { bone: 'Chest', at: [0, 0.07, 0.029] }, halfWidth: 0.058, radius: 0.115 },
    shoulders: { left: { bone: 'Chest', at: [-0.06, 0.13, -0.03] }, right: { bone: 'Chest', at: [0.06, 0.13, -0.03] }, radius: 0.06 },
    hips: { bottom: { bone: 'Hips', at: [0, -0.08, 0.001] }, top: { bone: 'Hips', at: [0, 0.08, 0.001] }, halfWidth: 0.007, radius: 0.11 },
    legs: { thigh: 0.069, shin: 0.059, boot: 0.047 },
  },
};

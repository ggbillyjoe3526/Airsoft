import { FIGURE } from './characters';

/**
 * External (CC0) models (M25a): how the game takes a model dropped into `src/assets/models/`. The how-to, the sources
 * and the size budget are in docs/CC0_ASSETS.md.
 */

/**
 * The parts of a figure a model can replace, by node name: each part is moved and posed exactly like the built-in
 * figure's (render/characterModels.ts). Author them in figure space: metres, feet at the origin, standing up +Y.
 * - `body`: torso, head and kit (everything above the hips; it drops when crouching and rolls when leaning);
 * - `legL`, `legR`: each leg, swinging about its hip;
 * - `aimRifle`, `aimPistol`: arms holding the rifle or the pistol, pitching with the aim about the shoulder line;
 * - `hitPose`: the hit-calling pose (a hand up, the replica hanging).
 */
export const FIGURE_PARTS = ['body', 'legL', 'legR', 'aimRifle', 'aimPistol', 'hitPose'] as const;
export type FigurePart = (typeof FIGURE_PARTS)[number];

export const FIGURE_MODEL = {
  /** The model is scaled so it stands this tall (metres, feet to the top of the head): the hit volume's own height. */
  height: FIGURE.headHeight + FIGURE.headRadius,
  /**
   * Turn applied to the model about +Y (radians). glTF models face +Z by convention and the figures face -Z, so a
   * half turn; set 0 for a model already facing -Z.
   */
  yaw: Math.PI,
  /** Materials whose name starts with this (any case) are painted in each figure's team colour. */
  teamMaterialPrefix: 'team',
  /** Above this many bytes the loader warns: the whole first download aims to stay under ~30 MB (CLAUDE.md §4). */
  warnBytes: 3_000_000,
} as const;

/**
 * A replica model from a file (M101, docs/CC0_ASSETS.md › Replica models): `src/assets/models/replicas/<replica id>.glb`
 * draws that replica in the hands, on the menus' pictures and on the figures, in place of its built-in model. Author it
 * in the replica's own space: metres, the bore along -Z (Blender +Y), up +Y (Blender +Z), the origin where the frame meets
 * the slide above the trigger, the grip where the built-in one is (the hands are posed in code). A file that can't be
 * used logs a warning and the built-in model is drawn.
 */
export const REPLICA_FILE = {
  /** The nodes the game reads, by name. Only `body` and `muzzle` are needed; without the others the built-in ones are drawn. */
  nodes: { body: 'Body', magazine: 'Magazine', figure: 'Figure', muzzle: 'Muzzle', torchMount: 'TorchMount', flashHider: 'FlashHider' },
  /** The replicas drawn as rifles (RM1): the AEG's hands, holds and parts, and the figures' rifle frame. */
  rifles: ['aeg'] as readonly string[],
  /**
   * Above this many bytes the loader warns (the whole first download aims to stay under ~30 MB, CLAUDE.md §4): a
   * pistol's, and the rifle's (RM1: about twice the parts, and the animations).
   */
  warnBytes: { default: 300_000, aeg: 400_000 } as Readonly<Record<string, number>>,
  /** The same for a replica's parts file (`replicaParts/<id>.glb`, RM1). */
  warnPartBytes: { default: 150_000, aeg: 300_000 } as Readonly<Record<string, number>>,
  /**
   * Above this many triangles in the hands (body, moving parts and magazine) the loader warns: the first-person budget,
   * the rifle's as the models list set it (RM1, against the built-in rifle's 8,508 on Low).
   */
  warnTriangles: { default: 3_500, aeg: 9_000 } as Readonly<Record<string, number>>,
  /** Above this many triangles on a figure the loader warns: six figures carry one each. */
  warnFigureTriangles: 300,
  /** The orange tip (VIEWMODEL.orangeTips) on a model's plain muzzle: a disc this deep, this much wider and proud of its face. */
  orangeTip: { depth: 0.002, radius: 0.0078, proud: 0.0005 },
} as const;

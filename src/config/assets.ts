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

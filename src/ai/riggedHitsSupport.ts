import { HITS, type HitConfig } from '../config/hits';
import { DEFAULT_LOOK } from '../config/look';
import { figureRigs } from '../render/figures/figureRig';
import { robotFigures } from '../render/figures/figureMix';
import { figureFilesForTests } from '../render/testSupport';
import type { Character } from '../sim/character';

/**
 * The hit rules a match plays with since BD1 (test support): the rigged figures' legs (IM8) and each figure's upper body
 * (HV1), read from the figure files as the game reads them, once per test file. The headless bot matches play with
 * them, so their bands measure the game as it ships.
 */
const { rigs } = await figureFilesForTests();
const both = figureRigs(rigs.human, rigs.robot, () => {});

/** `base` with the rigged figures' legs and upper bodies, as matchSession.ts builds a match's hit rules. */
export function riggedHits(base: HitConfig = HITS): HitConfig {
  return { ...base, figureLegs: both.legs, figureBodies: both.bodies };
}

export const RIGGED_HITS: HitConfig = riggedHits();

/** Which figure each of `characters` is drawn as, humans and robots mixed from `seed` as a match mixes them (G7). */
export function dressFigures(seed: number, characters: readonly Character[]): void {
  const robots = robotFigures(seed, characters.map((c) => c.team), DEFAULT_LOOK.robots);
  characters.forEach((c, i) => (c.figure = robots[i] ? 1 : 0));
}

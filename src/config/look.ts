/**
 * Settings › Look (graphics overhaul G1; William, 5 October 2026): who the players are drawn as, and how their replicas
 * are coloured. Presentation only: neither changes a hit, a sight line or a sound.
 */

/** Robots: on, each match mixes humans and robots on both teams; off, every figure is human. */
export const ROBOT_CHOICES: readonly { id: 'on' | 'off'; label: string; blurb: string }[] = [
  { id: 'on', label: 'Mixed', blurb: 'Each match mixes humans and robots on both teams.' },
  { id: 'off', label: 'Humans only', blurb: 'Every player is human.' },
];
export const DEFAULT_ROBOTS = true;

/** Realistic colours: each replica in one plain colour family (black, wolf grey, ranger green or tan) instead of its scheme. */
export const REALISTIC_COLOUR_CHOICES: readonly { id: 'on' | 'off'; label: string; blurb: string }[] = [
  { id: 'off', label: 'Bold', blurb: 'Every replica in its two-tone colour scheme.' },
  { id: 'on', label: 'Realistic', blurb: 'Every replica in black, wolf grey, ranger green or tan, never mixed.' },
];
export const DEFAULT_REALISTIC_COLOURS = false;

/** Robots are picked from a different stream of the match seed than the sim's, so the mix never shifts a gameplay roll. */
export const ROBOT_SEED_SALT = 0x5f3759df;

/** The Look settings a match or the range is built with. */
export interface LookSettings {
  /** Robots mixed in with humans on both teams (figures follow it from G7). */
  robots: boolean;
  /** Every replica in its scheme's plain family. */
  realisticColours: boolean;
}

export const DEFAULT_LOOK: LookSettings = { robots: DEFAULT_ROBOTS, realisticColours: DEFAULT_REALISTIC_COLOURS };

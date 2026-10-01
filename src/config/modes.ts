/**
 * Match modes. Elimination: knock out the whole other team. Attack / Defend: one team attacks a flagpole in the
 * other team's half and wins by raising its flag to the top; the defenders win by holding out until
 * time runs out. Knocking out the whole other team wins in either mode.
 */
export type MatchMode = 'elimination' | 'attackDefend';

/** Modes in the order the start screen lists them, with their labels. */
export const MATCH_MODES: readonly { id: MatchMode; label: string; blurb: string }[] = [
  { id: 'elimination', label: 'Elimination', blurb: 'Last team with someone in play wins the round.' },
  { id: 'attackDefend', label: 'Attack / Defend', blurb: "Raise your flag on the other team's pole, or keep yours down." },
];

export const DEFAULT_MODE: MatchMode = 'elimination';

export interface FlagRules {
  /** Players in play within this distance of the pole (metres, horizontal) work the rope. */
  radius: number;
  /** Seconds for the attackers to raise the flag from the bottom of the pole to the top. */
  raiseTime: number;
  /** Seconds for the defenders to pull it from the top back down to the bottom. */
  lowerTime: number;
  /** Attack and defence swap after this many rounds (half-time). */
  halfTimeAfter: number;
  /** Team that attacks first (0 = Blue, the player's team). */
  firstAttackers: number;
  /**
   * Overtime: when time runs out while the attackers are working the rope (raising it, or contesting it at
   * the pole), the round goes on until they stop or for at most this many seconds.
   */
  maxOvertime: number;
  /** The rope ratchets audibly every this fraction of the pole (a 'flagRope' event). */
  ropeStep: number;
}

/**
 * Flag mode, after the flag games played at real sites. Attackers raise their flag by standing at the
 * pole; defenders at the pole pull it back down; with both teams at the pole nobody can work the rope.
 * Nobody at the pole: the flag stays where it is. The time-out goes to the defenders.
 */
export const FLAG: FlagRules = {
  /** About an arm's reach around the pole plus a step, so a crouched player by the pole counts. */
  radius: 1.6,
  /** A commitment under fire, short enough to finish between two peeks (6 s made the pole rarely decide a round; DECISIONS). */
  raiseTime: 5,
  /** Pulling down is quicker than raising: a retake doesn't need a long stand in the open. */
  lowerTime: 3,
  /** First to 5 is at most 9 decided rounds: swap after 4, so the decider is in the second half. */
  halfTimeAfter: 4,
  firstAttackers: 0,
  /** Long enough to finish a raise that is well under way, short enough that it can't drag on. */
  maxOvertime: 15,
  ropeStep: 1 / 12,
};

import type { ContentTag } from './content';

/**
 * Match modes. Elimination: knock out the whole other team. Attack / Defend: one team attacks a flagpole in the
 * other team's half and wins by raising its flag to the top; the defenders win by holding out until
 * time runs out. Knocking out the whole other team wins in either mode. Extraction (M43): one run, not rounds: a squad
 * gets in, finds what it can and gets out through an exit before time runs out (config/extraction.ts).
 */
export type MatchMode = 'elimination' | 'attackDefend' | 'extraction';

/** Modes in the order the Mode pop-up lists them, with their labels and content tags (M35, config/content.ts). */
export const MATCH_MODES: readonly { id: MatchMode; label: string; blurb: string; tag: ContentTag }[] = [
  { id: 'elimination', label: 'Elimination', blurb: 'Last team with someone in play wins the round.', tag: 'public' },
  { id: 'attackDefend', label: 'Attack and Defend', blurb: "Raise your flag on the other team's pole, or keep yours down.", tag: 'public' },
  { id: 'extraction', label: 'Extraction', blurb: 'Get in, get what you can and get counted out at an exit before the whistle.', tag: 'dev' },
];

export const DEFAULT_MODE: MatchMode = 'elimination';

/** What a mode needs from a map (map/mapTypes.ts MapData): its flagpole, or its Extraction data. */
export type ModeMapNeed = 'flag' | 'extraction';

/**
 * What each mode is (CT3, the content toolkit's mode checks; the rulebook is docs/content/modes.md): how a match of it
 * is played, and what it needs from a map. A `Record`, so a new mode doesn't compile until it says.
 */
export interface ModeShape {
  /** Rounds between two teams until one wins the match, or one run (Extraction: a squad against the home team). */
  play: 'rounds' | 'run';
  /** What the map must have to host it; `null`: every map can. */
  needs: ModeMapNeed | null;
  /**
   * On a map without what it needs: still offered and played as Elimination (Attack / Defend, as before M43), or not
   * offered at all (Extraction).
   */
  without: 'elimination' | 'hidden';
}

export const MODE_SHAPES: Readonly<Record<MatchMode, ModeShape>> = {
  elimination: { play: 'rounds', needs: null, without: 'elimination' },
  attackDefend: { play: 'rounds', needs: 'flag', without: 'elimination' },
  extraction: { play: 'run', needs: 'extraction', without: 'hidden' },
};

/**
 * The never-check at every place a mode must be answered for (CT3): each `switch (mode)` there ends in
 * `default: return unknownMode(mode)`, so a mode added to MatchMode fails to compile until every place has a case for it,
 * instead of quietly playing as Elimination. The places are listed in docs/content/modes.md › Checks.
 */
export function unknownMode(mode: never): never {
  throw new Error(`No answer for match mode "${String(mode)}"`);
}

export interface FlagRules {
  /** Players in play within this distance of the pole (metres, horizontal) work the rope. */
  radius: number;
  /** Seconds for the attackers to raise the flag from the bottom of the pole to the top. */
  raiseTime: number;
  /** Seconds for the defenders to pull it from the top back down to the bottom. */
  lowerTime: number;
  /** Team that attacks first (0 = Alpha; the player picks Alpha or Beta, M98). */
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
  firstAttackers: 0,
  /** Long enough to finish a raise that is well under way, short enough that it can't drag on. */
  maxOvertime: 15,
  ropeStep: 1 / 12,
};

/**
 * Elimination's overtime flag (Dev 6 item 45): when a round's clock runs out level, a flag goes up at the map's
 * `overtimeFlag` spot near the middle and the first team to touch it wins the round (sim/overtimeFlag.ts).
 */
export interface OvertimeRules {
  /** How long the flag stays up (s); untouched by then, the time-out rule decides the round (a draw if level). */
  time: number;
  /** A player in play within this distance (metres, horizontal) of the flag's foot touches it: about an arm's reach. */
  reach: number;
  /** ...with their feet within this height (metres) of its foot: from its own floor, never a balcony over it. */
  reachHeight: number;
}

/**
 * Long enough to reach the middle from anywhere on Woodland, the biggest field (its spawns walk 58 m there, 14 s at a
 * run), and fight for it; short enough to stay a finish, not a second round. A touch is a hand on the flag: no hold, so
 * the first one there wins, as at the sites that play it.
 */
export const OVERTIME: OvertimeRules = {
  time: 30,
  reach: 1.0,
  reachHeight: 1.0,
};

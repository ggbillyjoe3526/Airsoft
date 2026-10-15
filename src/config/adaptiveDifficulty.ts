import type { BotSkill } from './bots';

/**
 * Adaptive difficulty (AD1, Dev 6 item 48; owner, 2026-10-06: "bots get a little better when you win, a little easier
 * when you lose"): the Dev tab's switch. The other team's skill is a rating on the difficulty scale, 0 Easy, 1 Normal,
 * 2 Hard and 3 Pro, from 0 up to the highest level offered (Hard; Pro with Dev content on). It starts at the Opponents
 * level picked, moves after every match from how you did (`match`), and a little between rounds within a match from
 * your last round (`round`). Between two levels the bots' numbers blend (`blended`); the rest comes from the level the
 * match plays as, the one nearest the rating it started at. The fixed levels' own numbers (config/bots.ts BOT_SKILL)
 * are never changed. Everything here is a first guess, to tune through play on Normal (playtest note 19).
 */
export const ADAPTIVE = {
  /**
   * How one round scores you, from -1 to 1: its result (won 1, drawn 0, lost -1) and your own part in it (your hits on
   * the other team, less 1 if they hit you, kept within -1 to 1), weighted. Weights add up to 1.
   */
  roundWeights: { result: 0.6, personal: 0.4 },
  /**
   * Within a match, after each round: the rating moves by that round's score times `up` (a score above 0) or `down`
   * (below 0), and never more than `maxDrift` either way from where the match began. Gentle: a few rounds' worth of a
   * level's tenth, so a match keeps its feel.
   */
  round: { up: 0.04, down: 0.05, maxDrift: 0.15 },
  /**
   * How a whole match scores you, from -1 to 1: its result (won 1, lost -1) and the mean of its rounds' scores, weighted.
   * Weights add up to 1.
   */
  matchWeights: { result: 0.5, rounds: 0.5 },
  /**
   * After a match played to the end, the next one starts at this one's start plus the match's score times `up` or
   * `down` (a clear win about a fifth of a level up). `down` above `up` eases off a little faster than it climbs: the
   * rating settles where you win about down / (up + down) of your matches, 5 in 9.
   */
  match: { up: 0.2, down: 0.25 },
  /**
   * How far past a level (the fraction of the way to the next) the Match screen and the summary call it "a little
   * sharper", "between" the two, then "a little gentler" than the next. Below `sharper` it is the level itself, and from
   * `level` on the next level itself. `step`: how far a match must move the rating for the summary to call it a step up
   * or down rather than no change (a rounding's worth).
   */
  words: { sharper: 0.15, between: 0.4, gentler: 0.6, level: 0.85, step: 0.005 },
} as const;

/**
 * BotSkill's numbers that blend between the two levels around the rating (a pair blends end by end). Every other field
 * (the switches, whole numbers such as Extraction's locker guards, and `huntersFrom`) comes from the level the match plays
 * as, for the whole match: so a bot never starts holding angles or playing as a team halfway through. A test checks every
 * BotSkill field is in exactly one of these two lists.
 */
export const ADAPTIVE_BLENDED = [
  'reactionTime',
  'turnRate',
  'aimErrorStartDeg',
  'aimErrorSettledDeg',
  'aimSettleTime',
  'aimErrorStartMetres',
  'aimErrorMovingDeg',
  'aimErrorTracking',
  'leadFactor',
  'burst',
  'burstPause',
  'holdTime',
  'holdCoverChance',
  'contactCoverMinDistance',
  'searchWalkDistance',
  'flankChance',
  'preAimReactionTime',
  'preAimSettled',
  'peekWatchTime',
  'overtimeReaction',
  'huntMemory',
] as const satisfies readonly (keyof BotSkill)[];

export const ADAPTIVE_FROM_LEVEL = [
  'holdsAngles',
  'slicesCorners',
  'teamPlay',
  'torchOnTheMove',
  'firesIntoLeaves',
  'huntsMiddle',
  'keepsDark',
  'lockerGuards',
  'huntersFrom',
] as const satisfies readonly (keyof BotSkill)[];

/** What adaptive difficulty says on the Match screen, on the summary and on the Dev tab. */
export const ADAPTIVE_TEXT = {
  label: 'Adaptive difficulty',
  help: "The other team's bots adapt to how you do: a little sharper after you win, a little gentler after you lose. They start at your Opponents level; picking another starts again from it. Not in Extraction.",
  /** A level a little past `level` ("Normal, a little sharper"), between two, and a little short of `level`. */
  sharper: (level: string): string => `${level}, a little sharper`,
  between: (lower: string, upper: string): string => `between ${lower} and ${upper}`,
  gentler: (level: string): string => `${level}, a little gentler`,
  /** Under the Match screen's rules. */
  matchNote: (where: string): string => `Adaptive difficulty: the other team adapts to how you do, and starts this match at ${where}.`,
  notInRun: "Adaptive difficulty doesn't change Extraction runs: the other team plays the Opponents level.",
  /** The summary's card. */
  title: 'Adaptive difficulty',
  next: (where: string, change: 'up' | 'down' | 'same'): string =>
    change === 'same' ? `No change: the next match starts at ${where} again.` : `${change === 'up' ? 'A step up' : 'A step down'}: the next match starts at ${where}.`,
  unchanged: (where: string): string => `No change, as other Dev settings changed this match: the next starts at ${where}.`,
} as const;

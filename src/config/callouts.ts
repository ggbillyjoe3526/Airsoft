/**
 * Callouts (CL1): how the bots' calls are read off what they do (ai/callouts.ts) and how they show (ui/hitFeed.ts, the match feed,
 * audio/sfx.ts radioCall). What they say and how often is callouts.md, the owner's to edit.
 */
export const CALLOUTS = {
  /** An enemy counts as in a bot's sight while it saw them this recently (s): the tick before, give or take. */
  inSight: 0.1,
  /** Reloading is called only with an enemy seen or heard this recently (s). */
  reloadThreat: 4,
  /** Last one names where they are only when the team saw them this recently (s). */
  lastOneSeen: 3,
  /** Calls a team holds back at once, waiting for its turn to speak (callouts.md › Pace); the least urgent go first. */
  queue: 3,
  /** The feed: lines shown at once, how long each stays (s of play: a pause holds them) and its fade at the end (s). */
  feedLines: 4,
  lineTime: 6,
  fadeTime: 0.6,
  /** An enemy's call gives a radio click from where they stand only within this many metres of you. */
  enemyRadioRange: 15,
  /** How far a teammate's radio click is panned towards where they stand: 0 centred, 1 all the way to one side. */
  radioPan: 0.6,
} as const;

/** Settings › HUD › Callouts (CL1): your teammates' calls shown and heard, or neither. */
export type CalloutsMode = 'on' | 'off';

export const CALLOUT_CHOICES: readonly { id: CalloutsMode; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'No calls and no radio clicks. Your orders are still answered.' },
  { id: 'on', label: 'On', blurb: `Your teammates' calls in the feed, with a radio click from where each one stands; enemies close by are heard keying their radios.` },
];

export const DEFAULT_CALLOUTS: CalloutsMode = 'on';

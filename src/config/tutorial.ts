import type { RangeTargetKind } from './range';

/**
 * The tutorial (M16): what each step asks and what finishes it, played on the practice range. Text in braces names a
 * key binding (`{fire}`), shown as the key the player has it on. First guesses, to tune in play.
 */
export type TutorialGoal =
  /** Turn the view this far in all (rad). */
  | { kind: 'look'; radians: number }
  /** Walk downrange to the firing line (`z` or less). */
  | { kind: 'reach'; z: number }
  /** Hit a target of `target` kind (any, if not given) at `minDistance` or further, with the replica in `slot` if given. */
  | { kind: 'hit'; target?: RangeTargetKind; minDistance: number; slot?: number }
  | { kind: 'reload' }
  /** Aim down the sight for this long in all (s). */
  | { kind: 'aim'; seconds: number }
  | { kind: 'crouch' }
  /** Lean out at least `amount` (0..1) to the left and to the right, in either order (TT2). */
  | { kind: 'lean'; amount: number }
  /** Nothing to do: the step reads for this long (s). */
  | { kind: 'read'; seconds: number }
  /** Change the fire mode (audit POOL-15). */
  | { kind: 'fireMode' }
  /** Fire within `within` seconds of a sprint ending (audit POOL-15): a shot on the run doesn't count. */
  | { kind: 'sprintShot'; within: number }
  /** Vault over a low obstacle (M102: the range's low sandbag wall). */
  | { kind: 'vault' };

/** What a step opens on screen while it is up (M80): the hold-key scoreboard, or the order wheel, as a match shows them. */
export type TutorialShowcase = 'scoreboard' | 'orderWheel';

export interface TutorialStep {
  id: string;
  /** Short heading, e.g. "Look around". */
  title: string;
  text: string;
  goal: TutorialGoal;
  /** Opened on screen while this step shows, closed when the next one comes up (M80). */
  shows?: TutorialShowcase;
  /** Played instead when the replica in hand can't aim down a sight (neither an optic nor iron sights; since M84 every replica has iron sights). */
  withoutOptic?: Omit<TutorialStep, 'withoutOptic'>;
  /** Said after `text` only while levelling is on (LV1; M83: with it off in the Dev settings the tutorial never names it). */
  levelling?: string;
  /** Said instead of `text` while the ammo counter is off (Settings › HUD, AC1), so the step never points at a count the HUD doesn't show. */
  countHidden?: string;
}

/** How long every read card stays up (s; TT2, owner 2026-10-17: "read only cards should last 10s"; TT1 had 5 to 8). */
export const READ_TIME = 10;

/**
 * The steps in order (M80 wording; TT1, owner's 0.1 Dev 6 note 2: shorter and simpler, and the read cards move on
 * sooner). One or two short sentences each: what to do, then why it matters. Keys are always named through `{action}`,
 * so the coach shows the key the player has bound.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'look',
    title: 'Look around',
    text: 'Move the mouse to look around. Turn left and right.',
    goal: { kind: 'look', radians: 1.5 },
  },
  {
    id: 'walk',
    title: 'Walk to the line',
    text: 'Move with {forward} {left} {back} {right} up to the painted firing line. Hold {walk} to move quietly.',
    goal: { kind: 'reach', z: 0.3 },
  },
  {
    id: 'steel',
    title: 'First shot',
    text: 'Put the centre dot on a white steel plate and press {fire}. The plate rings when you hit it.',
    goal: { kind: 'hit', target: 'steel', minDistance: 0 },
  },
  {
    id: 'far',
    title: 'Long shots',
    // The reach is the stock rifle's hopUpReach, rounded; tutorial.test.ts fails when a retune moves it.
    text: 'Hop-up keeps your BBs flying flat to about 39 m, then they drop. Hit a figure 50 m or further: aim a little high.',
    goal: { kind: 'hit', target: 'figure', minDistance: 50 },
  },
  {
    id: 'reload',
    title: 'Reload',
    text: 'Shoot a few BBs, then press {reload} to swap mags. Spares only refill between rounds, so watch your count.',
    countHidden: 'Shoot a few BBs, then press {reload} to swap mags. Your ammo counter is off, so keep count yourself: an empty replica just clicks.',
    goal: { kind: 'reload' },
  },
  {
    id: 'selector',
    title: 'Fire mode',
    text: 'Press {fireMode} to change fire mode, such as single shots or full auto. Single shots save BBs at range.',
    goal: { kind: 'fireMode' },
  },
  {
    id: 'aim',
    title: 'Aim down the sight',
    text: 'Press {aim} to look down your sight at a target. Fit a red dot or scope on the Loadout (Esc, then Loadout).',
    goal: { kind: 'aim', seconds: 1 },
    withoutOptic: {
      id: 'optics',
      title: 'Optics',
      text: 'This replica has no sight. Fit a red dot or scope on the Loadout (Esc, then Loadout), then aim with {aim}.',
      goal: { kind: 'read', seconds: READ_TIME },
    },
  },
  {
    id: 'crouch',
    title: 'Crouch',
    text: 'Hold {crouch} to crouch. You make a smaller target, and low cover hides you.',
    goal: { kind: 'crouch' },
  },
  {
    id: 'lean',
    title: 'Lean',
    text: 'Hold {leanLeft} to peek left and {leanRight} to peek right. A quick peek shows little of you round cover.',
    goal: { kind: 'lean', amount: 0.8 },
  },
  {
    id: 'sprint',
    title: 'Sprint, then shoot',
    text: 'Sprint with {sprint}, then stop and press {fire}. BBs fly wide on the run, so stop for shots that count.',
    goal: { kind: 'sprintShot', within: 1.5 },
  },
  {
    id: 'vault',
    title: 'Vault',
    text: 'Run at the low sandbag wall behind the firing line and press {jump} to vault it. Vaulting is quick, but loud.',
    goal: { kind: 'vault' },
  },
  {
    id: 'secondary',
    title: 'Switch replica',
    text: 'Press {slot2} for your second replica and hit any target with it. {slot1} switches back.',
    goal: { kind: 'hit', minDistance: 0, slot: 1 },
  },
  {
    id: 'hits',
    title: "One hit, you're out",
    text: "One BB hit and you're out: hand up, call your hit, walk off. Bots do the same, and hitting a teammate counts too.",
    goal: { kind: 'read', seconds: READ_TIME },
  },
  {
    id: 'scoreboard',
    title: 'Scoreboard',
    text: 'In a match, hold {scoreboard} to see the scoreboard. Greyed-out players have been hit.',
    goal: { kind: 'read', seconds: READ_TIME },
    shows: 'scoreboard',
  },
  {
    id: 'orderWheel',
    title: 'Order wheel',
    text: 'In a match, hold {orderWheel}, point at an order and let go. Your bot teammates carry it out.',
    goal: { kind: 'read', seconds: READ_TIME },
    shows: 'orderWheel',
  },
  {
    id: 'match',
    title: 'Winning a match',
    text: 'Knock out the other team to win a round. In Attack / Defend, attackers also win by raising their flag at the pole.',
    levelling: 'Matches give XP; the Armory shows what comes next.',
    goal: { kind: 'read', seconds: READ_TIME },
  },
];

/** The steps as the coach says them: a step's levelling line joins its text (either one) only while levelling is on (LV1). Pure. */
export function tutorialSteps(levelling: boolean): readonly TutorialStep[] {
  return TUTORIAL_STEPS.map((step) => {
    if (!step.levelling || !levelling) return step;
    const text = `${step.text} ${step.levelling}`;
    return step.countHidden ? { ...step, text, countHidden: `${step.countHidden} ${step.levelling}` } : { ...step, text };
  });
}

/** What the coach says for `step`: its `countHidden` text while the ammo counter is off (AC1), else its text. Pure. */
export function coachText(step: TutorialStep, ammoCounter: boolean): string {
  return !ammoCounter && step.countHidden ? step.countHidden : step.text;
}

export const TUTORIAL = {
  /** A finished step shows its tick for this long before the next one (s; TT1: 0.9 felt slow over 15 steps). */
  doneTime: 0.6,
  /** How far down (0..1, the character's crouch amount) counts as crouched. */
  crouchedAt: 0.95,
  /**
   * The order wheel's step (M80): its pointer moves on to the next order this often, to show how one is picked (s; TT1:
   * quick enough to visit every order while the card is up).
   */
  wheelDemoStep: 1.1,
  /**
   * The scoreboard's step (M80): the sample match it shows, as a match's hold-key board would. Each row is a player:
   * hits, times hit, BBs fired, seconds in play, and whether they are out this round; your team's first row is you.
   */
  sampleBoard: {
    round: 3,
    score: [2, 1],
    rows: [
      [
        [2, 1, 84, 151, false],
        [3, 0, 120, 186, false],
        [1, 1, 66, 140, true],
        [0, 2, 41, 97, false],
      ],
      [
        [2, 2, 97, 133, false],
        [1, 1, 73, 150, true],
        [1, 2, 58, 118, false],
        [0, 1, 30, 165, true],
      ],
    ] as readonly (readonly (readonly [hits: number, timesHit: number, bbsFired: number, timeAlive: number, out: boolean])[])[],
  },
} as const;

/**
 * Pro briefing tips (M41): short lines shown on the board between rounds (and while the scoreboard key is held) when the
 * opponents are Pro, one per round in this order, round 1 first. First guesses, to tune in play.
 */
export const PRO_TIPS: readonly string[] = [
  'Slice corners: open each one a step at a time, from wide, instead of running past it.',
  'Short peeks: show yourself for a heartbeat and step back. A Pro bot needs a moment to answer, and a quick peek costs you nothing.',
  'Listen: a bot on the move is loud. Stand still, hear which way they come, then peek.',
  'Hold a corner yourself: stand still with your view on the doorway and let them walk into your aim.',
];

/** The Pro tip for round `round` (1 first), cycling through PRO_TIPS. */
export function proTip(round: number): string {
  return PRO_TIPS[(Math.max(1, Math.floor(round)) - 1) % PRO_TIPS.length]!;
}

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
  /** Lean out this far (0..1) either way. */
  | { kind: 'lean'; amount: number }
  /** Nothing to do: the step reads for this long (s). */
  | { kind: 'read'; seconds: number }
  /** Change the fire mode (audit POOL-15). */
  | { kind: 'fireMode' }
  /** Fire within `within` seconds of a sprint ending (audit POOL-15: the sprint lockout). */
  | { kind: 'sprintShot'; within: number };

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
  /** Said after `text` only while the Armory is on (M83: with Disable Armory the tutorial never names it). */
  armory?: string;
}

/**
 * The steps in order (M80 wording, owner's 0.1 Dev 4 note 1): plain words, each saying how the thing works, not only its
 * name. Keys are always named through `{action}`, so the coach shows the key the player has bound.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'look',
    title: 'Look around',
    text: 'Move the mouse to look around. Turn left and right to take in the whole range.',
    goal: { kind: 'look', radians: 1.5 },
  },
  {
    id: 'walk',
    title: 'Walk to the line',
    text: 'Move with {forward} {left} {back} {right} and walk up to the painted firing line in front of you. Hold {walk} to walk slowly and quietly; sprint with {sprint} to run.',
    goal: { kind: 'reach', z: 0.3 },
  },
  {
    id: 'steel',
    title: 'First shot',
    text: 'Put the mark in the middle of the screen on a white steel plate to the left, then press {fire} to shoot. A plate rings when your BB hits it.',
    goal: { kind: 'hit', target: 'steel', minDistance: 0 },
  },
  {
    id: 'far',
    title: 'Long shots',
    // The reach is the stock rifle's hopUpReach, rounded; tutorial.test.ts fails when a retune moves it.
    text: 'A BB is light and slow. The hop-up spins it so it flies flat for a while (the stock rifle: about 39 m), then it drops. Knock down a figure 50 m away or further: aim a little above it, or turn the hop-up up on the Loadout (press Esc, then Loadout).',
    goal: { kind: 'hit', target: 'figure', minDistance: 50 },
  },
  {
    id: 'reload',
    title: 'Reload',
    text: 'Shoot a few BBs, then press {reload} to swap in a fresh magazine: you always get your fullest spare. In a match spare magazines only refill at the next round, so watch your count.',
    goal: { kind: 'reload' },
  },
  {
    id: 'selector',
    title: 'Fire mode',
    text: 'Press {fireMode} to switch between full auto (BBs keep coming while you hold {fire}) and single shots (one BB each press). Single shots save BBs at long range; full auto wins close fights.',
    goal: { kind: 'fireMode' },
  },
  {
    id: 'aim',
    title: 'Aim down the sight',
    text: 'Aim with {aim} to look through your sight: the view zooms in and your BBs land closer together. Keep it on a target for a second.',
    goal: { kind: 'aim', seconds: 1 },
    withoutOptic: {
      id: 'optics',
      title: 'Optics',
      text: 'Your replica has no optic fitted. On the Loadout (press Esc, then Loadout) you can fit a red dot or a 2× scope; then {aim} lets you look through it for zoomed-in, steadier shots.',
      goal: { kind: 'read', seconds: 9 },
    },
  },
  {
    id: 'crouch',
    title: 'Crouch',
    text: 'Press {crouch} to crouch. Crouched, you are a smaller target in the open, and behind low cover nobody can see you at all.',
    goal: { kind: 'crouch' },
  },
  {
    id: 'lean',
    title: 'Lean',
    text: 'Hold {leanLeft} to lean left or {leanRight} to lean right. Leaning lets you peek and shoot round cover while most of you stays safely behind it.',
    goal: { kind: 'lean', amount: 0.8 },
  },
  {
    id: 'sprint',
    title: 'Sprint, then shoot',
    text: 'Sprint with {sprint}, stop, and shoot with {fire} straight away. After a sprint your replica needs a short moment before it fires, so slow down before you run round a corner.',
    goal: { kind: 'sprintShot', within: 1.5 },
  },
  {
    id: 'secondary',
    title: 'Switch replica',
    text: 'Press {slot2} to take out your second replica, and hit any target with it. Press {slot1} to switch back to the first one.',
    goal: { kind: 'hit', minDistance: 0, slot: 1 },
  },
  {
    id: 'hits',
    title: "One hit, you're out",
    text: "In a match there is no health bar: one BB hit and you're out. You hear a tick, raise your hand to call your hit, and walk off. Bots always call their hits too. Careful: hitting a teammate counts as well.",
    goal: { kind: 'read', seconds: 11 },
  },
  {
    id: 'scoreboard',
    title: 'Scoreboard',
    text: 'This is the scoreboard. In a match, hold {scoreboard} to see it: both teams, who is still in the round (greyed out: hit), and how everyone is doing. Let go of {scoreboard} and it closes.',
    goal: { kind: 'read', seconds: 10 },
    shows: 'scoreboard',
  },
  {
    id: 'orderWheel',
    title: 'Order wheel',
    // The orders' names are ORDER_WHEEL's labels (config/squad.ts); tutorial.test.ts fails when one is renamed.
    text: "This is the order wheel. In a match, hold {orderWheel} to open it, move the mouse onto an order and let go to give it to your bot teammates: Follow Me, Hold Here or Regroup. Team Plan sends them back to the team's own plan. The key under an order gives it without the wheel.",
    goal: { kind: 'read', seconds: 14 },
    shows: 'orderWheel',
  },
  {
    id: 'match',
    title: 'Winning a match',
    text: 'Win a round by knocking out the whole other team. In Attack / Defend the attackers can also win by raising their flag at the other pole, and the defenders by holding it off until time runs out. The minimap shows your team and where you heard shots.',
    armory: 'Matches pay Field Credits: spend them in the Armory for new gear, free.',
    goal: { kind: 'read', seconds: 16 },
  },
];

/** The steps as the coach says them: a step's Armory line joins its text only while the Armory is on (M83). Pure. */
export function tutorialSteps(armory: boolean): readonly TutorialStep[] {
  return TUTORIAL_STEPS.map((step) => (step.armory && armory ? { ...step, text: `${step.text} ${step.armory}` } : step));
}

export const TUTORIAL = {
  /** A finished step shows its tick for this long before the next one (s). */
  doneTime: 0.9,
  /** How far down (0..1, the character's crouch amount) counts as crouched. */
  crouchedAt: 0.95,
  /** The order wheel's step (M80): its pointer moves on to the next order this often, to show how one is picked (s). */
  wheelDemoStep: 1.6,
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

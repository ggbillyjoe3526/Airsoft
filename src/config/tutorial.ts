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
  | { kind: 'read'; seconds: number };

export interface TutorialStep {
  id: string;
  /** Short heading, e.g. "Look around". */
  title: string;
  text: string;
  goal: TutorialGoal;
  /** Played instead when the replica in hand can't aim down a sight (no optic fitted: iron sights out of the box). */
  withoutOptic?: Omit<TutorialStep, 'withoutOptic'>;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'look', title: 'Look around', text: 'Move the mouse to look around the range.', goal: { kind: 'look', radians: 1.5 } },
  {
    id: 'walk',
    title: 'Move',
    text: 'Walk up to the painted firing line in front of you: {forward} {left} {back} {right}. Hold {walk} to move quietly, {sprint} to sprint.',
    goal: { kind: 'reach', z: 0.3 },
  },
  {
    id: 'steel',
    title: 'First shot',
    text: 'Aim at a white steel plate on the left and press {fire}. Steel rings when you hit it.',
    goal: { kind: 'hit', target: 'steel', minDistance: 0 },
  },
  {
    id: 'far',
    title: 'BBs drop',
    text: "BBs are slow and drop at range. Knock down a figure 30 m out or further: aim a little high and watch where they land.",
    goal: { kind: 'hit', target: 'figure', minDistance: 30 },
  },
  {
    id: 'reload',
    title: 'Reload',
    text: 'Press {reload} to change magazines: your fullest spare goes in. In a match nothing refills until the next round.',
    goal: { kind: 'reload' },
  },
  {
    id: 'aim',
    title: 'Aim down the sight',
    text: 'Aim with {aim} to look through your sight: zoomed in and steadier. Stay on a target for a moment.',
    goal: { kind: 'aim', seconds: 1 },
    withoutOptic: {
      id: 'optics',
      title: 'Optics',
      text: 'Your rifle has iron sights. Fit a red dot or a 2× scope on the Loadout (Esc, then Loadout) and aim through it with {aim}.',
      goal: { kind: 'read', seconds: 8 },
    },
  },
  {
    id: 'crouch',
    title: 'Crouch',
    text: 'Press {crouch} to crouch. Behind low cover a crouched player is hidden, and smaller in the open (the right lane).',
    goal: { kind: 'crouch' },
  },
  {
    id: 'lean',
    title: 'Lean',
    text: 'Hold {leanLeft} or {leanRight} to lean out and peek round cover without stepping out of it.',
    goal: { kind: 'lean', amount: 0.8 },
  },
  {
    id: 'secondary',
    title: 'Switch replica',
    text: 'Press {slot2} for your second replica and hit any target with it. {slot1} brings the first one back.',
    goal: { kind: 'hit', minDistance: 0, slot: 1 },
  },
  {
    id: 'hits',
    title: 'One hit, you\'re out',
    text: "In a match one BB knocks you out: you hear a tick, raise your hand and walk off. Bots call their hits too, and friendly fire counts. That's the basics: keep practising here, or press Esc and quit to the title screen to start a match.",
    goal: { kind: 'read', seconds: 12 },
  },
];

export const TUTORIAL = {
  /** A finished step shows its tick for this long before the next one (s). */
  doneTime: 0.9,
} as const;

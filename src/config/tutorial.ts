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
    title: 'Hop-up and range',
    // The reach is the stock rifle's hopUpReach, rounded; tutorial.test.ts fails when a retune moves it.
    text: "BBs fly flat while the hop-up's backspin lasts (the stock rifle: about 39 m), then drop. Knock down a figure 50 m out or further: aim high, or turn the hop-up up on the Loadout (Esc).",
    goal: { kind: 'hit', target: 'figure', minDistance: 50 },
  },
  {
    id: 'reload',
    title: 'Reload',
    text: 'Fire a few BBs, then press {reload} to change magazines: your fullest spare goes in. In a match nothing refills until the next round.',
    goal: { kind: 'reload' },
  },
  {
    id: 'selector',
    title: 'Fire selector',
    text: 'Press {fireMode} to switch the rifle between full auto and single shots. Single shots save BBs at range; auto wins a close fight.',
    goal: { kind: 'fireMode' },
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
    id: 'sprint',
    title: 'Sprint, then shoot',
    text: 'Sprint with {sprint}, then fire straight after. A replica needs a moment after a sprint before it shoots, so slow down a step before you peek a corner.',
    goal: { kind: 'sprintShot', within: 1.5 },
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
    text: 'In a match one BB knocks you out: you hear a tick, raise your hand and walk off. Bots call their hits too, and friendly fire counts.',
    goal: { kind: 'read', seconds: 8 },
  },
  {
    id: 'match',
    title: 'In a match',
    text: "Hold {scoreboard} for the scoreboard; the minimap shows your team and the shots you hear. Hold {orderWheel} to give your bot squad an order. Attack / Defend is won by raising the flag. Matches pay Field Credits: spend them in the Armory for new gear, free. That's the basics: keep practising here, or press Esc and quit to start a match.",
    goal: { kind: 'read', seconds: 14 },
  },
];

export const TUTORIAL = {
  /** A finished step shows its tick for this long before the next one (s). */
  doneTime: 0.9,
  /** How far down (0..1, the character's crouch amount) counts as crouched. */
  crouchedAt: 0.95,
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

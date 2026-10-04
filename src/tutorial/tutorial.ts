import type { Action } from '../config/controls';
import { TUTORIAL, type TutorialStep } from '../config/tutorial';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import type { RangeTarget } from '../sim/rangeTargets';

/** What the tutorial looks at after each simulation tick. */
export interface TutorialView {
  dt: number;
  player: Character;
  events: readonly GameEvent[];
  targets: readonly RangeTarget[];
}

/**
 * The tutorial's progress (M16): which step is up, and whether it's done. Reads the simulation after each tick, never
 * writes it; pure, so it's tested without a page. A finished step shows its tick for TUTORIAL.doneTime while the next
 * one is already being checked, so nothing done in that moment is lost. Without an optic, the aiming step becomes one
 * that says how to fit one.
 */
export class TutorialTracker {
  readonly steps: readonly TutorialStep[];
  /** The step whose goal is being checked (steps.length once all are done). */
  private index: number;
  /** The current goal so far: view turned (rad), or time aiming or reading (s). */
  private amount = 0;
  /** The current goal so far: whether the player fired the replica in the goal's slot (hit goals with a slot). */
  private firedSlot = false;
  private lastYaw = Number.NaN;
  /** The step just finished, shown with its tick for `doneLeft` more seconds. */
  private doneIndex = -1;
  private doneLeft = 0;

  constructor(steps: readonly TutorialStep[], canAim: boolean, start = 0) {
    this.steps = steps.map((s) => (!canAim && s.withoutOptic ? s.withoutOptic : s));
    this.index = Math.min(Math.max(0, start), this.steps.length);
  }

  /** The step shown: the one just finished while its tick shows, else the one under way; null once it's all over. */
  get step(): TutorialStep | null {
    return this.steps[this.stepIndex] ?? null;
  }

  /** 0-based index of the step shown. */
  get stepIndex(): number {
    return this.doneLeft > 0 ? this.doneIndex : this.index;
  }

  /** 0-based index of the step still to do (to pick up from when the range is rebuilt). */
  get goalIndex(): number {
    return this.index;
  }

  get finished(): boolean {
    return this.index >= this.steps.length && this.doneLeft === 0;
  }

  /** The step shown was just done and shows its tick. */
  get showingDone(): boolean {
    return this.doneLeft > 0;
  }

  /** After a simulation tick. Returns true when the step shown changed (done, or the next one started). */
  observe(v: TutorialView): boolean {
    let changed = false;
    const yawStep = Number.isNaN(this.lastYaw) ? 0 : Math.abs(wrap(v.player.yaw - this.lastYaw));
    this.lastYaw = v.player.yaw;
    if (this.doneLeft > 0) {
      this.doneLeft = Math.max(0, this.doneLeft - v.dt);
      changed = this.doneLeft === 0;
    }
    const step = this.steps[this.index];
    if (!step || !this.goalMet(step, v, yawStep)) return changed;
    this.doneIndex = this.index++;
    this.doneLeft = TUTORIAL.doneTime;
    this.amount = 0;
    this.firedSlot = false;
    return true;
  }

  private goalMet(step: TutorialStep, v: TutorialView, yawStep: number): boolean {
    const g = step.goal;
    const p = v.player;
    switch (g.kind) {
      case 'look':
        this.amount += yawStep;
        return this.amount >= g.radians;
      case 'reach':
        return p.position.z <= g.z;
      case 'crouch':
        return p.crouchAmount >= TUTORIAL.crouchedAt;
      case 'lean':
        return Math.abs(p.lean) >= g.amount;
      case 'aim':
        if (p.aiming) this.amount += v.dt;
        return this.amount >= g.seconds;
      case 'read':
        // Reading starts once the card is up, not while the last step's tick still shows.
        if (this.doneLeft === 0) this.amount += v.dt;
        return this.amount >= g.seconds;
      case 'reload':
        return v.events.some((e) => e.type === 'reloadEnd' && e.characterId === p.id);
      case 'hit':
        // A replica's BBs aren't told apart in flight: a hit counts once you've fired the asked-for replica this step.
        if (g.slot !== undefined && !this.firedSlot) {
          this.firedSlot = p.armament.active === g.slot && v.events.some((e) => e.type === 'shot' && e.characterId === p.id);
        }
        if (g.slot !== undefined && !this.firedSlot) return false;
        return v.events.some((e) => {
          if (e.type !== 'targetHit' || e.shooterId !== p.id) return false;
          const t = v.targets.find((x) => x.id === e.targetId);
          return t !== undefined && t.distance >= g.minDistance && (!g.target || t.kind === g.target);
        });
    }
  }
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** A step's text in pieces: plain text, and the keys it names (`{fire}` → the key the player has fire on). */
export function keySegments(text: string, keyName: (action: Action) => string): { text: string; key: boolean }[] {
  const out: { text: string; key: boolean }[] = [];
  const re = /\{(\w+)\}/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), key: false });
    out.push({ text: keyName(m[1] as Action) || '(unbound)', key: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), key: false });
  return out;
}

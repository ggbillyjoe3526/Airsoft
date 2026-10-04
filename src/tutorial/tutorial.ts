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
 * writes it; pure, so it's tested without a page. A finished step shows its tick for TUTORIAL.doneTime, then the next
 * one starts. Without an optic, the aiming step becomes one that says how to fit one.
 */
export class TutorialTracker {
  readonly steps: readonly TutorialStep[];
  private index: number;
  /** The current step's goal so far: view turned (rad), or time aiming or reading (s). */
  private amount = 0;
  private lastYaw = Number.NaN;
  /** Seconds left showing the current step as done (0: not done yet). */
  private doneLeft = 0;

  constructor(steps: readonly TutorialStep[], canAim: boolean, start = 0) {
    this.steps = steps.map((s) => (!canAim && s.withoutOptic ? s.withoutOptic : s));
    this.index = Math.min(Math.max(0, start), this.steps.length);
  }

  /** The step under way (or showing its tick), or null once the tutorial is over. */
  get step(): TutorialStep | null {
    return this.steps[this.index] ?? null;
  }

  /** 0-based index of the step under way (steps.length once over). */
  get stepIndex(): number {
    return this.index;
  }

  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  /** The current step was just done and shows its tick. */
  get showingDone(): boolean {
    return this.doneLeft > 0;
  }

  /** After a simulation tick. Returns true when the step shown changed (done, or the next one started). */
  observe(v: TutorialView): boolean {
    const step = this.step;
    if (!step) return false;
    const p = v.player;
    const yawStep = Number.isNaN(this.lastYaw) ? 0 : Math.abs(wrap(p.yaw - this.lastYaw));
    this.lastYaw = p.yaw;
    if (this.doneLeft > 0) {
      this.doneLeft = Math.max(0, this.doneLeft - v.dt);
      if (this.doneLeft > 0) return false;
      this.index++;
      this.amount = 0;
      return true;
    }
    if (!this.goalMet(step, v, yawStep)) return false;
    this.doneLeft = TUTORIAL.doneTime;
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
        return p.crouchAmount >= 0.95;
      case 'lean':
        return Math.abs(p.lean) >= g.amount;
      case 'aim':
        if (p.aiming) this.amount += v.dt;
        return this.amount >= g.seconds;
      case 'read':
        this.amount += v.dt;
        return this.amount >= g.seconds;
      case 'reload':
        return v.events.some((e) => e.type === 'reloadEnd' && e.characterId === p.id);
      case 'hit':
        return v.events.some((e) => {
          if (e.type !== 'targetHit' || e.shooterId !== p.id) return false;
          const t = v.targets.find((x) => x.id === e.targetId);
          if (!t || t.distance < g.minDistance || (g.target && t.kind !== g.target)) return false;
          return g.slot === undefined || p.armament.active === g.slot;
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

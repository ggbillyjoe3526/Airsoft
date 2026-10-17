import type { Action } from '../config/controls';
import { TUTORIAL, type TutorialStep } from '../config/tutorial';
import type { BB } from '../sim/ballistics';
import type { Character } from '../sim/character';
import type { GameEvent } from '../sim/events';
import type { RangeTarget } from '../sim/rangeTargets';

/** What the tutorial looks at after each simulation tick. */
export interface TutorialView {
  dt: number;
  player: Character;
  events: readonly GameEvent[];
  targets: readonly RangeTarget[];
  /**
   * The BB pool's slots (GameState.bbs.bbs), read only, so a hit is told apart by the replica that fired its BB (KI1:
   * the switch-replica step); without it, a hit counts once the asked-for replica has fired this step.
   */
  bbs?: readonly BB[];
}

/**
 * The tutorial's progress (M16): which step is up, and whether it's done. Reads the simulation after each tick, never
 * writes it; pure, so it's tested without a page. A finished step shows its tick for TUTORIAL.doneTime while the next
 * one is already being checked, so nothing done in that moment is lost. Without an optic, the aiming step becomes one
 * that says how to fit one.
 */
export class TutorialTracker {
  readonly steps: readonly TutorialStep[];
  /** Each step's id as listed in TUTORIAL_STEPS (the aiming step keeps its id when it is played without an optic). */
  private readonly ids: readonly string[];
  /** The step whose goal is being checked (steps.length once all are done). */
  private index: number;
  /** The current goal so far: view turned (rad), time aiming or reading, or time since a sprint ended (s). */
  private amount = 0;
  /** The current goal so far: the player sprinted during this step (sprintShot goals). */
  private sprinted = false;
  /** The current goal so far: whether the player fired the replica in the goal's slot (hit goals with a slot). */
  private firedSlot = false;
  /** The current goal so far: the sides leaned out to (lean goals; TT2): 1 left, 2 right. */
  private leaned = 0;
  private lastYaw = Number.NaN;
  /** The step just finished, shown with its tick for `doneLeft` more seconds. */
  private doneIndex = -1;
  private doneLeft = 0;
  /** A jump or a skip moved the step since the last tick: the next observe reports a change, so the step is redrawn. */
  private moved = false;
  /**
   * Per BB pool slot: the serial of the player's BB fired from it and the replica slot (armament.active) that fired it
   * (KI1), so the switch-replica step counts only its own replica's BBs. Sized to the pool on the first view with BBs.
   */
  private firedSerial: Float64Array | null = null;
  private firedFrom: Int8Array | null = null;
  /** The highest serial of the player's BBs already noted in firedSerial. */
  private seenSerial = -1;

  /**
   * `start`: the step to begin at, by index, or by id (a saved step: an id still finds its lesson after a later build
   * adds or removes steps, audit POOL-14; an id no longer listed starts from the beginning). `slots`: the replicas
   * carried; a step asking for a slot the player doesn't have is left out (audit POOL-16), so a one-replica kit can
   * still finish.
   */
  constructor(steps: readonly TutorialStep[], canAim: boolean, start: number | string = 0, slots = Number.POSITIVE_INFINITY) {
    const kept = steps.filter((s) => !(s.goal.kind === 'hit' && s.goal.slot !== undefined && s.goal.slot >= slots));
    this.ids = kept.map((s) => s.id);
    this.steps = kept.map((s) => (!canAim && s.withoutOptic ? s.withoutOptic : s));
    const at = typeof start === 'string' ? Math.max(0, kept.findIndex((s) => s.id === start || s.withoutOptic?.id === start)) : start;
    this.index = Math.min(Math.max(0, at), this.steps.length);
  }

  /** The id (as listed in TUTORIAL_STEPS) of the step still to do, to save and resume at; '' once all are done. */
  get goalId(): string {
    return this.ids[this.index] ?? '';
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

  /**
   * How far a read step is through its time (0..1; TT1: the coach's bar, so the player sees the card moves on by
   * itself), or -1 when the step shown is not one being read.
   */
  get readProgress(): number {
    const step = this.steps[this.index];
    if (this.doneLeft > 0 || !step || step.goal.kind !== 'read') return -1;
    return Math.min(1, this.amount / step.goal.seconds);
  }

  get finished(): boolean {
    return this.index >= this.steps.length && this.doneLeft === 0;
  }

  /** The step shown was just done and shows its tick. */
  get showingDone(): boolean {
    return this.doneLeft > 0;
  }

  /**
   * Skips the step shown (audit POOL-14: the pause menu's Skip step): the next one starts at once, no tick shown. Past
   * the last step, the tutorial is over. While a finished step still shows its tick, the step after it hasn't been
   * seen yet: it comes up (with what was already done of it), not skipped too.
   */
  skip(): void {
    if (this.doneLeft > 0) {
      this.doneLeft = 0;
      this.doneIndex = -1;
      return;
    }
    this.jump(this.index + 1);
  }

  /**
   * Dev server and the smoke test's `e2e` build only (a no-op elsewhere; audit L-09): jumps to step `index` with `amount`
   * of its goal already done (radians turned, or seconds aiming or reading), so a test can reach the end without playing
   * every step. The next tick shows the new step.
   */
  debugJumpTo(index: number, amount = 0): void {
    if (!import.meta.env.DEV && import.meta.env.MODE !== 'e2e') return;
    this.jump(index, amount);
  }

  private jump(index: number, amount = 0): void {
    this.index = Math.min(Math.max(0, index), this.steps.length);
    this.amount = amount;
    this.firedSlot = false;
    this.sprinted = false;
    this.leaned = 0;
    this.doneIndex = -1;
    this.doneLeft = 0;
    this.moved = true;
  }

  /** After a simulation tick. Returns true when the step shown changed (done, or the next one started). */
  observe(v: TutorialView): boolean {
    let changed = this.moved;
    this.moved = false;
    const yawStep = Number.isNaN(this.lastYaw) ? 0 : Math.abs(wrap(v.player.yaw - this.lastYaw));
    this.lastYaw = v.player.yaw;
    if (this.doneLeft > 0) {
      this.doneLeft = Math.max(0, this.doneLeft - v.dt);
      changed = this.doneLeft === 0;
    }
    this.noteShots(v);
    const step = this.steps[this.index];
    if (!step || !this.goalMet(step, v, yawStep)) return changed;
    this.doneIndex = this.index++;
    this.doneLeft = TUTORIAL.doneTime;
    this.amount = 0;
    this.firedSlot = false;
    this.sprinted = false;
    this.leaned = 0;
    return true;
  }

  /** On a tick the player fired: notes which replica fired each of their new BBs (firedFrom). Nothing allocated after the first. */
  private noteShots(v: TutorialView): void {
    const bbs = v.bbs;
    const p = v.player;
    if (!bbs) return;
    let fired = false;
    for (const e of v.events) if (e.type === 'shot' && e.characterId === p.id) fired = true;
    if (!fired) return;
    if (!this.firedSerial || this.firedSerial.length !== bbs.length) {
      this.firedSerial = new Float64Array(bbs.length).fill(-1);
      this.firedFrom = new Int8Array(bbs.length).fill(-1);
    }
    let seen = this.seenSerial;
    for (let i = 0; i < bbs.length; i++) {
      const b = bbs[i]!;
      if (b.ownerId !== p.id || b.serial <= this.seenSerial) continue;
      this.firedSerial[i] = b.serial;
      this.firedFrom![i] = p.armament.active;
      if (b.serial > seen) seen = b.serial;
    }
    this.seenSerial = seen;
  }

  /**
   * The replica slot that fired the player's BB which made hit `e` (it stopped where the event says, BallisticsConfig's
   * targetHit), or -1 when it can't be told (no BBs in the view, or a BB fired before the tracker saw it).
   */
  private hitFrom(v: TutorialView, e: { position: { x: number; y: number; z: number } }): number {
    const bbs = v.bbs;
    if (!bbs || !this.firedSerial) return -1;
    for (let i = 0; i < bbs.length; i++) {
      const b = bbs[i]!;
      if (b.active || b.ownerId !== v.player.id || b.position.x !== e.position.x || b.position.y !== e.position.y || b.position.z !== e.position.z) continue;
      return this.firedSerial[i] === b.serial ? this.firedFrom![i]! : -1;
    }
    return -1;
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
        if (p.lean <= -g.amount) this.leaned |= 1;
        if (p.lean >= g.amount) this.leaned |= 2;
        return this.leaned === 3;
      case 'aim':
        if (p.aiming) this.amount += v.dt;
        return this.amount >= g.seconds;
      case 'read':
        // Reading starts once the card is up, not while the last step's tick still shows.
        if (this.doneLeft === 0) this.amount += v.dt;
        return this.amount >= g.seconds;
      case 'reload':
        return v.events.some((e) => e.type === 'reloadEnd' && e.characterId === p.id);
      case 'fireMode':
        return v.events.some((e) => e.type === 'fireMode' && e.characterId === p.id);
      case 'vault':
        return v.events.some((e) => e.type === 'footstep' && e.kind === 'vault' && e.characterId === p.id);
      case 'sprintShot':
        if (p.sprinting) {
          this.sprinted = true;
          this.amount = 0;
          return false;
        }
        this.amount += v.dt;
        return this.sprinted && this.amount <= g.within && v.events.some((e) => e.type === 'shot' && e.characterId === p.id);
      case 'hit': {
        // With the BBs in view (KI1), a hit counts only from a BB the asked-for replica fired, so one from the first
        // replica still in flight after the switch doesn't. Without them, once you've fired that replica this step.
        const byBB = g.slot !== undefined && v.bbs !== undefined;
        if (g.slot !== undefined && !byBB && !this.firedSlot) {
          this.firedSlot = p.armament.active === g.slot && v.events.some((e) => e.type === 'shot' && e.characterId === p.id);
        }
        if (g.slot !== undefined && !byBB && !this.firedSlot) return false;
        return v.events.some((e) => {
          if (e.type !== 'targetHit' || e.shooterId !== p.id || (byBB && this.hitFrom(v, e) !== g.slot)) return false;
          const t = v.targets.find((x) => x.id === e.targetId);
          return t !== undefined && t.distance >= g.minDistance && (!g.target || t.kind === g.target);
        });
      }
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

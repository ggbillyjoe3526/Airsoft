import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUTORIAL_STEPS, tutorialSteps } from '../config/tutorial';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { createRangeTargets } from '../sim/rangeTargets';
import { vec3 } from '../sim/vec';
import { TutorialTracker } from '../tutorial/tutorial';
import { CoachPanel } from './coachPanel';
import { FakeElement } from './testSupport';

/** TT1 QA: the coach's read-progress bar against a fake page, and the tracker's readProgress feeding it. */

const DT = 1 / 60;
let transformWrites: string[] = [];

beforeEach(() => {
  transformWrites = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      const el = new FakeElement(tag);
      el.style = new Proxy(el.style, {
        set: (t, p, v) => {
          if (p === 'transform') transformWrites.push(String(v));
          return Reflect.set(t, p, v);
        },
      });
      return el;
    },
    createTextNode: (text: string) => Object.assign(new FakeElement('#text'), { textContent: text }),
  });
});
afterEach(() => void vi.unstubAllGlobals());

function panel() {
  const parent = new FakeElement('div');
  const coach = new CoachPanel(parent as unknown as HTMLElement, () => 'K');
  const root = parent.children[0]!;
  const timer = root.children.find((c) => c.className === 'coach-timer')!;
  return { coach, timer, fill: timer.children[0]! };
}

describe('CoachPanel.setReadProgress (TT1)', () => {
  it('starts with the bar hidden and no fill written', () => {
    const { timer } = panel();
    expect(timer.hidden).toBe(true);
    expect(transformWrites).toEqual([]);
  });

  it('hides the bar for a negative progress, and shows it from 0', () => {
    const { coach, timer } = panel();
    coach.setReadProgress(0);
    expect(timer.hidden).toBe(false);
    coach.setReadProgress(-1);
    expect(timer.hidden).toBe(true);
    coach.setReadProgress(-0.001);
    expect(timer.hidden).toBe(true);
  });

  it('scales the fill to the progress, in hundredths', () => {
    const { coach, fill } = panel();
    coach.setReadProgress(0.5);
    expect(fill.style.transform).toBe('scaleX(0.5)');
    coach.setReadProgress(1);
    expect(fill.style.transform).toBe('scaleX(1)');
  });

  it('writes the transform only when the hundredth changes', () => {
    const { coach } = panel();
    coach.setReadProgress(0.5);
    const n = transformWrites.length;
    coach.setReadProgress(0.5);
    coach.setReadProgress(0.501);
    coach.setReadProgress(0.504);
    expect(transformWrites.length).toBe(n);
    coach.setReadProgress(0.52);
    expect(transformWrites.length).toBe(n + 1);
  });

  it('writes nothing while hidden, however many times it is told so', () => {
    const { coach } = panel();
    coach.setReadProgress(0.3);
    coach.setReadProgress(-1);
    const n = transformWrites.length;
    for (let i = 0; i < 50; i++) coach.setReadProgress(-1);
    expect(transformWrites.length).toBe(n);
  });

  it('redraws the fill when shown again after being hidden at the same value', () => {
    const { coach, timer, fill } = panel();
    coach.setReadProgress(0.4);
    coach.setReadProgress(-1);
    coach.setReadProgress(0.4);
    expect(timer.hidden).toBe(false);
    expect(fill.style.transform).toBe('scaleX(0.4)');
  });
});

describe('TutorialTracker.readProgress beyond the basic walk (TT1)', () => {
  const tracker = (steps = TUTORIAL_STEPS) => {
    const player = createCharacter(0, vec3(0, 0, 2), 0, LOADOUT, 0);
    const targets = createRangeTargets();
    const t = new TutorialTracker(steps, true);
    return { t, tick: () => t.observe({ dt: DT, player, events: [], targets }) };
  };

  it('fills over the same seconds with the levelling line joined, and the line adds no wait', () => {
    const { t, tick } = tracker(tutorialSteps(true));
    const i = t.steps.findIndex((s) => s.id === 'match');
    expect(t.steps[i]!.text).toContain('XP');
    const goal = t.steps[i]!.goal;
    if (goal.kind !== 'read') throw new Error('match is read');
    t.debugJumpTo(i);
    tick();
    for (let k = 0; k < goal.seconds / 4 / DT; k++) tick();
    expect(t.readProgress).toBeCloseTo(0.25, 1);
  });

  it('is -1 on every non-read step and in 0..1 on every read step', () => {
    const { t, tick } = tracker();
    for (let i = 0; i < t.steps.length; i++) {
      t.debugJumpTo(i);
      tick();
      const p = t.readProgress;
      if (t.steps[i]!.goal.kind === 'read') expect(p, t.steps[i]!.id).toBeGreaterThanOrEqual(0);
      else expect(p, t.steps[i]!.id).toBe(-1);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('restarts from empty on the next read card after a skip, and is -1 once the tutorial is over', () => {
    const { t, tick } = tracker();
    const hits = t.steps.findIndex((s) => s.id === 'hits');
    t.debugJumpTo(hits);
    for (let k = 0; k < 60; k++) tick();
    expect(t.readProgress).toBeGreaterThan(0.05);
    t.skip();
    tick();
    const next = t.steps[t.goalIndex]!;
    if (next.goal.kind === 'read') expect(t.readProgress).toBeLessThan(0.05);
    else expect(t.readProgress).toBe(-1);
    t.debugJumpTo(t.steps.length);
    tick();
    expect(t.readProgress).toBe(-1);
  });

  it('is -1 while the done tick shows, and skip during the tick brings the next card up empty', () => {
    const { t, tick } = tracker();
    const i = t.steps.findIndex((s) => s.id === 'orderWheel');
    const goal = t.steps[i]!.goal;
    if (goal.kind !== 'read') throw new Error('read');
    t.debugJumpTo(i, goal.seconds - 0.01);
    for (let k = 0; k < 3; k++) tick();
    expect(t.showingDone).toBe(true);
    expect(t.readProgress).toBe(-1);
    t.skip();
    expect(t.showingDone).toBe(false);
  });
});

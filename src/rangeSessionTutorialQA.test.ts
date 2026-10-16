import { describe, expect, it, vi } from 'vitest';
import { TUTORIAL, TUTORIAL_STEPS } from './config/tutorial';
import { LOADOUT } from './config/replicas';
import { EventLog } from './core/eventLog';
import { RangeSession } from './rangeSession';
import { createBBPool } from './sim/ballistics';
import { createCharacter } from './sim/character';
import { createChallenge } from './sim/rangeChallenge';
import { createRangeTargets } from './sim/rangeTargets';
import { vec3 } from './sim/vec';
import { TutorialTracker } from './tutorial/tutorial';

/**
 * QA for M80 acceptance 3: the "Tutorial complete" pop-up comes only when the tutorial is played to its end. A
 * RangeSession needs a renderer and physics, so the real class is driven here on a bare object holding just what its
 * tutorial methods touch (the tracker is the real one).
 */
const DT = 1 / 60;
function bare(from?: number | string) {
  const player = createCharacter(0, vec3(0, 0, 2), 0, LOADOUT, 0);
  const t = new TutorialTracker(TUTORIAL_STEPS, true, from);
  const coach = { show: vi.fn(), setVisible: vi.fn(), setShot: vi.fn(), setReadProgress: vi.fn() };
  const showcase = { set: vi.fn(), setVisible: vi.fn() };
  const s = Object.create(RangeSession.prototype) as Record<string, unknown> & RangeSession;
  Object.assign(s, {
    tutorial: t,
    coach,
    showcase,
    readout: { setVisible: vi.fn(), set: vi.fn() },
    combat: { afterTick: vi.fn() },
    targets: { afterTick: vi.fn() },
    eventLog: new EventLog(),
    state: { tick: 0, events: [], targets: createRangeTargets(), bbs: createBBPool(4) },
    player,
    tutorialView: { dt: DT, player, events: [], targets: [] },
    playing: true,
    savedStep: '',
    tutorialFinishedOwed: false,
    tutorialFinishedSeen: false,
    completeDue: false,
    completePopup: false,
    challenge: createChallenge(0),
  });
  const tick = () => (s as unknown as { afterTick(): void }).afterTick();
  return { s, t, tick, coach, showcase };
}

describe('M80: when the Tutorial complete pop-up is due', () => {
  it('is not due in free practice (no tutorial), nor while a step is still to do', () => {
    const { s, tick } = bare();
    expect(s.takeResultDue()).toBe(false);
    expect(s.takeTutorialComplete()).toBe(false);
    tick();
    expect(s.takeResultDue()).toBe(false);
    expect(s.takeTutorialComplete()).toBe(false);
  });

  it('is due once, after the last step is played to its end: the mouse is given back, then the pop-up shows', () => {
    const last = TUTORIAL_STEPS.length - 1;
    const { s, t, tick } = bare(last);
    const goal = t.step!.goal;
    if (goal.kind !== 'read') throw new Error('the last step is a read step');
    for (let i = 0; i < (goal.seconds + TUTORIAL.doneTime + 0.5) / DT && !t.finished; i++) tick();
    expect(t.finished).toBe(true);
    expect(s.takeResultDue()).toBe(true);
    expect(s.takeResultDue()).toBe(false); // once
    expect(s.takeTutorialComplete()).toBe(true);
    expect(s.takeTutorialComplete()).toBe(false);
  });

  it('an Esc that came first (pop-up shown without the mouse being given back) does not give it back again', () => {
    const last = TUTORIAL_STEPS.length - 1;
    const { s, t, tick } = bare(last);
    for (let i = 0; i < 100000 && !t.finished; i++) tick();
    expect(s.takeTutorialComplete()).toBe(true);
    expect(s.takeResultDue()).toBe(false);
  });

  it('is not due after Skip tutorial, even from the last step', () => {
    for (const from of [0, TUTORIAL_STEPS.length - 1]) {
      const { s, t } = bare(from);
      s.endTutorial();
      expect(t.finished).toBe(true);
      expect(s.takeResultDue()).toBe(false);
      expect(s.takeTutorialComplete()).toBe(false);
    }
  });

  it('is not due when a middle step is skipped', () => {
    const { s, t } = bare(0);
    s.skipTutorialStep();
    expect(t.finished).toBe(false);
    expect(s.takeTutorialComplete()).toBe(false);
  });

  it('after the last step is skipped with Skip step, the pause shows the pop-up (as the builder intends) but the mouse is not re-asked', () => {
    const { s, t } = bare(TUTORIAL_STEPS.length - 1);
    s.skipTutorialStep();
    expect(t.finished).toBe(true);
    expect(s.takeResultDue()).toBe(false);
    expect(s.takeTutorialComplete()).toBe(true);
  });

  it('a step that moves redraws the coach and the showcase (the scoreboard and wheel steps open their showcase)', () => {
    const iSb = TUTORIAL_STEPS.findIndex((x) => x.id === 'scoreboard');
    const { s, showcase, coach } = bare(iSb - 1);
    s.skipTutorialStep();
    expect(coach.show).toHaveBeenCalled();
    expect(showcase.set).toHaveBeenLastCalledWith('scoreboard');
    s.skipTutorialStep();
    expect(showcase.set).toHaveBeenLastCalledWith('orderWheel');
    s.skipTutorialStep();
    expect(showcase.set).toHaveBeenLastCalledWith(null);
  });
});

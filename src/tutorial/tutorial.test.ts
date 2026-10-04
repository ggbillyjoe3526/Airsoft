import { describe, expect, it } from 'vitest';
import { TUTORIAL, TUTORIAL_STEPS } from '../config/tutorial';
import { BALLISTICS } from '../config/ballistics';
import { AEG, LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { hopUpReach } from '../sim/hopUp';
import { createRangeTargets } from '../sim/rangeTargets';
import { vec3 } from '../sim/vec';
import { keySegments, TutorialTracker } from './tutorial';

const DT = 1 / 60;

function setup(canAim = true) {
  const player = createCharacter(0, vec3(0, 0, 2), 0, LOADOUT, 0);
  const targets = createRangeTargets();
  const t = new TutorialTracker(TUTORIAL_STEPS, canAim);
  const tick = (events: GameEvent[] = []) => t.observe({ dt: DT, player, events, targets });
  /** Ticks until the step shown changes to the next one. */
  const finishStep = () => {
    for (let i = 0; i < (TUTORIAL.doneTime + 0.1) / DT; i++) tick();
  };
  return { player, targets, t, tick, finishStep };
}

const hit = (targetId: number, shooterId = 0): GameEvent => ({ type: 'targetHit', targetId, kind: 'steel', shooterId, position: vec3(), ricochet: false });

describe('the tutorial (M16)', () => {
  it('walks through every step in order, each finished by doing what it asks', () => {
    const { player, targets, t, tick, finishStep } = setup();
    const ids: string[] = [];
    const expectStep = (id: string) => {
      expect(t.step?.id).toBe(id);
      ids.push(id);
    };

    expectStep('look');
    tick();
    for (let i = 0; i < 20; i++) {
      player.yaw += 0.1;
      tick();
    }
    expect(t.showingDone).toBe(true);
    finishStep();

    expectStep('walk');
    tick();
    expect(t.showingDone).toBe(false);
    player.position.z = 0.2;
    tick();
    finishStep();

    expectStep('steel');
    const figure = targets.find((x) => x.kind === 'figure' && x.distance === 10)!;
    const steel = targets.find((x) => x.kind === 'steel')!;
    tick([hit(figure.id)]); // not steel
    tick([hit(steel.id, 5)]); // not yours
    expect(t.showingDone).toBe(false);
    tick([hit(steel.id)]);
    finishStep();

    expectStep('far');
    tick([hit(figure.id)]); // only 10 m
    tick([hit(targets.find((x) => x.kind === 'figure' && x.distance === 40)!.id)]); // inside the stock hop-up's reach
    expect(t.showingDone).toBe(false);
    tick([hit(targets.find((x) => x.kind === 'figure' && x.distance === 50)!.id)]);
    finishStep();

    expectStep('reload');
    tick([{ type: 'reloadEnd', characterId: 0, replicaId: 'aeg' }]);
    finishStep();

    expectStep('selector');
    tick([{ type: 'fireMode', characterId: 3, replicaId: 'aeg', mode: 'semi' }]); // not yours
    expect(t.showingDone).toBe(false);
    tick([{ type: 'fireMode', characterId: 0, replicaId: 'aeg', mode: 'semi' }]);
    finishStep();

    expectStep('aim');
    player.aiming = true;
    for (let i = 0; i < 1.1 / DT; i++) tick();
    player.aiming = false;
    finishStep();

    expectStep('crouch');
    player.crouchAmount = 1;
    tick();
    finishStep();

    expectStep('lean');
    player.lean = -0.9;
    tick();
    player.lean = 0;
    finishStep();

    expectStep('sprint');
    const fired: GameEvent = { type: 'shot', characterId: 0, replicaId: 'aeg', position: vec3() };
    tick([fired]); // no sprint yet
    player.sprinting = true;
    tick();
    player.sprinting = false;
    for (let i = 0; i < 1.6 / DT; i++) tick();
    tick([fired]); // too long after the sprint
    expect(t.showingDone).toBe(false);
    player.sprinting = true;
    tick();
    player.sprinting = false;
    for (let i = 0; i < 0.3 / DT; i++) tick();
    tick([fired]);
    expect(t.showingDone).toBe(true);
    finishStep();

    expectStep('secondary');
    const shot: GameEvent = { type: 'shot', characterId: 0, replicaId: 'x', position: vec3() };
    tick([shot, hit(steel.id)]); // still on the first replica
    player.armament.active = 1;
    tick([hit(steel.id)]); // switched, but that BB came from the first one
    expect(t.showingDone).toBe(false);
    tick([shot]);
    player.armament.active = 0; // switched back while the second replica's BB flies
    tick([hit(steel.id)]);
    finishStep();

    expectStep('hits');
    for (let i = 0; i < 8.1 / DT; i++) tick();
    finishStep();

    expectStep('match');
    for (let i = 0; i < 14.1 / DT; i++) tick();
    finishStep();
    expect(t.finished).toBe(true);
    expect(t.step).toBeNull();
    expect(ids).toEqual(TUTORIAL_STEPS.map((s) => s.id));
  });

  it('keeps checking the next step while the last one shows its tick, so nothing done then is lost', () => {
    const { player, t, tick, finishStep } = setup();
    for (let i = 0; i < 20; i++) {
      player.yaw += 0.1;
      tick();
    }
    expect(t.showingDone).toBe(true);
    expect(t.step?.id).toBe('look');
    player.position.z = 0; // at the line straight away
    tick();
    expect(t.step?.id).toBe('walk'); // its tick shows now
    expect(t.showingDone).toBe(true);
    finishStep();
    expect(t.step?.id).toBe('steel');
    expect(t.goalIndex).toBe(2);
  });

  it('swaps aiming down the sight for how to fit an optic when the replica has none, and can start part way', () => {
    const ids = new TutorialTracker(TUTORIAL_STEPS, false).steps.map((s) => s.id);
    expect(ids).not.toContain('aim');
    expect(ids.indexOf('optics')).toBe(TUTORIAL_STEPS.findIndex((s) => s.id === 'aim'));
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 4);
    expect(t.step?.id).toBe(TUTORIAL_STEPS[4]!.id);
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 99).finished).toBe(true);
  });

  it('counts turning the view across the wrap from +π to -π as a small turn', () => {
    const { player, t, tick } = setup();
    player.yaw = Math.PI - 0.01;
    tick();
    player.yaw = -Math.PI + 0.01;
    tick();
    expect(t.showingDone).toBe(false);
  });

  it('jumps to a step part done for the smoke test (debug hook, audit L-09)', () => {
    const { t, tick } = setup();
    const last = t.steps.length - 1;
    const goal = t.steps[last]!.goal;
    if (goal.kind !== 'read') throw new Error('the last step is read to its end');
    t.debugJumpTo(last, goal.seconds - 1.5 * DT); // two ticks from its end
    expect(t.stepIndex).toBe(last);
    expect(t.finished).toBe(false);
    tick();
    tick();
    expect(t.goalIndex).toBe(t.steps.length);
    for (let i = 0; i < (TUTORIAL.doneTime + 0.1) / DT; i++) tick();
    expect(t.finished).toBe(true);
  });

  it('shows the keys a step names as the player has them bound', () => {
    const names: Record<string, string> = { fire: 'Left mouse', reload: 'R' };
    expect(keySegments('Press {fire}, then {reload}.', (a) => names[a] ?? '')).toEqual([
      { text: 'Press ', key: false },
      { text: 'Left mouse', key: true },
      { text: ', then ', key: false },
      { text: 'R', key: true },
      { text: '.', key: false },
    ]);
    expect(keySegments('{jump}', () => '')).toEqual([{ text: '(unbound)', key: true }]);
  });

  it("gives the stock rifle's hop-up reach as the game works it out, short of the far step's figure (audit L-35)", () => {
    const far = TUTORIAL_STEPS.find((x) => x.id === 'far')!;
    const reach = hopUpReach(AEG, AEG.hopUpDial, BALLISTICS).onTargetTo;
    // A retune of the ballistics or the hop-up that moves the reach has to update the text.
    expect(far.text).toContain(`(the stock rifle: about ${Math.round(reach)} m)`);
    // The step asks for a hit beyond it, so it teaches aiming high or turning the hop-up up.
    if (far.goal.kind !== 'hit') throw new Error('the far step asks for a hit');
    expect(far.goal.minDistance).toBeGreaterThan(reach);
  });

  it('names only real key bindings in its text', async () => {
    const { DEFAULT_BINDINGS } = await import('../config/controls');
    for (const s of TUTORIAL_STEPS.flatMap((x) => (x.withoutOptic ? [x, x.withoutOptic] : [x]))) {
      for (const m of s.text.matchAll(/\{(\w+)\}/g)) expect(Object.keys(DEFAULT_BINDINGS), s.id).toContain(m[1]);
    }
  });
});

describe('skipping and resuming the tutorial (audit POOL-14, POOL-16)', () => {
  it('skips the step under way straight to the next, and past the last ends it', () => {
    const t = new TutorialTracker(TUTORIAL_STEPS, true);
    t.skip();
    expect(t.step?.id).toBe('walk');
    expect(t.showingDone).toBe(false);
    expect(t.goalIndex).toBe(1);
    for (let i = 1; i < TUTORIAL_STEPS.length; i++) t.skip();
    expect(t.finished).toBe(true);
    t.skip();
    expect(t.goalIndex).toBe(TUTORIAL_STEPS.length);
  });

  it('resumes at a saved step by its id, whatever steps a later build adds before it', () => {
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 'far');
    expect(t.step?.id).toBe('far');
    expect(t.goalId).toBe('far');
    // A build with a new first step still resumes at the same lesson.
    const added = [{ ...TUTORIAL_STEPS[0]!, id: 'newFirst' }, ...TUTORIAL_STEPS];
    expect(new TutorialTracker(added, true, 'far').step?.id).toBe('far');
    // The aiming step keeps its listed id when played as "fit an optic".
    const noOptic = new TutorialTracker(TUTORIAL_STEPS, false, 'aim');
    expect([noOptic.step?.id, noOptic.goalId]).toEqual(['optics', 'aim']);
    // An id no longer listed starts from the beginning; an old saved index still works; done reads ''.
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 'gone').goalIndex).toBe(0);
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 3).step?.id).toBe(TUTORIAL_STEPS[3]!.id);
    expect(new TutorialTracker(TUTORIAL_STEPS, true, TUTORIAL_STEPS.length).goalId).toBe('');
  });

  it("doesn't skip the next step, unseen, when Skip is pressed while a finished step still shows its tick", () => {
    const { player, t, tick } = setup();
    for (let i = 0; i < 20; i++) {
      player.yaw += 0.1;
      tick();
    }
    expect([t.step?.id, t.showingDone]).toEqual(['look', true]);
    t.skip();
    expect([t.step?.id, t.showingDone]).toEqual(['walk', false]);
    t.skip();
    expect(t.step?.id).toBe('steel');
  });

  it('leaves out the switch-replica step for a player carrying one replica', () => {
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 0, 1).steps.map((s) => s.id)).not.toContain('secondary');
    expect(new TutorialTracker(TUTORIAL_STEPS, true, 0, 2).steps.map((s) => s.id)).toContain('secondary');
  });
});

import { describe, expect, it } from 'vitest';
import { TUTORIAL, TUTORIAL_STEPS } from '../config/tutorial';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
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
    expect(t.showingDone).toBe(false);
    tick([hit(targets.find((x) => x.kind === 'figure' && x.distance === 40)!.id)]);
    finishStep();

    expectStep('reload');
    tick([{ type: 'reloadEnd', characterId: 0, replicaId: 'aeg' }]);
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
    finishStep();

    expectStep('secondary');
    tick([hit(steel.id)]); // still on the first replica
    expect(t.showingDone).toBe(false);
    player.armament.active = 1;
    tick([hit(steel.id)]);
    finishStep();

    expectStep('hits');
    for (let i = 0; i < 12.1 / DT; i++) tick();
    finishStep();
    expect(t.finished).toBe(true);
    expect(t.step).toBeNull();
    expect(ids).toEqual(TUTORIAL_STEPS.map((s) => s.id));
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

  it('names only real key bindings in its text', async () => {
    const { DEFAULT_BINDINGS } = await import('../config/controls');
    for (const s of TUTORIAL_STEPS.flatMap((x) => (x.withoutOptic ? [x, x.withoutOptic] : [x]))) {
      for (const m of s.text.matchAll(/\{(\w+)\}/g)) expect(Object.keys(DEFAULT_BINDINGS), s.id).toContain(m[1]);
    }
  });
});

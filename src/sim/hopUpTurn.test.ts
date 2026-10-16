import { describe, expect, it } from 'vitest';
import { BALLISTICS } from '../config/ballistics';
import { HOP_UP, LOADOUT } from '../config/replicas';
import { type ArmamentContext, createArmament, type Muzzle, stepArmament } from './armament';
import { createBBPool } from './ballistics';
import { createCommand } from './commands';
import type { GameEvent } from './events';
import { createRng } from './rng';
import { vec3 } from './vec';

/** Dev 6 playtest item 15: the hop-up turned in play, through the command (PlayerCommand.hopUpSteps). */
function setup() {
  const events: GameEvent[] = [];
  const ctx: ArmamentContext = { ballistics: BALLISTICS, bbs: createBBPool(64), rng: createRng(3), query: { raycastStatic: () => -1 }, events };
  const a = createArmament(LOADOUT);
  const muzzle: Muzzle = { eye: vec3(0, 1.6, 0), yaw: 0, pitch: 0, spreadScale: 1, kickScale: 1 };
  const step = (steps: number, holster = false) => {
    const cmd = createCommand();
    cmd.hopUpSteps = steps;
    cmd.holster = holster;
    events.length = 0;
    stepArmament(1, a, cmd, muzzle, true, ctx, 1 / 60);
    return events.filter((e) => e.type === 'hopUp');
  };
  return { a, step };
}

describe('turning the hop-up in play', () => {
  it('leaves the dial alone with no notch asked for (bots never ask)', () => {
    const { a, step } = setup();
    expect(createCommand().hopUpSteps).toBe(0);
    const before = [...a.hopUps];
    expect(step(0)).toHaveLength(0);
    expect(a.hopUps).toEqual(before);
  });

  it('turns the replica in hand a notch (HOP_UP.dialStep) per step, up or down, and says so', () => {
    const { a, step } = setup();
    const start = a.hopUps[0]!;
    const up = step(1);
    expect(a.hopUps[0]).toBeCloseTo(start + HOP_UP.dialStep, 6);
    expect(up).toEqual([{ type: 'hopUp', characterId: 1, replicaId: LOADOUT[0]!.id, dial: a.hopUps[0], moved: true }]);
    step(-3);
    expect(a.hopUps[0]).toBeCloseTo(start - 2 * HOP_UP.dialStep, 6);
    // The other replica's dial is its own.
    expect(a.hopUps[1]).toBe(LOADOUT[1]!.hopUpDial);
  });

  it('stays on the dial\'s steps and within its range, and says it did not move at an end', () => {
    const { a, step } = setup();
    a.hopUps[0] = 0.333;
    step(0);
    step(1);
    expect(Math.round(a.hopUps[0]! / HOP_UP.dialStep) * HOP_UP.dialStep).toBeCloseTo(a.hopUps[0]!, 9);
    step(100);
    expect(a.hopUps[0]).toBe(HOP_UP.maxDial);
    const again = step(1);
    expect(a.hopUps[0]).toBe(HOP_UP.maxDial);
    expect(again[0]).toMatchObject({ moved: false, dial: HOP_UP.maxDial });
    step(-100);
    expect(a.hopUps[0]).toBe(HOP_UP.minDial);
  });

  it('needs the replica in hand: holstered, the dial does not turn', () => {
    const { a, step } = setup();
    step(0, true);
    expect(a.holstered).toBe(true);
    const before = a.hopUps[0];
    expect(step(2)).toHaveLength(0);
    expect(a.hopUps[0]).toBe(before);
  });
});

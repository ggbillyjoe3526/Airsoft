import { describe, expect, it } from 'vitest';
import { createCommand } from '../sim/commands';
import { fillScriptedCommand, type ScriptStep, stepAt } from './scriptedInput';

const script: readonly ScriptStep[] = [
  { fromTick: 0, forward: 1 },
  { fromTick: 60, forward: 1, sprint: true, turn: 1 },
  { fromTick: 120, reload: true, crouch: true, fire: true },
  { fromTick: 180, switchTo: 1, jump: true },
  { fromTick: 240, use: true },
  { fromTick: 300 },
];

describe('scripted input', () => {
  it('picks the step in force at a tick', () => {
    expect(stepAt(script, 0)?.forward).toBe(1);
    expect(stepAt(script, 59)?.sprint).toBeUndefined();
    expect(stepAt(script, 60)?.sprint).toBe(true);
    expect(stepAt(script, 200)?.switchTo).toBe(1);
    expect(stepAt([{ fromTick: 10 }], 5)).toBeNull();
  });

  it('fills the command from the step and turns the view by the rate', () => {
    const cmd = createCommand();
    const yaw = fillScriptedCommand(script, 70, 0.5, 1 / 60, cmd);
    expect(cmd.forward).toBe(1);
    expect(cmd.sprint).toBe(true);
    expect(cmd.yaw).toBeCloseTo(0.5 + 1 / 60);
    expect(yaw).toBe(cmd.yaw);
    expect(cmd.fire).toBe(false);
  });

  it('fires one-shot actions on the first tick of their step only', () => {
    const cmd = createCommand();
    fillScriptedCommand(script, 120, 0, 1 / 60, cmd);
    expect(cmd.reload).toBe(true);
    expect(cmd.crouch).toBe(true);
    fillScriptedCommand(script, 121, 0, 1 / 60, cmd);
    expect(cmd.reload).toBe(false);
    expect(cmd.crouch).toBe(true);
    fillScriptedCommand(script, 180, 0, 1 / 60, cmd);
    expect(cmd.switchTo).toBe(1);
    expect(cmd.jump).toBe(true);
    fillScriptedCommand(script, 181, 0, 1 / 60, cmd);
    expect(cmd.switchTo).toBe(-1);
    expect(cmd.jump).toBe(false);
  });

  it('holds Use for the whole of its step and lets go after it (audit UI-05)', () => {
    const cmd = createCommand();
    fillScriptedCommand(script, 239, 0, 1 / 60, cmd);
    expect(cmd.use).toBe(false);
    fillScriptedCommand(script, 240, 0, 1 / 60, cmd);
    expect(cmd.use).toBe(true);
    fillScriptedCommand(script, 299, 0, 1 / 60, cmd);
    expect(cmd.use).toBe(true);
    fillScriptedCommand(script, 300, 0, 1 / 60, cmd);
    expect(cmd.use).toBe(false);
  });

  it('stands still before the script starts and clears what the step leaves out', () => {
    const cmd = createCommand();
    cmd.fire = true;
    cmd.lean = 1;
    cmd.use = true;
    fillScriptedCommand([{ fromTick: 10, fire: true }], 3, 0, 1 / 60, cmd);
    expect(cmd.fire).toBe(false);
    expect(cmd.use).toBe(false);
    expect(cmd.lean).toBe(0);
    expect(cmd.forward).toBe(0);
  });
});

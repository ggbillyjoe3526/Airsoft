import { describe, expect, it } from 'vitest';
import type { Action } from '../config/controls';
import { REBINDABLE } from '../config/controls';
import { MOVEMENT } from '../config/movement';
import { createCommand } from '../sim/commands';
import type { Keyboard } from './keyboard';
import { KeyBindings } from './keyBindings';
import { PlayerInput } from './playerInput';
import type { PointerLock } from './pointerLock';
import { fillScriptedCommand } from './scriptedInput';

/** M92 (acceptance 1): key 3 holsters, rebindable; how PlayerInput latches it against the slot keys and a toggled aim. */

function fakeKeyboard() {
  const down = new Set<Action>();
  const pressed = new Map<Action, number>();
  const kb = { isDown: (a: Action) => down.has(a), wasPressed: (a: Action) => pressed.has(a), pressCount: (a: Action) => pressed.get(a) ?? 0 } as unknown as Keyboard;
  return {
    kb,
    press(a: Action) {
      down.add(a);
      pressed.set(a, (pressed.get(a) ?? 0) + 1);
    },
    release(a: Action) {
      down.delete(a);
    },
    endFrame() {
      pressed.clear();
    },
  };
}

function setup(wheel = 0) {
  const keys = fakeKeyboard();
  let steps = wheel;
  const pointer = { consumeDelta: () => {}, consumeWheelSteps: () => ((s) => ((steps = 0), s))(steps) } as unknown as PointerLock;
  const input = new PlayerInput(keys.kb, pointer, MOVEMENT);
  const cmd = createCommand();
  /** One render frame (the keys pressed in `act`) and, if `tick`, a simulation tick after it. */
  const frame = (act?: () => void, tick = true) => {
    act?.();
    input.update(0, 2);
    keys.endFrame();
    if (!tick) return null;
    input.fillCommand(cmd);
    return { ...cmd };
  };
  return { keys, input, frame, cmd, wheelSteps: (n: number) => (steps = n) };
}

describe('the holster key (acceptance 1)', () => {
  it('is Digit3 by default, listed among the rebindable keys, and rebinds like the rest', () => {
    const b = new KeyBindings(null);
    expect(b.codes('holster')).toEqual(['Digit3']);
    expect(b.actionOf('Digit3')).toBe('holster');
    expect(REBINDABLE.some((r) => r.action === 'holster')).toBe(true);
    expect(b.rebind('holster', 'KeyH')).toBe(true);
    expect(b.codes('holster')).toEqual(['KeyH']);
    expect(b.actionOf('KeyH')).toBe('holster');
  });

  it('sets cmd.holster for one tick on a press, however long the key stays down', () => {
    const { keys, frame } = setup();
    expect(frame()!.holster).toBe(false);
    expect(frame(() => keys.press('holster'))!.holster).toBe(true);
    expect(frame()!.holster).toBe(false);
  });

  it('keeps a press made between ticks until the next tick takes it, once', () => {
    const { keys, frame } = setup();
    frame(() => keys.press('holster'), false);
    expect(frame(undefined, true)!.holster).toBe(true);
    expect(frame()!.holster).toBe(false);
  });

  it('a slot key pressed after the holster key (a later frame, before the tick) wins and clears the holster', () => {
    const { keys, frame } = setup();
    frame(() => keys.press('holster'), false);
    const cmd = frame(() => keys.press('slot2'))!;
    expect(cmd.holster).toBe(false);
    expect(cmd.switchTo).toBe(1);
  });

  it('a slot key pressed in the same frame as the holster key wins too', () => {
    const { keys, frame } = setup();
    const cmd = frame(() => {
      keys.press('holster');
      keys.press('slot1');
    })!;
    expect(cmd.holster).toBe(false);
    expect(cmd.switchTo).toBe(0);
  });

  it('a mouse-wheel switch after the holster key clears the holster as well', () => {
    const { keys, frame, wheelSteps } = setup();
    frame(() => keys.press('holster'), false);
    wheelSteps(1);
    const cmd = frame(undefined, true);
    // (The fake slot count is passed by update(); two replicas here.)
    expect(cmd!.holster).toBe(false);
  });

  it('the holster key pressed after a switch asked for drops that switch', () => {
    const { keys, frame } = setup();
    frame(() => keys.press('slot2'), false);
    const cmd = frame(() => keys.press('holster'))!;
    expect(cmd.holster).toBe(true);
    expect(cmd.switchTo).toBe(-1);
  });

  it('lowers a toggled aim', () => {
    const { keys, input, frame } = setup();
    input.aimMode = 'toggle';
    expect(frame(() => keys.press('aim'))!.aim).toBe(true);
    keys.release('aim');
    expect(frame()!.aim).toBe(true);
    const cmd = frame(() => keys.press('holster'))!;
    expect(cmd.aim).toBe(false);
    expect(cmd.holster).toBe(true);
  });

  it('scripted input never holsters, and clears a holster left on the command', () => {
    const cmd = createCommand();
    cmd.holster = true;
    fillScriptedCommand([{ fromTick: 0, forward: 1 }], 0, 0, 1 / 60, cmd);
    expect(cmd.holster).toBe(false);
  });
});

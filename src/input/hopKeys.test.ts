import { describe, expect, it } from 'vitest';
import { type Action, DEFAULT_BINDINGS, REBINDABLE } from '../config/controls';
import { MOVEMENT } from '../config/movement';
import { createCommand } from '../sim/commands';
import type { Keyboard } from './keyboard';
import { PlayerInput } from './playerInput';
import type { PointerLock } from './pointerLock';

/** Dev 6 playtest item 15 (QA): the hop-up keys, from the key to the command. */
function setup() {
  const pressed = new Set<Action>();
  const kb = { isDown: () => false, wasPressed: (a: Action) => pressed.has(a), pressCount: (a: Action) => (pressed.has(a) ? 1 : 0) } as unknown as Keyboard;
  const pointer = { consumeDelta: () => {}, consumeWheelSteps: () => 0 } as unknown as PointerLock;
  const input = new PlayerInput(kb, pointer, MOVEMENT);
  const cmd = createCommand();
  const frame = (...keys: Action[]) => {
    pressed.clear();
    keys.forEach((k) => pressed.add(k));
    input.update(0, 2);
    input.fillCommand(cmd);
    return cmd.hopUpSteps;
  };
  return { input, frame, press: (k: Action) => pressed.add(k) };
}

describe('hop-up keys', () => {
  it('send +1 for more lift and -1 for less, once per press', () => {
    const { frame } = setup();
    expect(frame()).toBe(0);
    expect(frame('hopUp')).toBe(1);
    expect(frame()).toBe(0);
    expect(frame('hopDown')).toBe(-1);
  });

  it('two taps inside one slow frame turn two notches (bug pass BP6a, as the fire selector since KI1)', () => {
    const counts = new Map<Action, number>([['hopUp', 2]]);
    const kb = { isDown: () => false, wasPressed: (a: Action) => (counts.get(a) ?? 0) > 0, pressCount: (a: Action) => counts.get(a) ?? 0 } as unknown as Keyboard;
    const pointer = { consumeDelta: () => {}, consumeWheelSteps: () => 0 } as unknown as PointerLock;
    const input = new PlayerInput(kb, pointer, MOVEMENT);
    const cmd = createCommand();
    input.update(0, 2);
    input.fillCommand(cmd);
    expect(cmd.hopUpSteps).toBe(2);
    counts.clear();
    counts.set('hopDown', 3);
    input.update(0, 2);
    input.fillCommand(cmd);
    expect(cmd.hopUpSteps).toBe(-3);
  });

  it('both in one frame cancel out', () => {
    expect(setup().frame('hopUp', 'hopDown')).toBe(0);
  });

  it('a press made while paused is dropped with the other latches', () => {
    const s = setup();
    s.press('hopUp');
    s.input.update(0, 2);
    s.input.clearLatches();
    expect(s.frame()).toBe(0);
  });

  it('are bound by default to 4/PageDown and 5/PageUp, rebindable, and clash with no other default', () => {
    expect(DEFAULT_BINDINGS.hopDown).toEqual(['Digit4', 'PageDown']);
    expect(DEFAULT_BINDINGS.hopUp).toEqual(['Digit5', 'PageUp']);
    const actions = REBINDABLE.map((r) => r.action);
    expect(actions).toContain('hopDown');
    expect(actions).toContain('hopUp');
    const seen = new Map<string, string>();
    for (const [action, keys] of Object.entries(DEFAULT_BINDINGS)) {
      for (const k of keys as readonly string[]) {
        expect(seen.get(k), `${k} bound to ${seen.get(k)} and ${action}`).toBeUndefined();
        seen.set(k, action);
      }
    }
  });
});

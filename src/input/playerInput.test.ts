import { describe, expect, it } from 'vitest';
import type { Action } from '../config/controls';
import { MOVEMENT } from '../config/movement';
import { createCommand } from '../sim/commands';
import type { Keyboard } from './keyboard';
import { PlayerInput } from './playerInput';
import type { PointerLock } from './pointerLock';

/** Keys held and pressed this frame, standing in for the real keyboard. */
function fakeKeyboard() {
  const down = new Set<Action>();
  const pressed = new Set<Action>();
  const kb = { isDown: (a: Action) => down.has(a), wasPressed: (a: Action) => pressed.has(a) } as unknown as Keyboard;
  return {
    kb,
    /** Presses (and holds) `a` this frame. */
    press(a: Action) {
      down.add(a);
      pressed.add(a);
    },
    release(a: Action) {
      down.delete(a);
    },
    endFrame() {
      pressed.clear();
    },
  };
}

const pointer = { consumeDelta: () => {}, consumeFirePress: () => false, consumeWheelSteps: () => 0, fireHeld: false } as unknown as PointerLock;

function setup(mode: 'toggle' | 'hold') {
  const keys = fakeKeyboard();
  const input = new PlayerInput(keys.kb, pointer, MOVEMENT);
  input.crouchMode = mode;
  const cmd = createCommand();
  /** One render frame and one tick; returns the command. */
  const frame = (act?: () => void) => {
    act?.();
    input.update(0, 2);
    input.fillCommand(cmd);
    keys.endFrame();
    return { ...cmd };
  };
  return { keys, input, frame };
}

describe('crouch key (owner, 2026-10-03)', () => {
  it('toggles by default: press to crouch, press again to stand', () => {
    const { keys, frame } = setup('toggle');
    expect(frame(() => keys.press('crouch')).crouch).toBe(true);
    keys.release('crouch');
    expect(frame().crouch).toBe(true); // stays down without holding the key
    expect(frame(() => keys.press('crouch')).crouch).toBe(false);
  });

  it('stands you up on a sprint or jump press (that jump press only stands you up)', () => {
    const { keys, frame } = setup('toggle');
    frame(() => keys.press('crouch'));
    keys.release('crouch');
    const afterSprint = frame(() => keys.press('sprint'));
    expect(afterSprint.crouch).toBe(false);
    expect(afterSprint.sprint).toBe(true);
    keys.release('sprint');

    frame(() => keys.press('crouch'));
    keys.release('crouch');
    const afterJump = frame(() => keys.press('jump'));
    expect(afterJump.crouch).toBe(false);
    expect(afterJump.jump).toBe(false);
    keys.release('jump');
    expect(frame(() => keys.press('jump')).jump).toBe(true); // standing: the next press jumps
  });

  it('crouches only while held in hold mode', () => {
    const { keys, frame } = setup('hold');
    expect(frame(() => keys.press('crouch')).crouch).toBe(true);
    expect(frame().crouch).toBe(true);
    keys.release('crouch');
    expect(frame().crouch).toBe(false);
  });

  it('starts each round standing, and a mode change stands you up', () => {
    const { keys, input, frame } = setup('toggle');
    frame(() => keys.press('crouch'));
    keys.release('crouch');
    input.resetView(0);
    expect(frame().crouch).toBe(false);
    frame(() => keys.press('crouch'));
    keys.release('crouch');
    input.crouchMode = 'toggle';
    expect(frame().crouch).toBe(false);
  });
});

describe('fire selector key', () => {
  it('asks for one selector step per press', () => {
    const { keys, frame } = setup('toggle');
    expect(frame(() => keys.press('fireMode')).cycleFireMode).toBe(true);
    expect(frame().cycleFireMode).toBe(false); // held: no repeat
  });
});

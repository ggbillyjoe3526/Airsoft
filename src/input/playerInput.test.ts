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

const pointer = { consumeDelta: () => {}, consumeWheelSteps: () => 0 } as unknown as PointerLock;

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

describe('aiming down sights', () => {
  /** A mouse that moves `dx` counts every frame, with the aim button held or not. */
  function aimingSetup(aimHeld: boolean, dy = 0) {
    const keys = fakeKeyboard();
    if (aimHeld) keys.press('aim');
    const mouse = {
      consumeDelta: (out: { x: number; y: number }) => {
        out.x = 100;
        out.y = dy;
      },
      consumeWheelSteps: () => 0,
    } as unknown as PointerLock;
    return new PlayerInput(keys.kb, mouse, MOVEMENT);
  }

  it('holds the aim button as the command says', () => {
    const cmd = createCommand();
    const held = aimingSetup(true);
    held.update(0, 2);
    held.fillCommand(cmd);
    expect(cmd.aim).toBe(true);
    const free = aimingSetup(false);
    free.update(0, 2);
    free.fillCommand(cmd);
    expect(cmd.aim).toBe(false);
  });

  it('turns at the aiming sensitivity (a multiple of the mouse sensitivity) as the sight comes up', () => {
    const hip = aimingSetup(true);
    hip.sensitivity = 1.5;
    hip.aimSensitivity = 0.5;
    hip.update(0, 2, 0);
    const aimed = aimingSetup(true);
    aimed.sensitivity = 1.5;
    aimed.aimSensitivity = 0.5;
    aimed.update(0, 2, 1);
    expect(aimed.yaw).toBeCloseTo(hip.yaw * 0.5, 12);
    expect(hip.yaw).not.toBe(0);
    // Halfway up, halfway between: no jump in turn rate while the sight rises.
    const rising = aimingSetup(true);
    rising.sensitivity = 1.5;
    rising.aimSensitivity = 0.5;
    rising.update(0, 2, 0.5);
    expect(rising.yaw).toBeCloseTo(hip.yaw * 0.75, 12);
  });
});

describe('invert mouse (M18)', () => {
  function pitchAfter(invert: boolean): number {
    const keys = fakeKeyboard();
    const mouse = {
      consumeDelta: (out: { x: number; y: number }) => {
        out.x = 0;
        out.y = 50; // mouse pulled back (towards you)
      },
      consumeWheelSteps: () => 0,
    } as unknown as PointerLock;
    const input = new PlayerInput(keys.kb, mouse, MOVEMENT);
    input.invertY = invert;
    input.update(0, 2);
    return input.pitch;
  }

  it('looks down when the mouse is pulled back, and up with invert on', () => {
    expect(pitchAfter(false)).toBeLessThan(0);
    expect(pitchAfter(true)).toBeCloseTo(-pitchAfter(false), 12);
  });
});

describe('fire button as a binding (M18)', () => {
  it('fires while the fire action is held, and a click between ticks still fires once', () => {
    const { keys, frame } = setup('hold');
    expect(frame(() => keys.press('fire')).fire).toBe(true);
    expect(frame().fire).toBe(true); // still held
    keys.release('fire');
    expect(frame().fire).toBe(false);
    // Pressed and let go within one frame: latched for the next tick.
    expect(
      frame(() => {
        keys.press('fire');
        keys.release('fire');
      }).fire,
    ).toBe(true);
    expect(frame().fire).toBe(false);
  });
});

describe('aim toggle (M18)', () => {
  function toggleSetup() {
    const t = setup('hold');
    t.input.aimMode = 'toggle';
    return t;
  }

  it('raises the sight on a press and lowers it on the next', () => {
    const { keys, frame } = toggleSetup();
    expect(frame(() => keys.press('aim')).aim).toBe(true);
    keys.release('aim');
    expect(frame().aim).toBe(true);
    expect(frame(() => keys.press('aim')).aim).toBe(false);
  });

  it('lowers on a sprint press or a replica switch', () => {
    const { keys, frame } = toggleSetup();
    frame(() => keys.press('aim'));
    keys.release('aim');
    expect(frame(() => keys.press('sprint')).aim).toBe(false);
    keys.release('sprint');
    frame(() => keys.press('aim'));
    keys.release('aim');
    expect(frame(() => keys.press('slot2')).aim).toBe(false);
  });

  it('never waits, unseen, while the replica in hand has no sight', () => {
    const { keys, input } = toggleSetup();
    const cmd = createCommand();
    keys.press('aim');
    input.update(1, 2, 0, 1, false);
    input.fillCommand(cmd);
    expect(cmd.aim).toBe(false);
  });

  it('a new round starts with the sight down', () => {
    const { keys, input, frame } = toggleSetup();
    frame(() => keys.press('aim'));
    keys.release('aim');
    input.resetView(0);
    expect(frame().aim).toBe(false);
  });

  it('stays a held button by default', () => {
    const { keys, frame } = setup('toggle');
    expect(frame(() => keys.press('aim')).aim).toBe(true);
    keys.release('aim');
    expect(frame().aim).toBe(false);
  });
});

describe('sprint toggle (M18)', () => {
  function toggleSetup() {
    const t = setup('hold');
    t.input.sprintMode = 'toggle';
    t.keys.press('forward');
    return t;
  }

  it('sprints after one press until forward is let go', () => {
    const { keys, frame } = toggleSetup();
    expect(frame(() => keys.press('sprint')).sprint).toBe(true);
    keys.release('sprint');
    expect(frame().sprint).toBe(true);
    keys.release('forward');
    expect(frame().sprint).toBe(false);
    keys.press('forward');
    expect(frame().sprint).toBe(false); // pushing forward again doesn't restart it
  });

  it('pressed before forward, waits for forward, then runs (M18a review)', () => {
    const { keys, frame } = toggleSetup();
    keys.release('forward');
    expect(frame(() => keys.press('sprint')).sprint).toBe(false);
    keys.release('sprint');
    expect(frame().sprint).toBe(false);
    keys.press('forward');
    expect(frame().sprint).toBe(true);
    keys.release('forward');
    expect(frame().sprint).toBe(false);
  });

  it('stops on a second press, or a crouch, aim, walk or fire press', () => {
    for (const stopper of ['sprint', 'crouch', 'aim', 'walk', 'fire'] as const) {
      const { keys, frame } = toggleSetup();
      frame(() => keys.press('sprint'));
      keys.release('sprint');
      expect(frame(() => keys.press(stopper)).sprint, stopper).toBe(false);
    }
  });

  it('stays a held key by default', () => {
    const { keys, frame } = setup('hold');
    keys.press('forward');
    expect(frame(() => keys.press('sprint')).sprint).toBe(true);
    keys.release('sprint');
    expect(frame().sprint).toBe(false);
  });
});

describe('squad order keys (M22)', () => {
  it('hand over the order pressed, once, and nothing after a pause', () => {
    const keys = fakeKeyboard();
    const input = new PlayerInput(keys.kb, pointer, MOVEMENT);
    expect(input.takeOrder()).toBeNull();
    keys.press('orderHold');
    input.update(0, 2);
    keys.endFrame();
    expect(input.takeOrder()).toBe('hold');
    expect(input.takeOrder()).toBeNull();
    keys.press('orderRegroup');
    input.update(0, 2);
    input.clearLatches(); // the game paused before it was taken
    expect(input.takeOrder()).toBeNull();
  });
});

describe('order wheel (M23)', () => {
  function wheelSetup(select: 'hover' | 'click' = 'hover') {
    const keys = fakeKeyboard();
    const delta = { x: 0, y: 0 };
    let wheelSteps = 0;
    const mouse = {
      consumeDelta: (out: { x: number; y: number }) => {
        out.x = delta.x;
        out.y = delta.y;
        delta.x = delta.y = 0;
      },
      consumeWheelSteps: () => {
        const w = wheelSteps;
        wheelSteps = 0;
        return w;
      },
    } as unknown as PointerLock;
    const input = new PlayerInput(keys.kb, mouse, MOVEMENT);
    input.ordersEnabled = true;
    input.wheelSelect = select;
    const cmd = createCommand();
    /** Orders handed over, frame by frame, as the match takes them (before the tick's command). */
    const given: (string | null)[] = [];
    const frame = (act?: () => void) => {
      act?.();
      input.update(0, 2);
      given.push(input.takeOrder());
      input.fillCommand(cmd);
      keys.endFrame();
      return { ...cmd };
    };
    /** Moves the mouse by (x, y) counts before the next frame. */
    const move = (x: number, y: number) => {
      delta.x += x;
      delta.y += y;
    };
    return { keys, input, frame, move, scroll: (n: number) => (wheelSteps = n), lastOrder: () => given[given.length - 1] };
  }

  it('opens while its key is held, and the mouse moves its pointer, never the view', () => {
    const { keys, input, frame, move } = wheelSetup();
    frame(() => keys.press('orderWheel'));
    expect(input.wheelOpen).toBe(true);
    move(300, -400);
    frame();
    expect(input.yaw).toBe(0);
    expect(input.pitch).toBe(0);
    expect(input.wheelPointer.pick).toBeGreaterThanOrEqual(0);
  });

  it('hover: letting go on an order gives it; letting go in the middle gives nothing', () => {
    const { keys, input, frame, move, lastOrder } = wheelSetup('hover');
    frame(() => keys.press('orderWheel'));
    move(400, 0); // right: Hold here
    frame();
    keys.release('orderWheel');
    frame();
    expect(input.wheelOpen).toBe(false);
    expect(lastOrder()).toBe('hold');

    frame(() => keys.press('orderWheel'));
    keys.release('orderWheel');
    frame();
    expect(lastOrder()).toBeNull();
  });

  it('click: a click on an order gives it; letting go without one gives nothing', () => {
    const { keys, input, frame, move, lastOrder } = wheelSetup('click');
    frame(() => keys.press('orderWheel'));
    move(0, 400); // down: Regroup
    frame();
    keys.release('orderWheel');
    frame();
    expect(lastOrder()).toBeNull();

    frame(() => keys.press('orderWheel'));
    move(-400, 0); // left: Team plan
    frame();
    frame(() => keys.press('fire'));
    expect(input.wheelOpen).toBe(false);
    expect(lastOrder()).toBe('cancel');
  });

  it('never fires: not the click that picks, nor a trigger held through it until it is pulled again', () => {
    const { keys, frame, move } = wheelSetup('click');
    keys.press('fire');
    expect(frame().fire).toBe(true);
    expect(frame(() => keys.press('orderWheel')).fire).toBe(false); // held trigger, wheel open
    keys.release('fire');
    move(0, -400);
    frame();
    expect(frame(() => keys.press('fire')).fire).toBe(false); // the picking click
    expect(frame().fire).toBe(false); // still held after the wheel closed
    keys.release('fire');
    frame();
    expect(frame(() => keys.press('fire')).fire).toBe(true); // a new pull
  });

  it('keeps the keyboard moving you, and the mouse wheel off the replicas, while open', () => {
    const { keys, frame, scroll } = wheelSetup();
    keys.press('forward');
    frame(() => keys.press('orderWheel'));
    scroll(1);
    const cmd = frame();
    expect(cmd.forward).toBe(1);
    expect(cmd.switchTo).toBe(-1);
  });

  it('stays shut where orders are off (the range), and a pause closes it with no order', () => {
    const { keys, input, frame, move } = wheelSetup();
    input.ordersEnabled = false;
    frame(() => keys.press('orderWheel'));
    expect(input.wheelOpen).toBe(false);
    move(100, 0);
    frame();
    expect(input.yaw).not.toBe(0); // the mouse still turns the view

    input.ordersEnabled = true;
    keys.release('orderWheel');
    frame(() => keys.press('orderWheel'));
    move(400, 0);
    frame();
    input.clearLatches();
    expect(input.wheelOpen).toBe(false);
    expect(input.takeOrder()).toBeNull();
  });

  it('never raises the sight from under the wheel, by a held or a toggled aim button, until it is let go of', () => {
    for (const mode of ['hold', 'toggle'] as const) {
      const { keys, input, frame } = wheelSetup();
      input.aimMode = mode;
      frame(() => keys.press('orderWheel'));
      expect(frame(() => keys.press('aim')).aim, mode).toBe(false);
      expect(input.wheelOpen, mode).toBe(true);
      keys.release('orderWheel');
      expect(frame().aim, mode).toBe(false); // wheel closed, aim still held
      keys.release('aim');
      frame();
      expect(frame(() => keys.press('aim')).aim, mode).toBe(true);
    }
  });

  it('says whether the order handed over came from the wheel or a key', () => {
    const { keys, input, frame, move } = wheelSetup();
    frame(() => keys.press('orderWheel'));
    move(0, -400);
    frame();
    keys.release('orderWheel');
    frame();
    expect(input.orderFromWheel).toBe(true);
    frame(() => keys.press('orderHold'));
    expect(input.orderFromWheel).toBe(false);
  });
});

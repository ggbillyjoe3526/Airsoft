import { describe, expect, it } from 'vitest';
import { KeyBindings } from './keyBindings';
import { Keyboard } from './keyboard';

/** A stand-in window (the tests run without a browser): key events and blur go to a plain event target. */
function setup() {
  const target = new EventTarget();
  const keyboard = new Keyboard(target as unknown as Window, new KeyBindings(null));
  /** A key event as the browser sends it; returns whether its default was blocked. */
  const key = (type: 'keydown' | 'keyup', code: string, repeat = false): boolean => {
    const e = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
    target.dispatchEvent(e);
    return e.defaultPrevented;
  };
  return { target, keyboard, key };
}

describe('Keyboard (audit L-27)', () => {
  it('reports a press once per frame and holds the key until it is let go', () => {
    const { keyboard, key } = setup();
    key('keydown', 'KeyR');
    expect(keyboard.wasPressed('reload')).toBe(true);
    expect(keyboard.isDown('reload')).toBe(true);
    keyboard.endFrame();
    expect(keyboard.wasPressed('reload')).toBe(false);
    expect(keyboard.isDown('reload')).toBe(true);
    key('keyup', 'KeyR');
    expect(keyboard.isDown('reload')).toBe(false);
  });

  it('ignores the auto-repeat of a held key: it is not a new press', () => {
    const { keyboard, key } = setup();
    key('keydown', 'KeyR');
    keyboard.endFrame();
    key('keydown', 'KeyR', true);
    expect(keyboard.wasPressed('reload')).toBe(false);
    expect(keyboard.isDown('reload')).toBe(true);
  });

  it('reads keys through the bindings, so a rebind moves the action', () => {
    const target = new EventTarget();
    const bindings = new KeyBindings(null);
    const keyboard = new Keyboard(target as unknown as Window, bindings);
    bindings.rebind('reload', 'KeyT');
    target.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyT', repeat: false }));
    expect(keyboard.wasPressed('reload')).toBe(true);
    expect(keyboard.keyName('reload')).toBe('T');
  });

  it('blocks the browser default of game keys only while capturing (the menus keep Space, arrows and the rest)', () => {
    const { keyboard, key } = setup();
    expect(key('keydown', 'Space')).toBe(false);
    expect(key('keyup', 'Space')).toBe(false);
    keyboard.capturing = true;
    expect(key('keydown', 'Space')).toBe(true);
    expect(key('keyup', 'Space')).toBe(true);
    expect(key('keydown', 'KeyR')).toBe(true); // a bound key
    expect(key('keydown', 'F3')).toBe(true); // the find bar
    expect(key('keydown', 'KeyP')).toBe(false); // nothing of the game's
  });

  it('lets go of everything when the window loses the focus', () => {
    const { target, keyboard, key } = setup();
    key('keydown', 'KeyW');
    keyboard.press('Mouse0');
    target.dispatchEvent(new Event('blur'));
    expect(keyboard.isDown('forward')).toBe(false);
    expect(keyboard.wasPressed('forward')).toBe(false);
    expect(keyboard.isDown('fire')).toBe(false);
  });

  it('takes mouse buttons by their binding codes', () => {
    const { keyboard } = setup();
    keyboard.press('Mouse0');
    expect(keyboard.wasPressed('fire')).toBe(true);
    expect(keyboard.isDown('fire')).toBe(true);
    keyboard.release('Mouse0');
    expect(keyboard.isDown('fire')).toBe(false);
  });

  it('stops listening once disposed', () => {
    const { keyboard, key } = setup();
    keyboard.dispose();
    key('keydown', 'KeyR');
    expect(keyboard.isDown('reload')).toBe(false);
  });
});

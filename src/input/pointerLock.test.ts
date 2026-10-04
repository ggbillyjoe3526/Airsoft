import { afterEach, describe, expect, it } from 'vitest';
import { PointerLock } from './pointerLock';

/** A stand-in document (the tests run without a browser): an event target with a pointer lock element. */
function fakeDocument(): EventTarget & { pointerLockElement: unknown; exitPointerLock: () => void } {
  const doc = new EventTarget() as EventTarget & { pointerLockElement: unknown; exitPointerLock: () => void };
  doc.pointerLockElement = null;
  doc.exitPointerLock = () => undefined;
  return doc;
}

/**
 * A canvas whose lock requests answer in turn from `answers`: 'refuse' fires pointerlockerror and rejects (as Chrome
 * does when raw input isn't supported), 'lock' takes the lock and fires pointerlockchange.
 */
function fakeCanvas(doc: ReturnType<typeof fakeDocument>, answers: ('refuse' | 'lock' | 'refuseEventLater')[]): HTMLElement {
  const canvas = {
    requestPointerLock: async (): Promise<void> => {
      const answer = answers.shift();
      if (answer === 'refuseEventLater') {
        // Chrome's order: the promise rejects first and the event follows a task later.
        setTimeout(() => doc.dispatchEvent(new Event('pointerlockerror')), 0);
        throw new Error('refused');
      }
      if (answer === 'lock') {
        // Granting the lock takes a moment.
        await new Promise((resolve) => setTimeout(resolve, 5));
        doc.pointerLockElement = canvas;
        doc.dispatchEvent(new Event('pointerlockchange'));
        return;
      }
      doc.dispatchEvent(new Event('pointerlockerror'));
      throw new Error('refused');
    },
  };
  return canvas as unknown as HTMLElement;
}

const realDocument = globalThis.document;
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
});

function setup(answers: ('refuse' | 'lock' | 'refuseEventLater')[], boundCodes: readonly string[] = []) {
  const doc = fakeDocument();
  (globalThis as { document?: unknown }).document = doc;
  const log: string[] = [];
  const buttons = {
    press: (code: string) => log.push(`press:${code}`),
    release: (code: string) => log.push(`release:${code}`),
    bound: (code: string) => boundCodes.includes(code),
  };
  const canvas = fakeCanvas(doc, answers);
  const lock = new PointerLock(canvas, buttons);
  lock.onChange((locked) => log.push(`change:${locked}`));
  lock.onError(() => log.push('error'));
  return { lock, log, doc, canvas };
}

/** A mouse move as the browser sends it while locked. */
function move(doc: EventTarget, x: number, y: number): void {
  const e = new Event('mousemove') as Event & { movementX: number; movementY: number };
  e.movementX = x;
  e.movementY = y;
  doc.dispatchEvent(e);
}

/** One wheel event of `deltaY` pixels. */
function wheel(doc: EventTarget, deltaY: number): void {
  const e = new Event('wheel') as Event & { deltaY: number; deltaMode: number };
  e.deltaY = deltaY;
  e.deltaMode = 0;
  doc.dispatchEvent(e);
}

/** A mouse button event as the browser sends it; returns whether its default was blocked. */
function mouse(doc: EventTarget, type: string, button: number): boolean {
  const e = new Event(type, { cancelable: true }) as Event & { button: number };
  e.button = button;
  doc.dispatchEvent(e);
  return e.defaultPrevented;
}

describe('pointer lock requests', () => {
  it('reports no refusal when raw input is refused but the plain retry locks', async () => {
    const { lock, log } = setup(['refuse', 'lock']);
    await lock.request();
    expect(log).toEqual(['change:true']);
    expect(lock.locked).toBe(true);
  });

  it('also reports no refusal when the first try\'s error event comes after its promise rejects', async () => {
    const { lock, log } = setup(['refuseEventLater', 'lock']);
    await lock.request();
    expect(log).toEqual(['change:true']);
  });

  it('reports a refusal once both tries fail', async () => {
    const { lock, log } = setup(['refuse', 'refuse']);
    await lock.request();
    expect(log).toEqual(['error']);
  });

  it('drops a second request while the first is under way (a double-click on Play), so no refusal shows', async () => {
    const { lock, log } = setup(['lock', 'refuse', 'refuse']);
    await Promise.all([lock.request(), lock.request()]);
    expect(log).toEqual(['change:true']);
    expect(lock.locked).toBe(true);
  });

  it('still reports a refusal the browser only signals by event, outside a request', () => {
    const { log } = setup([]);
    globalThis.document.dispatchEvent(new Event('pointerlockerror'));
    expect(log).toEqual(['error']);
  });
});

describe('mouse buttons (M18)', () => {
  it('passes every button on by its binding code while locked, and lets go of them all when the lock ends', async () => {
    const { lock, log, doc } = setup(['lock']);
    expect(mouse(doc, 'mousedown', 0)).toBe(false); // not playing yet: ignored, left to the page
    await lock.request();
    log.length = 0;
    mouse(doc, 'mousedown', 0);
    mouse(doc, 'mousedown', 3);
    mouse(doc, 'mouseup', 0);
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(log).toEqual(['press:Mouse0', 'press:Mouse3', 'release:Mouse0', 'release:Mouse3', 'change:false']);
  });

  it('blocks the side buttons\' back and forward (and middle-click scrolling) while playing, not in the menus', async () => {
    const { lock, doc } = setup(['lock']);
    expect(mouse(doc, 'mouseup', 3)).toBe(false);
    expect(mouse(doc, 'auxclick', 4)).toBe(false);
    await lock.request();
    expect(mouse(doc, 'mousedown', 1)).toBe(true);
    expect(mouse(doc, 'mousedown', 3)).toBe(true);
    expect(mouse(doc, 'mouseup', 3)).toBe(true);
    expect(mouse(doc, 'auxclick', 4)).toBe(true);
    expect(mouse(doc, 'mousedown', 0)).toBe(false); // the left button keeps its default
  });

  it('counts the buttons without the lock in unlocked play only', () => {
    const { lock, log, doc } = setup([]);
    lock.setUnlockedButtons(true);
    mouse(doc, 'mousedown', 2);
    lock.setUnlockedButtons(false);
    expect(log).toEqual(['press:Mouse2', 'release:Mouse2']);
  });
});

describe('mouse movement (audit UI-10)', () => {
  it('skips the first move after the lock is taken, and drops a single implausible jump', async () => {
    const { lock, doc } = setup(['lock']);
    await lock.request();
    const d = { x: 0, y: 0 };
    move(doc, 4000, 0); // the first move after locking: can carry a glitch
    move(doc, 12, -5);
    move(doc, 5000, 3); // a driver glitch
    move(doc, 3, 1);
    lock.consumeDelta(d);
    expect(d).toEqual({ x: 15, y: -4 });
  });
});

describe('the mouse wheel as a key (audit UI-05)', () => {
  it('taps WheelUp / WheelDown per notch and switches replicas only for an unbound direction', () => {
    const { lock, log, doc } = setup([], ['WheelUp']);
    lock.setUnlockedButtons(true);
    wheel(doc, -120);
    expect(log).toEqual(['press:WheelUp', 'release:WheelUp']);
    expect(lock.consumeWheelSteps()).toBe(0); // up is bound (say to jump): no replica switch
    wheel(doc, 60);
    expect(lock.consumeWheelSteps()).toBe(0); // not a notch yet
    wheel(doc, 60);
    expect(log.slice(2)).toEqual(['press:WheelDown', 'release:WheelDown']);
    expect(lock.consumeWheelSteps()).toBe(1);
    expect(lock.consumeWheelSteps()).toBe(0);
  });
});

describe('raw mouse input (audit UI-20)', () => {
  it('reports raw input active when the raw lock is granted, unavailable on the plain retry, off when turned off', async () => {
    const granted = setup(['lock']);
    const seen: string[] = [];
    granted.lock.onRawStatus((s) => seen.push(s));
    expect(granted.lock.rawStatus).toBe('unknown');
    await granted.lock.request();
    expect(granted.lock.rawStatus).toBe('active');

    const fallback = setup(['refuse', 'lock']);
    await fallback.lock.request();
    expect(fallback.lock.rawStatus).toBe('unavailable');

    const off = setup([]);
    const asked: unknown[] = [];
    (off.canvas as unknown as { requestPointerLock: (o?: unknown) => Promise<void> }).requestPointerLock = async (o?: unknown) => {
      asked.push(o);
    };
    off.lock.rawInput = false;
    await off.lock.request();
    expect(asked).toEqual([undefined]); // no unadjustedMovement asked for
    expect(off.lock.rawStatus).toBe('off');
    expect(seen).toEqual(['active']);
  });
});

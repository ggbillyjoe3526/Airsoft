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

function setup(answers: ('refuse' | 'lock' | 'refuseEventLater')[]) {
  const doc = fakeDocument();
  (globalThis as { document?: unknown }).document = doc;
  const log: string[] = [];
  const buttons = { press: (code: string) => log.push(`press:${code}`), release: (code: string) => log.push(`release:${code}`) };
  const lock = new PointerLock(fakeCanvas(doc, answers), buttons);
  lock.onChange((locked) => log.push(`change:${locked}`));
  lock.onError(() => log.push('error'));
  return { lock, log, doc };
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

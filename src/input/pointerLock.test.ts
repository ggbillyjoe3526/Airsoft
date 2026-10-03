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

function setup(answers: ('refuse' | 'lock' | 'refuseEventLater')[]): { lock: PointerLock; log: string[] } {
  const doc = fakeDocument();
  (globalThis as { document?: unknown }).document = doc;
  const lock = new PointerLock(fakeCanvas(doc, answers));
  const log: string[] = [];
  lock.onChange((locked) => log.push(`change:${locked}`));
  lock.onError(() => log.push('error'));
  return { lock, log };
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

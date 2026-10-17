import { afterEach, describe, expect, it, vi } from 'vitest';
import { PointerLock } from './pointerLock';

/** QA for IN1: a browser that answers a lock request only by event (Firefox 136 returns no promise). */
const realDocument = globalThis.document;
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
  vi.unstubAllGlobals();
});

function setup(answers: ('lock' | 'refuse' | 'silent')[]) {
  const doc = new EventTarget() as EventTarget & { pointerLockElement: unknown; exitPointerLock: () => void };
  doc.pointerLockElement = null;
  doc.exitPointerLock = () => undefined;
  (globalThis as { document?: unknown }).document = doc;
  const asked: (PointerLockOptions | undefined)[] = [];
  const canvas = {
    requestPointerLock: (options?: PointerLockOptions): undefined => {
      asked.push(options);
      const answer = answers.shift();
      if (answer === 'silent') return undefined;
      setTimeout(() => {
        if (answer === 'lock') doc.pointerLockElement = canvas;
        doc.dispatchEvent(new Event(answer === 'lock' ? 'pointerlockchange' : 'pointerlockerror'));
      }, 1);
      return undefined;
    },
  };
  const log: string[] = [];
  const lock = new PointerLock(canvas as unknown as HTMLElement, { press: () => undefined, release: () => undefined, bound: () => false });
  lock.onChange((locked) => log.push(`change:${locked}`));
  lock.onError(() => log.push('error'));
  return { lock, log, doc, asked };
}

describe('PointerLock.request without a promise (IN1)', () => {
  it('asks for raw input first and again without it after a refusal, then locks', async () => {
    const { lock, asked } = setup(['refuse', 'lock']);
    await lock.request();
    expect(asked).toEqual([{ unadjustedMovement: true }, undefined]);
    expect(lock.locked).toBe(true);
    expect(lock.rawStatus).toBe('unavailable');
  });

  it('reports a refusal that straggles in after the request ended only once', async () => {
    const { lock, log, doc } = setup(['refuse', 'refuse']);
    await lock.request();
    doc.dispatchEvent(new Event('pointerlockerror'));
    expect(log).toEqual(['error']);
    // A later request is a new attempt: its refusal is reported again.
    const { lock: l2, log: log2 } = setup(['refuse', 'refuse']);
    await l2.request();
    expect(log2).toEqual(['error']);
    expect(lock.locked).toBe(false);
  });

  it('reports a refusal by event outside any request (the browser refused a lock it was not asked for)', () => {
    const { log, doc } = setup([]);
    doc.dispatchEvent(new Event('pointerlockerror'));
    expect(log).toEqual(['error']);
  });

  it('lets the next request through once a refused one is over (no request stuck pending)', async () => {
    const { lock, log } = setup(['refuse', 'refuse', 'lock']);
    await lock.request();
    await lock.request();
    expect(log).toEqual(['error', 'change:true']);
  });

  it('knows Firefox gives no raw input before any lock', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:136.0) Gecko/20100101 Firefox/136.0' });
    expect(setup([]).lock.rawStatus).toBe('unavailable');
  });
});

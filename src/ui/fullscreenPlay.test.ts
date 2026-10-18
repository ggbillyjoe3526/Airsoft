import { afterEach, describe, expect, it, vi } from 'vitest';
import { FULLSCREEN_RELOCK_MS } from '../config/controls';
import type { PointerLock } from '../input/pointerLock';
import { FullscreenPlay } from './fullscreenPlay';

/** A page that is or isn't fullscreen, with or without the key's user activation, and a lock that records its calls. */
function setUp(opts: { fullscreen?: boolean; activation?: boolean; locked?: boolean } = {}) {
  const page = { fullscreen: opts.fullscreen ?? false, requests: 0 };
  vi.stubGlobal('document', {
    get fullscreenElement() {
      return page.fullscreen ? {} : null;
    },
    documentElement: { requestFullscreen: () => ((page.requests++), Promise.resolve()) },
    exitFullscreen: () => Promise.resolve(),
  });
  vi.stubGlobal('navigator', { userActivation: { isActive: opts.activation ?? true } });
  const lock = { locked: opts.locked ?? true, requests: 0, releases: 0 };
  const pointer = {
    get locked() {
      return lock.locked;
    },
    request: async () => void lock.requests++,
    release: () => void ((lock.releases++), (lock.locked = false)),
  } as unknown as PointerLock;
  return { page, lock, play: new FullscreenPlay(pointer, () => true, () => false) };
}

describe('FullscreenPlay: the Fullscreen key in play (IN1, out of game.ts in DX5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the page for fullscreen on the key, and takes the lock again once the change is done', () => {
    const { page, lock, play } = setUp();
    play.key(performance.now());
    expect(page.requests).toBe(1);
    lock.locked = false;
    play.takeAgain(); // the change isn't done yet: wait
    expect(lock.requests).toBe(0);
    page.fullscreen = true;
    play.takeAgain();
    play.takeAgain(); // once only
    expect(lock.requests).toBe(1);
  });

  it('without the key\'s user activation (Firefox), gives the mouse back for the pause menu\'s click, read once', () => {
    const { page, lock, play } = setUp({ activation: false });
    play.key(performance.now());
    expect([page.requests, lock.releases]).toEqual([0, 1]);
    expect(play.takeByClick()).toBe(true);
    expect(play.takeByClick()).toBe(false);
    play.click(() => {
      throw new Error('not fullscreen yet');
    });
    expect(page.requests).toBe(1);
    page.fullscreen = true;
    const played = vi.fn();
    play.click(played);
    expect(played).toHaveBeenCalledOnce();
  });

  it('holds play while the lock is taken again, until it runs out or play stops holding', () => {
    const { lock, play } = setUp();
    play.key(performance.now());
    lock.locked = false;
    play.hold();
    const at = performance.now();
    expect([play.holding, play.holdRanOut(at), play.holdRanOut(at + FULLSCREEN_RELOCK_MS + 1)]).toEqual([true, false, true]);
    play.stopHolding();
    expect([play.holding, play.holdRanOut(at + FULLSCREEN_RELOCK_MS + 1)]).toEqual([false, false]);
  });

  it('times Esc\'s skip from the key', () => {
    const { play } = setUp();
    expect(play.sinceKey(1000)).toBe(Number.POSITIVE_INFINITY);
    play.key(500);
    expect(play.sinceKey(1000)).toBe(500);
  });
});

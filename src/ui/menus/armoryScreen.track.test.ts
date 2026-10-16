import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contentPool } from '../../pool/contentPool';
import { GAME_POOL } from '../../pool/gamePool';
import { GAME_LEVELS } from '../../progress/gameLevels';
import { addXp, newProgress } from '../../progress/progress';
import { ArmoryScreen } from './armoryScreen';
import { EventNode, stubMenuPage } from './menuTestSupport';

/** MR1 QA: the Armory's sideways track: the scroll arrows show only while there is more that way, the wheel scrolls it, opened() finds the next level. */
beforeEach(() => void stubMenuPage());
afterEach(() => vi.unstubAllGlobals());

interface Track extends EventNode {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
  scrollTo?: (o: { left: number }) => void;
  scrollBy?: (o: { left: number; behavior: string }) => void;
}

function armory(xp = 0) {
  const p = newProgress(GAME_LEVELS);
  addXp(p, GAME_LEVELS, xp);
  const screen = new ArmoryScreen({ pool: () => contentPool(GAME_POOL, false), levels: GAME_LEVELS, progress: () => p, levellingOff: () => false, devContent: () => false });
  const root = screen.root as unknown as EventNode;
  const track = root.querySelector('.armory-levels') as Track;
  const back = root.querySelector('.armory-scroll-back')!;
  const on = root.querySelector('.armory-scroll-on')!;
  const body = root.querySelector('.armory-track-body')!;
  return { screen, root, track, back, on, body };
}
const wheel = (t: Track, deltaY: number, deltaX = 0) => t.fire('wheel', { deltaY, deltaX } as never);

describe('the Armory track: scroll arrows and wheel (MR1)', () => {
  it('shows the forward arrow only at the start, the back one only at the end, both between', () => {
    const { screen, track, back, on, body } = armory();
    Object.assign(track, { scrollWidth: 3000, clientWidth: 1000, scrollLeft: 0 });
    screen.refresh();
    expect([back.hidden, on.hidden, body.classList.contains('has-more')]).toEqual([true, false, true]);
    track.scrollLeft = 800;
    track.fire('scroll');
    expect([back.hidden, on.hidden]).toEqual([false, false]);
    track.scrollLeft = 2000;
    track.fire('scroll');
    expect([back.hidden, on.hidden, body.classList.contains('has-more')]).toEqual([false, true, false]);
  });

  it('shows no arrow when every level fits', () => {
    const { screen, track, back, on } = armory();
    Object.assign(track, { scrollWidth: 900, clientWidth: 1000, scrollLeft: 0 });
    screen.refresh();
    expect([back.hidden, on.hidden]).toEqual([true, true]);
  });

  it('scrolls by most of a screen when an arrow is clicked, in its direction', () => {
    const { track, back, on } = armory();
    const calls: number[] = [];
    Object.assign(track, { clientWidth: 1000, scrollBy: (o: { left: number }) => calls.push(o.left) });
    on.click();
    back.click();
    expect(calls).toEqual([800, -800]);
  });

  it('turns a vertical wheel into a sideways scroll and keeps the page from scrolling', () => {
    const { track } = armory();
    Object.assign(track, { scrollWidth: 3000, clientWidth: 1000, scrollLeft: 100 });
    const e = wheel(track, 120);
    expect(e.defaultPrevented).toBe(true);
    expect(track.scrollLeft).toBe(220);
    expect(wheel(track, -60).defaultPrevented).toBe(true);
    expect(track.scrollLeft).toBe(160);
  });

  it('lets the page scroll past either end of the track, and for a sideways wheel', () => {
    const { track } = armory();
    Object.assign(track, { scrollWidth: 3000, clientWidth: 1000, scrollLeft: 0 });
    expect(wheel(track, -100).defaultPrevented).toBe(false);
    track.scrollLeft = 2000;
    expect(wheel(track, 100).defaultPrevented).toBe(false);
    expect(track.scrollLeft).toBe(2000);
    track.scrollLeft = 500;
    expect(wheel(track, 10, 50).defaultPrevented).toBe(false);
    expect(track.scrollLeft).toBe(500);
  });

  it('lets the page scroll when the track has nothing to scroll', () => {
    const { track } = armory();
    Object.assign(track, { scrollWidth: 800, clientWidth: 1000, scrollLeft: 0 });
    expect(wheel(track, 100).defaultPrevented).toBe(false);
  });

  it('opens on the next level, a third of the screen in, and never scrolls before the start', () => {
    const { screen, track, root } = armory(0);
    const next = root.querySelectorAll('.armory-level-row').find((r) => r.dataset.state === 'next') as (EventNode & { offsetLeft: number }) | undefined;
    expect(next).toBeDefined();
    const at: number[] = [];
    Object.assign(track, { clientWidth: 900, scrollTo: (o: { left: number }) => at.push(o.left) });
    next!.offsetLeft = 2000;
    screen.opened();
    expect(at).toEqual([1700]);
    next!.offsetLeft = 100;
    screen.opened();
    expect(at).toEqual([1700, 0]);
  });

  it('survives a browser without scrollTo', () => {
    const { screen, track } = armory();
    Object.assign(track, { scrollTo: undefined });
    expect(() => screen.opened()).not.toThrow();
  });
});

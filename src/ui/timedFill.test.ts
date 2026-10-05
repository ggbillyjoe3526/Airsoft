import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUD } from '../config/render';
import { FakeElement } from './testSupport';
import { TimedFill } from './timedFill';

/** A fill whose style writes are logged in order, with the page's style flush (getComputedStyle) in between. */
function setUp(reducedMotion = false): { fill: TimedFill; log: string[]; el: FakeElement; time: (ms: number) => void } {
  const log: string[] = [];
  const el = new FakeElement('div');
  el.style = new Proxy({} as Record<string, string>, {
    set(target, property: string, value: string) {
      log.push(`${property}=${value}`);
      target[property] = value;
      return true;
    },
  });
  vi.stubGlobal('getComputedStyle', () => {
    log.push('flush');
    return { transitionProperty: reducedMotion ? 'none' : 'transform' };
  });
  let clock = 0;
  return { fill: new TimedFill(el as unknown as HTMLElement, () => clock), log, el, time: (ms) => (clock = ms) };
}

afterEach(() => vi.unstubAllGlobals());

describe('a progress fill on one CSS transition (M64, audit UI-11)', () => {
  it('rewinds the bar to where it is, lets the page settle it there, then runs it to full in the time left', () => {
    const { fill, log } = setUp();
    fill.follow(0.4, 0.9);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0.4)', 'flush', 'transitionDuration=0.9s', 'transform=scaleX(1)']);
  });

  it('writes nothing more while the game keeps pace with the transition, however many frames pass', () => {
    const { fill, log, time } = setUp();
    fill.follow(0, 1.5);
    const written = log.length;
    for (let frame = 1; frame <= 90; frame++) {
      time((frame / 60) * 1000);
      fill.follow(frame / 90, 1.5 - frame / 60);
    }
    expect(log.length).toBe(written);
  });

  it('runs again from the game\'s progress when it drifts off the transition (a pause, a long frame, a reset count)', () => {
    const { fill, log, time } = setUp();
    fill.follow(0, 1.5);
    log.length = 0;
    time(1000 * (HUD.barDriftSeconds - 0.05)); // a little late: still the same run
    fill.follow(0, 1.5);
    expect(log).toEqual([]);
    time(5000); // the game paused: its progress did not move while the clock did
    fill.follow(0.2, 1.2);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0.2)', 'flush', 'transitionDuration=1.2s', 'transform=scaleX(1)']);
  });

  it('holds at a whole percent with no transition, and writes a held bar once', () => {
    const { fill, log } = setUp();
    fill.follow(0.1, 3);
    log.length = 0;
    fill.hold(0.456);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0.45)']);
    fill.hold(0.451);
    fill.hold(0.459);
    expect(log.length).toBe(2);
  });

  it('stays still when nothing is left to fill', () => {
    const { fill, log } = setUp();
    fill.follow(1, 0);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(1)']);
    fill.follow(0.3, 0);
    expect(log.at(-1)).toBe('transform=scaleX(0.3)');
  });

  describe('under Reduced motion (the stylesheet takes the transition away)', () => {
    it('steps the fill per whole percent, as the bar did before, and never starts a transition', () => {
      const { fill, log, time } = setUp(true);
      for (let frame = 0; frame <= 420; frame++) {
        time((frame / 60) * 1000);
        fill.follow(frame / 420, 7 - frame / 60); // a 7 s bar at 60 fps: several frames to each percent
      }
      expect(log.filter((entry) => entry.startsWith('transform=')).length).toBe(101); // 0%, 1% ... 100%
      expect(log.filter((entry) => entry.startsWith('transitionDuration=') && entry !== 'transitionDuration=0s')).toEqual([]);
      expect(log.at(-1)).toBe('transform=scaleX(1)');
    });

    it('writes once for each percent, not each frame', () => {
      const { fill, log } = setUp(true);
      fill.follow(0.5, 1);
      const written = log.length;
      fill.follow(0.5004, 0.99);
      fill.follow(0.5009, 0.98);
      expect(log.length).toBe(written);
    });
  });
});

describe('a bar whose run is cut short, followed, or switched under it (QA, M64 UI-11)', () => {
  it('snaps back to empty when the run is cancelled half way, and the cut transition never finishes', () => {
    const { fill, log, time } = setUp();
    fill.follow(0, 1.5);
    time(600);
    fill.follow(0.4, 0.9);
    log.length = 0;
    fill.hold(0); // a weapon switch, a death or a round end
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)']); // duration zeroed first, so the rewind is instant
    time(5000);
    fill.hold(0);
    expect(log.length).toBe(2); // nothing re-armed it, and a rewound bar is not written again
  });

  it('starts the next run from empty when it follows the first with no frame between (the game restarted its progress)', () => {
    const { fill, log, time } = setUp();
    fill.follow(0.95, 0.07); // a reload one frame from its end ...
    time(1000 / 60);
    log.length = 0;
    fill.follow(0.01, 1.5); // ... and the next one, begun inside the same frame's ticks
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0.01)', 'flush', 'transitionDuration=1.5s', 'transform=scaleX(1)']);
  });

  it('starts from empty on a run begun after a hold, whatever the clock says', () => {
    const { fill, log, time } = setUp();
    fill.follow(0, 1);
    time(400);
    fill.hold(0);
    time(900);
    log.length = 0;
    fill.follow(0, 1.2);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)', 'flush', 'transitionDuration=1.2s', 'transform=scaleX(1)']);
  });

  it('stands while the game is paused and runs again from the game\'s progress after it, not from where the transition got to', () => {
    const { fill, log, time } = setUp();
    fill.follow(0, 2);
    time(1000);
    fill.follow(0.5, 1); // paused here: the game's progress stops, the clock goes on
    log.length = 0;
    time(31_000);
    fill.follow(0.5, 1);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0.5)']);
    log.length = 0;
    time(32_000);
    fill.follow(0.5, 1); // still paused: nothing more is written
    expect(log).toEqual([]);
    time(32_250);
    fill.follow(0.75, 0.5); // the game goes on: one run from its progress
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0.75)', 'flush', 'transitionDuration=0.5s', 'transform=scaleX(1)']);
    log.length = 0;
    time(32_500);
    fill.follow(0.875, 0.25); // and it keeps pace after
    expect(log).toEqual([]);
  });

  it('settles a run Reduced motion took the transition from into steps, when the run begins again (a pause for the setting)', () => {
    const calm = { on: false };
    const log: string[] = [];
    const el = new FakeElement('div');
    el.style = new Proxy({} as Record<string, string>, {
      set(target, property: string, value: string) {
        log.push(`${property}=${value}`);
        target[property] = value;
        return true;
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({ transitionProperty: calm.on ? 'none' : 'transform' }));
    let clock = 0;
    const fill = new TimedFill(el as unknown as HTMLElement, () => clock);
    fill.follow(0.2, 2);
    expect(log.at(-1)).toBe('transform=scaleX(1)');
    calm.on = true; // the Settings menu is open: the game is paused while the clock goes on
    clock = 4000;
    log.length = 0;
    fill.follow(0.2, 2);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0.2)']); // rewound, and no transition armed
    log.length = 0;
    clock = 4100;
    fill.follow(0.2504, 1.9);
    fill.follow(0.26, 1.85);
    // The game goes on: the run begins again from its progress, finds Reduced motion on, and steps from there.
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0.2504)', 'transform=scaleX(0.26)']);
  });

  it('clamps a fraction outside 0..1 and writes a valid scale', () => {
    const { fill, log } = setUp();
    fill.follow(-0.3, 1);
    expect(log[1]).toBe('transform=scaleX(0)');
    fill.hold(1.7);
    expect(log.at(-1)).toBe('transform=scaleX(1)');
  });
});

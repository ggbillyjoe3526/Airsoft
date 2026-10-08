import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTRACTION } from '../config/extraction';
import { ROUNDS } from '../config/hits';
import { createRoundState, type RoundState } from '../sim/round';
import { vec3 } from '../sim/vec';
import { FakeElement } from './testSupport';
import { Scoreboard } from './scoreboard';

/** A page element for the scoreboard: finds its parts by selector (one fake each), counting writes to the bar's fill. */
class BoardElement extends FakeElement {
  private readonly found = new Map<string, BoardElement>();
  writes = 0;
  constructor(tag: string) {
    super(tag);
    this.style = new Proxy({ setProperty: () => {} } as unknown as Record<string, string>, {
      set: (target, property: string, value: string) => {
        if (property === 'transform' || property === 'transitionDuration' || property === 'width') this.writes++;
        target[property] = value;
        return true;
      },
    });
  }
  querySelector(selector: string): BoardElement {
    let el = this.found.get(selector);
    if (!el) this.found.set(selector, (el = new BoardElement('div')));
    return el;
  }
  querySelectorAll(): BoardElement[] {
    return [];
  }
}

describe('the exit count bar on the scoreboard (M64, audit UI-11)', () => {
  let clock = 0;
  let board: Scoreboard;
  let fill: BoardElement;
  let round: RoundState;

  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new BoardElement(tag) });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const parent = new BoardElement('div');
    board = new Scoreboard(parent as unknown as HTMLElement, [3, 5], 0);
    fill = (parent.children[0] as BoardElement).querySelector('.sb-flag-bar b');
    round = createRoundState({ ...ROUNDS, roundTime: 480, winsNeeded: 1 }, 'extraction');
    round.run.exits = [{ name: 'East gate', position: vec3(), radius: 2, late: false, closed: false, open: true }];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const update = (): void => board.update(round, [], { rules: EXTRACTION, respawnsLeft: 1 });

  it('runs on one transition for the whole count, not a write per percent', () => {
    round.run.countStatus = 'counting';
    for (let frame = 0; frame <= EXTRACTION.extractTime * 60; frame++) {
      clock = (frame / 60) * 1000;
      round.run.count = frame / 60;
      update();
    }
    expect(fill.writes).toBeLessThanOrEqual(6);
    expect(fill.style.transform).toBe('scaleX(1)');
  });

  it('stands the bar where the count was when it pauses, and empties it when the count is lost', () => {
    round.run.countStatus = 'counting';
    round.run.count = 4;
    update();
    expect(fill.style.transitionDuration).toBe(`${EXTRACTION.extractTime - 4}s`);
    round.run.countStatus = 'paused';
    update();
    expect(fill.style.transitionDuration).toBe('0s');
    expect(fill.style.transform).toBe('scaleX(0.4)');
    round.run.countStatus = 'idle';
    round.run.count = 0;
    update();
    expect(fill.style.transform).toBe('scaleX(0)');
  });
});

describe('the strip\'s bar when the count ends, restarts or is switched, and in the flag modes (QA, M64 UI-11)', () => {
  let clock = 0;
  let board: Scoreboard;
  let fill: BoardElement;
  let round: RoundState;
  let log: string[];
  let reduced = false;

  beforeEach(() => {
    clock = 0;
    reduced = false;
    log = [];
    vi.stubGlobal('document', { createElement: (tag: string) => new BoardElement(tag) });
    vi.stubGlobal('getComputedStyle', () => {
      log.push('flush');
      return { transitionProperty: reduced ? 'none' : 'transform' };
    });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const parent = new BoardElement('div');
    board = new Scoreboard(parent as unknown as HTMLElement, [3, 5], 0);
    fill = (parent.children[0] as BoardElement).querySelector('.sb-flag-bar b');
    const counted = fill.style;
    fill.style = new Proxy(counted, {
      set(target, property: string, value: string) {
        log.push(`${property}=${value}`);
        return Reflect.set(target, property, value);
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const extraction = (): void => {
    round = createRoundState({ ...ROUNDS, roundTime: 480, winsNeeded: 1 }, 'extraction');
    round.run.exits = [{ name: 'East gate', position: vec3(), radius: 2, late: false, closed: false, open: true }];
  };
  const updateRun = (): void => board.update(round, [], { rules: EXTRACTION, respawnsLeft: 1 });
  const counting = (count: number, ms = count * 1000): void => {
    clock = ms;
    round.run.countStatus = 'counting';
    round.run.count = count;
    updateRun();
  };

  it('empties the bar when time runs out in the middle of a count, and keeps it empty', () => {
    extraction();
    for (let frame = 0; frame <= 120; frame++) counting(frame / 60);
    log.length = 0;
    // The sim's endRun: the outcome is set, the count cleared, the clock at 0.
    round.run.outcome = 'time';
    round.run.countStatus = 'idle';
    round.run.count = 0;
    round.clock = 0;
    updateRun();
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)']);
    for (let frame = 0; frame < 120; frame++) updateRun(); // the game over screen is up for a while
    expect(log.length).toBe(2);
  });

  it('fills the bar and holds it when the count completes and the run is extracted', () => {
    extraction();
    counting(EXTRACTION.extractTime - 0.05);
    log.length = 0;
    round.run.outcome = 'extracted';
    round.run.countStatus = 'idle';
    round.run.count = 0;
    updateRun();
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(1)']);
    for (let frame = 0; frame < 60; frame++) updateRun();
    expect(log.length).toBe(2);
  });

  it('restarts the bar from empty when the runner leaves the exit and counts again', () => {
    extraction();
    for (let frame = 0; frame <= 120; frame++) counting(frame / 60);
    round.run.countStatus = 'idle'; // stepped out: the sim clears the count
    round.run.count = 0;
    updateRun();
    expect(fill.style.transform).toBe('scaleX(0)');
    log.length = 0;
    counting(1 / 60, 5000);
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${1 / 60 / EXTRACTION.extractTime})`, 'flush', `transitionDuration=${EXTRACTION.extractTime - 1 / 60}s`, 'transform=scaleX(1)']);
  });

  it('restarts from empty when the runner moves to another exit with the count running (no idle frame between)', () => {
    extraction();
    for (let frame = 0; frame <= 150; frame++) counting(frame / 60); // 2.5 s in
    log.length = 0;
    counting(1 / 60, 2600); // the sim's `at !== countExit`: the count starts over, the status stays 'counting'
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${1 / 60 / EXTRACTION.extractTime})`, 'flush', `transitionDuration=${EXTRACTION.extractTime - 1 / 60}s`, 'transform=scaleX(1)']);
  });

  it('stands while the game is paused mid-count and runs again from the count\'s own progress after it', () => {
    extraction();
    for (let frame = 0; frame <= 60; frame++) counting(frame / 60);
    log.length = 0;
    counting(1, 60_000); // a minute in the pause menu: the count did not move
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${Math.floor((1 / EXTRACTION.extractTime) * 100) / 100})`]);
    log.length = 0;
    const next = 1 + 1 / 60;
    counting(next, 60_000 + 1000 / 60); // the game goes on: one run from the count's progress
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${next / EXTRACTION.extractTime})`, 'flush', `transitionDuration=${EXTRACTION.extractTime - next}s`, 'transform=scaleX(1)']);
  });

  it('steps the count bar per percent and starts no transition under Reduced motion', () => {
    reduced = true;
    extraction();
    for (let frame = 0; frame <= EXTRACTION.extractTime * 60; frame++) counting(frame / 60);
    expect(log.some((entry) => entry.startsWith('transitionDuration=') && entry !== 'transitionDuration=0s')).toBe(false);
    const steps = log.filter((entry) => entry.startsWith('transform=')).length;
    expect(steps).toBeGreaterThan(20);
    expect(steps).toBeLessThanOrEqual(102);
    expect(fill.style.transform).toBe('scaleX(1)');
  });

  describe('the flag strip in Attack / Defend', () => {
    const flagRound = (): RoundState => {
      const r = createRoundState({ ...ROUNDS, roundTime: 120 }, 'attackDefend', vec3(5, 0, 5));
      return r;
    };
    const frameAt = (progress: number, status: RoundState['flag']['status'] = 'raising'): void => {
      round.flag.progress = progress;
      round.flag.status = status;
      board.update(round, []);
    };

    it('stands the bar at the flag\'s height, a step per percent, and never starts a transition', () => {
      round = flagRound();
      frameAt(0.5);
      expect(fill.style.transform).toBe('scaleX(0.5)');
      expect(fill.style.transitionDuration).toBe('0s');
      log.length = 0;
      frameAt(0.5004);
      frameAt(0.5009);
      expect(log).toEqual([]); // the same whole percent: no write
      for (let p = 51; p <= 100; p++) frameAt(p / 100);
      expect(log.some((entry) => entry.startsWith('transitionDuration=') && entry !== 'transitionDuration=0s')).toBe(false);
      expect(fill.style.transform).toBe('scaleX(1)');
    });

    it('drops the bar with the flag when the defenders pull it down, and empties it for the next round', () => {
      round = flagRound();
      frameAt(0.8);
      frameAt(0.6, 'lowering');
      expect(fill.style.transform).toBe('scaleX(0.6)');
      frameAt(0, 'idle'); // the round is over and the flag reset
      expect(fill.style.transform).toBe('scaleX(0)');
      expect(fill.style.transitionDuration).toBe('0s');
    });
  });
});

describe('the line under the clock (G4 criterion 1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sits under the clock between the sides and says what wins the match', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new BoardElement(tag) });
    const parent = new BoardElement('div');
    const board = new Scoreboard(parent as unknown as HTMLElement, [3, 3], 0);
    const root = parent.children[0] as BoardElement;
    expect(root.innerHTML).toMatch(/<span class="sb-mid"><span class="sb-clock">[^<]*<\/span><span class="sb-aim"><\/span><\/span>/);
    board.setAim('First to 5');
    expect(root.querySelector('.sb-aim').textContent).toBe('First to 5');
  });
});

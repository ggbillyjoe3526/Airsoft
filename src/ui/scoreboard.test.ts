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

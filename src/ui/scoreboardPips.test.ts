import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUNDS } from '../config/hits';
import { LOADOUT } from '../config/replicas';
import { createCharacter } from '../sim/character';
import { createRoundState, type RoundState } from '../sim/round';
import { vec3 } from '../sim/vec';
import { Scoreboard } from './scoreboard';
import { FakeElement } from './testSupport';

/** BP3: Extraction's reserve has a pip that stays hidden until it joins; the bar publishes its width for the hit feed. */

/** The score bar's page element: pips found by selector (counted from the markup), a parent to publish to. */
class BarElement extends FakeElement {
  offsetWidth = 0;
  readonly pipEls: Record<number, FakeElement[]> = {};
  private readonly found = new Map<string, FakeElement>();
  get parentElement(): BarElement | null {
    return this.parent as BarElement | null;
  }
  constructor(tag: string) {
    super(tag);
    Object.defineProperty(this.style, 'removeProperty', { value: (n: string) => void delete this.style[n], enumerable: false });
  }
  override appendChild(node: FakeElement): FakeElement {
    this.append(node);
    return node;
  }
  querySelector(selector: string): FakeElement {
    if (!this.found.has(selector)) this.found.set(selector, new FakeElement('div'));
    return this.found.get(selector)!;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const team = /sb-team-(\d) \.sb-pips i/.exec(selector)?.[1];
    if (team === undefined) return [];
    const parts = this.innerHTML.split('sb-team-');
    const markup = parts.find((p) => p.startsWith(`${team}"`)) ?? '';
    const count = (markup.split('sb-pips">')[1]?.split('</span>')[0]?.split('<i>').length ?? 1) - 1;
    return (this.pipEls[Number(team)] ??= Array.from({ length: count }, () => new FakeElement('i')));
  }
}

const cast = (teams: readonly number[]) => teams.map((team, id) => createCharacter(id, vec3(), 0, LOADOUT, team));
const parentOf = (b: Scoreboard): BarElement => (b as unknown as { root: BarElement }).root.parentElement!;

describe('the Extraction reserve\'s pip on the score bar (BP3)', () => {
  let parent: BarElement;
  let root: BarElement;
  let board: Scoreboard;
  let round: RoundState;
  const characters = cast([0, 0, 1, 1, 1]); // two of yours, three home; the last home one is the reserve

  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new BarElement(tag) });
    vi.spyOn(performance, 'now').mockReturnValue(0);
    parent = new BarElement('div');
    board = new Scoreboard(parent as unknown as HTMLElement, [2, 3], 0);
    root = parent.children[0] as BarElement;
    round = createRoundState({ ...ROUNDS, roundTime: 480, winsNeeded: 1 }, 'extraction');
    round.run.reserve = [false, false, false, false, true];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('draws a pip for every character a team has, the reserve\'s included', () => {
    expect(root.pipEls[0]).toHaveLength(2);
    expect(root.pipEls[1]).toHaveLength(3);
  });

  it('marks the reserve\'s pip with the reserve class while it waits, and no one else\'s', () => {
    board.update(round, characters);
    expect(root.pipEls[1]!.map((p) => p.classList.contains('reserve'))).toEqual([false, false, true]);
    expect(root.pipEls[0]!.map((p) => p.classList.contains('reserve'))).toEqual([false, false]);
  });

  it('takes the class off when the reserve joins the run, with nothing else changing in play', () => {
    board.update(round, characters);
    round.run.reserve[4] = false;
    board.update(round, characters);
    expect(root.pipEls[1]!.map((p) => p.classList.contains('reserve'))).toEqual([false, false, false]);
  });

  it('marks no pip as reserve in a mode without one', () => {
    round.run.reserve = [];
    board.update(round, characters);
    for (const pips of Object.values(root.pipEls)) for (const p of pips) expect(p.classList.contains('reserve')).toBe(false);
  });

  it('still marks the hit ones out, independently of the reserve', () => {
    characters[1]!.status = 'out';
    board.update(round, characters);
    expect(root.pipEls[0]!.map((p) => p.classList.contains('out'))).toEqual([false, true]);
    characters[1]!.status = 'alive';
  });
});

describe('the score bar publishes half its width for the hit feed (BP3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('works where there is no ResizeObserver, and disposing is harmless', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new BarElement(tag) });
    vi.stubGlobal('ResizeObserver', undefined);
    const parent = new BarElement('div');
    const board = new Scoreboard(parent as unknown as HTMLElement, [3, 3], 0);
    expect(() => board.dispose()).not.toThrow();
    expect(parent.style['--sb-half']).toBeUndefined();
  });

  it('sets --sb-half on the parent to half the measured width as the bar resizes, and removes it on dispose', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new BarElement(tag) });
    let notify = (): void => {};
    let disconnected = false;
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) {
        notify = cb;
      }
      observe(): void {}
      disconnect(): void {
        disconnected = true;
      }
    });
    const parent = new BarElement('div');
    const board = new Scoreboard(parent as unknown as HTMLElement, [3, 3], 0);
    const root = parent.children[0] as BarElement;
    notify(); // not laid out yet (width 0): nothing published
    expect(parent.style['--sb-half']).toBeUndefined();
    root.offsetWidth = 600;
    notify();
    expect(parent.style['--sb-half']).toBe('300px');
    root.offsetWidth = 730;
    notify();
    expect(parent.style['--sb-half']).toBe('365px');
    expect(parentOf(board)).toBe(parent);
    board.dispose();
    expect(parent.style['--sb-half']).toBeUndefined();
    expect(disconnected).toBe(true);
  });
});

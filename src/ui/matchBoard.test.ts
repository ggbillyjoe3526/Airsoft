import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD } from '../config/renderView';
import { FakeElement } from './testSupport';
import { boardFitScale, boxesOverlap, type MatchBoard as Board } from './matchBoard';
import type { TeamBlock } from './statsRows';

let MatchBoard: typeof Board;

// The table is not under test here (statsTable draws real <table> parts): a stand-in keeps the board's own work. Test
// files share a worker's modules (isolate: false), so a board another file already loaded holds the real table: this
// file loads fresh copies with the stand-in, and resets the registry again when it ends (save/startGuardedStorage.test.ts).
beforeAll(async () => {
  vi.resetModules();
  vi.doMock('./statsTable', () => ({
    StatsTable: class {
      readonly root = (globalThis as unknown as { document: Document }).document.createElement('table');
      set(): void {}
    },
  }));
  ({ MatchBoard } = await import('./matchBoard'));
});
afterAll(() => {
  vi.doUnmock('./statsTable');
  vi.resetModules();
});

/** BP3: the Tab scoreboard fits the window, packs its rows for a big roster and gets the replica panel out of its way. */

const fit = (over: Partial<Parameters<typeof boardFitScale>[0]> = {}) => boardFitScale({ height: 400, top: 200, viewport: 720, hudScale: 1, ...over });

describe('boardFitScale: how much smaller than the HUD the board must be to end above the window\'s foot (BP3)', () => {
  it('is 1 while the board fits with the bottom gap to spare', () => {
    // room = 720 - 200 - gap
    expect(fit({ height: 720 - 200 - HUD.board.bottomGap })).toBe(1);
    expect(fit({ height: 100 })).toBe(1);
  });

  it('shrinks to fill exactly the room left under the board\'s top, minus the gap, once the board is taller', () => {
    const room = 720 - 200 - HUD.board.bottomGap;
    expect(fit({ height: room * 1.25 })).toBeCloseTo(0.8, 9);
    // The HUD's own scale counts in the board's height on screen.
    expect(fit({ height: room, hudScale: 1.25 })).toBeCloseTo(0.8, 9);
  });

  it('never goes under HUD.board.minFit, and never above 1 in a tall window', () => {
    expect(fit({ height: 5000 })).toBe(HUD.board.minFit);
    expect(fit({ top: 5000 })).toBe(HUD.board.minFit);
    expect(fit({ viewport: 5000 })).toBe(1);
  });

  it('is 1 for a board not measured yet (height 0) or a HUD scale of 0 or less', () => {
    expect(fit({ height: 0 })).toBe(1);
    expect(fit({ hudScale: 0 })).toBe(1);
    expect(fit({ hudScale: -1 })).toBe(1);
  });
});

describe('boxesOverlap', () => {
  const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
  it('is true for boxes that share area, either way round, and for one inside the other', () => {
    expect(boxesOverlap(box(0, 0, 10, 10), box(5, 5, 15, 15))).toBe(true);
    expect(boxesOverlap(box(5, 5, 15, 15), box(0, 0, 10, 10))).toBe(true);
    expect(boxesOverlap(box(0, 0, 100, 100), box(40, 40, 50, 50))).toBe(true);
  });
  it('is false for boxes apart on either axis, and for boxes that only touch along an edge', () => {
    expect(boxesOverlap(box(0, 0, 10, 10), box(20, 0, 30, 10))).toBe(false);
    expect(boxesOverlap(box(0, 0, 10, 10), box(0, 20, 10, 30))).toBe(false);
    expect(boxesOverlap(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false);
    expect(boxesOverlap(box(0, 0, 10, 10), box(0, 10, 10, 20))).toBe(false);
  });
});

/** A page element whose layout a test sets: what the board reads (offsets, client height, boxes) and the panel lookup. */
class Layout extends FakeElement {
  offsetHeight = 0;
  offsetTop = 0;
  clientHeight = 0;
  box = { left: 0, right: 0, top: 0, bottom: 0 };
  panel: Layout | null = null;
  override getBoundingClientRect() {
    return this.box;
  }
  querySelector(selector: string): Layout | null {
    return selector === '.hud-replica' ? this.panel : null;
  }
  override appendChild(node: FakeElement): FakeElement {
    node.parent = this;
    this.children.push(node);
    return node;
  }
  constructor(tag: string) {
    super(tag);
    Object.defineProperty(this.style, 'getPropertyValue', { value: (n: string) => this.style[n] ?? '', enumerable: false });
  }
}

const block = (rows: number): TeamBlock => ({ team: 0, title: 'Alpha', rows: Array.from({ length: rows }, () => ({}) as TeamBlock['rows'][number]) });

describe('MatchBoard in a match (BP3)', () => {
  let parent: Layout;
  let created: Layout[];

  beforeEach(() => {
    created = [];
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        const el = new Layout(tag);
        created.push(el);
        return el;
      },
    });
    parent = new Layout('div');
    parent.clientHeight = 720;
  });
  afterEach(() => vi.unstubAllGlobals());

  const make = (fitScreen = true) => {
    const board = new MatchBoard(parent as unknown as HTMLElement, fitScreen);
    const root = parent.children[0] as Layout;
    return { board, root };
  };

  it('goes compact past HUD.board.compactRows players, and back to the plain rows for fewer', () => {
    const { board, root } = make();
    board.setVisible(true);
    board.set('Round 1', [block(HUD.board.compactRows), block(0)]);
    expect(root.classList.contains('compact')).toBe(false);
    board.set('Round 1', [block(HUD.board.compactRows / 2), block(HUD.board.compactRows / 2 + 1)]);
    expect(root.classList.contains('compact')).toBe(true);
    board.set('Round 1', [block(3), block(3)]);
    expect(root.classList.contains('compact')).toBe(false);
  });

  it('scales itself to the room under its top and publishes it as --board-fit', () => {
    const { board, root } = make();
    root.offsetTop = 200;
    root.offsetHeight = (720 - 200 - HUD.board.bottomGap) * 1.25;
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    expect(root.style['--board-fit']).toBe('0.800');
  });

  it('leaves --board-fit at 1 when it fits, and reads the HUD scale from the container', () => {
    const { board, root } = make();
    root.offsetTop = 200;
    root.offsetHeight = 300;
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    expect(root.style['--board-fit']).toBe('1.000');
    board.setVisible(false);
    parent.style['--hud-scale'] = '2';
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    expect(Number(root.style['--board-fit'])).toBeCloseTo((720 - 200 - HUD.board.bottomGap) / 600, 3);
  });

  it('measures once as it comes up, not on every frame, and again when the window\'s height changes', () => {
    const { board, root } = make();
    root.offsetTop = 200;
    root.offsetHeight = 300;
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    root.offsetHeight = 1000; // would shrink it, but is not read again
    board.set('Round 1', [block(3)]);
    expect(root.style['--board-fit']).toBe('1.000');
    parent.clientHeight = 600;
    board.set('Round 1', [block(3)]);
    expect(Number(root.style['--board-fit'])).toBeLessThan(1);
  });

  it('sets board-covers-panel on the container only while it overlaps the replica panel', () => {
    const { board, root } = make();
    const panel = new Layout('div');
    panel.box = { left: 0, right: 100, top: 600, bottom: 700 };
    parent.panel = panel;
    root.box = { left: 300, right: 900, top: 100, bottom: 500 };
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    expect(parent.classList.contains('board-covers-panel')).toBe(false);
    board.setVisible(false);
    root.box = { left: 0, right: 900, top: 100, bottom: 650 };
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    expect(parent.classList.contains('board-covers-panel')).toBe(true);
  });

  it('does not set the class when there is no replica panel', () => {
    const { board, root } = make();
    root.box = { left: 0, right: 900, top: 0, bottom: 900 };
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    expect(parent.classList.contains('board-covers-panel')).toBe(false);
  });

  it('takes the class off when it hides, and when it is disposed while up', () => {
    const { board, root } = make();
    const panel = new Layout('div');
    panel.box = { left: 0, right: 100, top: 0, bottom: 100 };
    parent.panel = panel;
    root.box = { left: 0, right: 900, top: 0, bottom: 900 };
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    expect(parent.classList.contains('board-covers-panel')).toBe(true);
    board.setVisible(false);
    expect(parent.classList.contains('board-covers-panel')).toBe(false);
    board.setVisible(true);
    board.set('Round 1', [block(3)]);
    expect(parent.classList.contains('board-covers-panel')).toBe(true);
    board.dispose();
    expect(parent.classList.contains('board-covers-panel')).toBe(false);
  });

  it('does none of the fitting for a board that is not in a match (the result screen\'s)', () => {
    const { board, root } = make(false);
    root.offsetTop = 200;
    root.offsetHeight = 5000;
    root.box = { left: 0, right: 900, top: 0, bottom: 900 };
    parent.panel = Object.assign(new Layout('div'), { box: { left: 0, right: 100, top: 0, bottom: 100 } });
    board.setVisible(true);
    board.set('Round 1', [block(10)]);
    expect(root.style['--board-fit']).toBeUndefined();
    expect(parent.classList.contains('board-covers-panel')).toBe(false);
    expect(root.classList.contains('compact')).toBe(true);
  });
});

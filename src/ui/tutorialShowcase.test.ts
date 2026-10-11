import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORDER_WHEEL } from '../config/squad';
import { TEAMS } from '../config/teams';
import { TUTORIAL } from '../config/tutorial';
import type * as MatchBoardModule from './matchBoard';
import type * as OrderWheelModule from './orderWheel';
import type * as ShowcaseModule from './tutorialShowcase';

vi.mock('./matchBoard');
vi.mock('./orderWheel', async (importOriginal) => {
  const real = await importOriginal<typeof import('./orderWheel')>();
  return { ...real, OrderWheel: vi.fn(function (this: Record<string, unknown>) {
    this.update = vi.fn();
    this.hide = vi.fn();
    this.dispose = vi.fn();
  }) };
});

let MatchBoard: typeof MatchBoardModule.MatchBoard;
let OrderWheel: typeof OrderWheelModule.OrderWheel;
let TutorialShowcase: typeof ShowcaseModule.TutorialShowcase;
let demoPick: typeof ShowcaseModule.demoPick;
let sampleBoardBlocks: typeof ShowcaseModule.sampleBoardBlocks;
const board = () => vi.mocked(MatchBoard).mock.instances[0]!;
const wheel = () => vi.mocked(OrderWheel).mock.instances[0]!;

describe('what the tutorial opens on screen (M80)', () => {
  // Test files share a worker's modules (isolate: false): another file may already have loaded the showcase with the
  // real board and wheel, so this file loads its own copies, with the mocks, and leaves a clean registry behind.
  beforeAll(async () => {
    vi.resetModules();
    ({ MatchBoard } = await import('./matchBoard'));
    ({ OrderWheel } = await import('./orderWheel'));
    ({ TutorialShowcase, demoPick, sampleBoardBlocks } = await import('./tutorialShowcase'));
  });
  afterAll(() => vi.resetModules());

  let s: ShowcaseModule.TutorialShowcase;
  beforeEach(() => {
    vi.mocked(MatchBoard).mockClear();
    vi.mocked(OrderWheel).mockClear();
    s = new TutorialShowcase({} as HTMLElement, 0, 'var(--team-0)', (a) => (a === 'orderWheel' ? 'Z' : ''), () => 'hover');
  });

  it('opens the scoreboard over a sample match while its step shows and play runs, and closes it after', () => {
    s.set('scoreboard');
    expect(MatchBoard).not.toHaveBeenCalled(); // paused: nothing built yet
    s.setVisible(true);
    expect(board().set).toHaveBeenCalledWith(`Match so far · round ${TUTORIAL.sampleBoard.round}`, sampleBoardBlocks(0));
    expect(vi.mocked(board().setVisible).mock.lastCall).toEqual([true]);
    s.setVisible(false); // the pause menu
    expect(vi.mocked(board().setVisible).mock.lastCall).toEqual([false]);
    s.setVisible(true);
    s.set(null); // the next step
    expect(vi.mocked(board().setVisible).mock.lastCall).toEqual([false]);
    expect(MatchBoard).toHaveBeenCalledTimes(1);
  });

  it("opens the order wheel with its pointer going round the orders, the hint the match's, then closes it", () => {
    s.setVisible(true);
    s.set('orderWheel');
    const update = vi.mocked(wheel().update);
    expect(update.mock.lastCall).toEqual([true, -1, 0, 0, 'none', 'Point at an order']);
    s.frame(TUTORIAL.wheelDemoStep);
    const [open, pick, x, y, , hint] = update.mock.lastCall!;
    expect([open, pick, hint]).toEqual([true, 0, 'Let go of Z to give']);
    expect(Math.hypot(x, y)).toBeCloseTo(ORDER_WHEEL.pointerReach); // on the top order, past the dead zone
    const calls = update.mock.calls.length;
    s.frame(0.1); // same order: nothing redrawn
    expect(update.mock.calls.length).toBe(calls);
    s.set('scoreboard');
    expect(wheel().hide).toHaveBeenCalled();
  });

  it('points at the middle, then each order in turn, round and round', () => {
    const n = ORDER_WHEEL.items.length;
    const picks = Array.from({ length: (n + 1) * 2 }, (_, i) => demoPick((i + 0.5) * TUTORIAL.wheelDemoStep));
    expect(picks).toEqual([...[-1, ...Array.from({ length: n }, (_, i) => i)], ...[-1, ...Array.from({ length: n }, (_, i) => i)]]);
  });

  it("names the sample players as a match does, yours first with you on top, each team's rounds won", () => {
    const blocks = sampleBoardBlocks(1);
    expect(blocks.map((b) => b.team)).toEqual([1, 0]);
    expect(blocks[0]!.title).toBe(`${TEAMS[1].name} (you) · ${TUTORIAL.sampleBoard.score[0]} rounds won`);
    expect(blocks[0]!.rows[0]!).toMatchObject({ name: 'You', you: true });
    expect(blocks[1]!.rows.map((r) => r.name)).toEqual(TUTORIAL.sampleBoard.rows[1]!.map((_, i) => `${TEAMS[0].name} ${i + 1}`));
    // Some are out, so the board shows what a hit player looks like.
    expect(blocks.flatMap((b) => b.rows).some((r) => r.out)).toBe(true);
  });
});

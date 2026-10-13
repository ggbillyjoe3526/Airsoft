import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TUTORIAL_COMPLETE_TEXT, TutorialCompleteDialog } from './tutorialCompleteDialog';
import { stubMenuPage } from './menuTestSupport';

/** QA for M80's "Tutorial complete" pop-up (kept from rarityFilterQA.test.ts when LV1 took out the rarity filter). */
describe('M80: the "Tutorial complete" pop-up', () => {
  beforeEach(() => void stubMenuPage());
  afterEach(() => vi.unstubAllGlobals());
  type Btn = { className: string; textContent: string; click(): void; focus(): void };
  const make = () => {
    const calls: string[] = [];
    const d = new TutorialCompleteDialog({ onPractice: () => calls.push('practice'), onMenu: () => calls.push('menu') });
    const root = d.root as unknown as { open: boolean; children: unknown[]; getAttribute(n: string): string | null; fire(t: string, i?: object): unknown; all(t: string): Btn[]; text: string };
    return { d, root, calls, buttons: root.all('button') };
  };

  it('is titled "Tutorial complete" and offers exactly Practice and Menu (M94: the range renamed Practice)', () => {
    const { root, buttons } = make();
    expect(root.getAttribute('aria-label')).toBe('Tutorial complete');
    expect(root.text).toContain(TUTORIAL_COMPLETE_TEXT.title);
    expect(buttons.map((b) => b.textContent)).toEqual(['Practice', 'Menu']);
  });
  it('opens modal; Practice and Menu each close it and do their one thing', () => {
    for (const [i, want] of [[0, 'practice'], [1, 'menu']] as const) {
      const { d, root, calls, buttons } = make();
      expect(root.open).toBe(false);
      d.open();
      expect(root.open).toBe(true);
      buttons[i]!.click();
      expect(root.open).toBe(false);
      expect(calls).toEqual([want]);
    }
  });
  it('a click outside closes it with no choice made; a click inside does not', () => {
    const { d, root, calls } = make();
    d.open();
    root.fire('click', { clientX: 10, clientY: 10 }); // the fake's box is 200 x 100 at 0,0: inside, so it stays
    expect(root.open).toBe(true);
    root.fire('click', { clientX: 500, clientY: 500 }); // outside
    expect(root.open).toBe(false);
    expect(calls).toEqual([]);
    d.open();
    root.fire('click', { clientX: 500, clientY: 500, target: {} }); // outside the box but on a child, not the backdrop
    expect(root.open).toBe(true);
  });
  it('opening twice and closing twice is harmless', () => {
    const { d, root } = make();
    d.open();
    d.open();
    d.close();
    d.close();
    expect(root.open).toBe(false);
  });
});


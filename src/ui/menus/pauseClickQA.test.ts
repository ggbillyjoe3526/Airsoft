import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_TEXT } from '../../config/menus';
import { EventNode, stubMenuPage } from './menuTestSupport';
import { PauseScreen } from './pauseScreen';

beforeEach(() => stubMenuPage());
afterEach(() => vi.unstubAllGlobals());

const noop = (): void => {};
function make() {
  const onResume = vi.fn();
  const onFullscreen = vi.fn();
  const p = new PauseScreen({ onResume, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop, onSkipRound: noop, onChallenge: noop, onFullscreen });
  return { p, onResume, onFullscreen, root: p.root as unknown as EventNode };
}
const hint = (root: EventNode): string => root.all('p').find((n) => n.className.includes('menu-hint'))!.text;

describe('the pause screen\'s click to resume (IN1, QA)', () => {
  it('ignores a click that lands on a button, link or field, so Settings and Quit still do their own thing', () => {
    const { p, onResume, root } = make();
    p.askForClick('first');
    root.fire('click', { target: { closest: () => ({}) } as never });
    expect(onResume).not.toHaveBeenCalled();
  });

  it('says the second refusal differently, and a click still resumes', () => {
    const { p, onResume, root } = make();
    p.askForClick('again');
    expect(hint(root)).toBe(MENU_TEXT.clickToResume.again);
    root.fire('click');
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('swapping the fullscreen ask for the resume ask changes what a click does', () => {
    const { p, onResume, onFullscreen, root } = make();
    p.askForClick('fullscreen');
    p.askForClick('first');
    root.fire('click');
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onFullscreen).not.toHaveBeenCalled();
  });

  it('a hint set by anything else (Menus.showHint on a screen change) ends the ask', () => {
    const { p, onResume, onFullscreen, root } = make();
    p.askForClick('fullscreen');
    p.showHint('');
    root.fire('click');
    expect(onResume).not.toHaveBeenCalled();
    expect(onFullscreen).not.toHaveBeenCalled();
    expect(root.classList.contains('click-to-resume')).toBe(false);
  });
});

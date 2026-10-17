import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD_TEXT } from '../config/hudText';
import { MENU_TEXT } from '../config/menus';
import { RANGE_CHALLENGE, RANGE_VISUALS } from '../config/range';
import { MemoryStorage } from '../pool/testStorage';
import { SETTINGS_KEY, saveSetting } from '../settings/storage';
import { createChallenge, type RangeChallenge } from '../sim/rangeChallenge';
import { EventNode, stubMenuPage } from './menus/menuTestSupport';
import { PauseScreen } from './menus/pauseScreen';
import { loadPracticeChallenge } from './menus/savedChoices';
import { ChallengeBanner, challengeText, clockText } from './rangeReadout';

beforeEach(() => {
  stubMenuPage();
});
afterEach(() => vi.unstubAllGlobals());

const noop = (): void => {};

describe('the saved setting practiceChallenge (M93)', () => {
  const withSettings = (settings?: Record<string, unknown>): void => {
    const s = new MemoryStorage();
    if (settings) s.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, ...settings }));
    vi.stubGlobal('localStorage', s);
  };

  it('is off on a clean save, on an older save without it, and on a value that is not a boolean', () => {
    withSettings();
    expect(loadPracticeChallenge()).toBe(false);
    withSettings({ volume: 0.4 });
    expect(loadPracticeChallenge()).toBe(false);
    for (const bad of ['true', 1, null]) {
      withSettings({ practiceChallenge: bad });
      expect(loadPracticeChallenge()).toBe(false);
    }
  });

  it('is on once saved on, and off again once saved off', () => {
    const s = new MemoryStorage();
    vi.stubGlobal('localStorage', s);
    saveSetting('practiceChallenge', true, s);
    expect(loadPracticeChallenge()).toBe(true);
    saveSetting('practiceChallenge', false, s);
    expect(loadPracticeChallenge()).toBe(false);
  });
});

describe('the challenge line and banner (M93)', () => {
  const at = (over: Partial<RangeChallenge>): RangeChallenge => ({ ...createChallenge(0), ...over });

  it('formats the clock up to the next whole second, never negative', () => {
    expect(clockText(60)).toBe('1:00');
    expect(clockText(59.01)).toBe('1:00');
    expect(clockText(42)).toBe('0:42');
    expect(clockText(9.2)).toBe('0:10');
    expect(clockText(0)).toBe('0:00');
    expect(clockText(-3)).toBe('0:00');
  });

  it('is empty when off, and tells what to do when ready, with the best or "no best yet"', () => {
    expect(challengeText(at({ phase: 'off' }))).toBe('');
    expect(challengeText(at({ phase: 'ready' }))).toBe('Timed challenge · shoot the START plate to begin · no best yet');
    expect(challengeText(at({ phase: 'ready', best: 14 }))).toContain('best 14');
    expect(challengeText(at({ phase: 'countdown', best: 3 }))).toContain('orange');
  });

  it('shows time left, hits (singular and plural) and the best while running', () => {
    expect(challengeText(at({ phase: 'running', clock: 42, hits: 1, best: 5 }))).toBe('0:42 · 1 hit · best 5');
    expect(challengeText(at({ phase: 'running', clock: 41.5, hits: 12 }))).toBe('0:42 · 12 hits · no best yet');
  });

  it('shows the last run after it, with accuracy when BBs were fired and "new best!" only when it was', () => {
    const last = { hits: 9, shots: 12, missed: 2, best: true };
    const t = challengeText(at({ phase: 'ready', best: 9, last }));
    expect(t).toContain('Time! 9 hits');
    expect(t).toContain('75 % accuracy');
    expect(t).toContain('new best!');
    const t2 = challengeText(at({ phase: 'ready', best: 20, last: { ...last, best: false } }));
    expect(t2).not.toContain('new best');
    expect(t2).toContain('best 20');
    expect(challengeText(at({ phase: 'ready', last: { hits: 0, shots: 0, missed: 0, best: false } }))).not.toContain('accuracy');
  });

  it('says a run played with Dev settings was not kept (BP5)', () => {
    const t = challengeText(at({ phase: 'ready', best: 4, last: { hits: 30, shots: 31, missed: 0, best: false, helped: true } }));
    expect(t).toContain('Time! 30 hits');
    expect(t).toContain('not kept (Dev settings)');
    expect(t).not.toContain('best 4');
  });

  describe('banner', () => {
    const make = () => {
      const parent = new EventNode('div');
      const b = new ChallengeBanner(parent as unknown as HTMLElement);
      const root = parent.children[0] as EventNode;
      return { b, root };
    };

    it('is hidden at first, counts down 3-2-1 in the countdown, and hides when the challenge is not shown', () => {
      const { b, root } = make();
      expect(root.hidden).toBe(true);
      const c = at({ phase: 'countdown', clock: RANGE_CHALLENGE.countdown });
      b.frame(0.016, c, true);
      expect(root.hidden).toBe(false);
      expect(root.textContent).toBe('3');
      c.clock = 1.2;
      b.frame(0.016, c, true);
      expect(root.textContent).toBe('2');
      c.clock = 0.4;
      b.frame(0.016, c, true);
      expect(root.textContent).toBe('1');
      b.frame(0.016, c, false);
      expect(root.hidden).toBe(true);
    });

    it('says Go! for its moment after the start cue, then goes away; Time! or New best! at the end', () => {
      const { b, root } = make();
      const c = at({ phase: 'running', clock: 60 });
      b.cue('go', c);
      b.frame(0.1, c, true);
      expect(root.textContent).toBe('Go!');
      expect(root.hidden).toBe(false);
      b.frame(RANGE_VISUALS.banner.go, c, true);
      expect(root.hidden).toBe(true);
      b.cue('time', at({ phase: 'ready', last: { hits: 4, shots: 5, missed: 1, best: false } }));
      b.frame(0.1, c, true);
      expect(root.textContent).toBe('Time!');
      b.cue('time', at({ phase: 'ready', last: { hits: 4, shots: 5, missed: 1, best: true } }));
      b.frame(0.1, c, true);
      expect(root.textContent).toBe('New best!');
      b.cue('count', c); // a count cue says nothing by itself
      b.frame(RANGE_VISUALS.banner.time + 0.1, c, true);
      expect(root.hidden).toBe(true);
    });

    it('drops a word at once when the challenge is turned off', () => {
      const { b, root } = make();
      b.cue('go', at({}));
      b.frame(0.01, at({ phase: 'running' }), true);
      expect(root.hidden).toBe(false);
      b.frame(0.01, at({ phase: 'off' }), true);
      expect(root.hidden).toBe(true);
    });
  });
});

describe('the pause screen\'s Timed challenge button (M93)', () => {
  const pause = () => new PauseScreen({ onResume: noop, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop, onSkipRound: noop, onChallenge: noop, onFullscreen: noop });
  const button = (p: PauseScreen): EventNode => (p.root as unknown as EventNode).all('button').find((b) => b.text.startsWith('Timed challenge'))!;

  it('is hidden until a screen offers it (a match, the tutorial), and shows on the range', () => {
    const p = pause();
    expect(button(p).hidden).toBe(true);
    p.setChallenge(false);
    expect(button(p).hidden).toBe(false);
    p.setChallenge(null);
    expect(button(p).hidden).toBe(true);
  });

  it('says whether it is on and exposes the pressed state', () => {
    const p = pause();
    p.setChallenge(false);
    expect(button(p).text).toBe(HUD_TEXT.challengeButton.off);
    expect(button(p).getAttribute('aria-pressed')).toBe('false');
    p.setChallenge(true);
    expect(button(p).text).toBe(HUD_TEXT.challengeButton.on);
    expect(button(p).getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onChallenge when pressed', () => {
    const onChallenge = vi.fn();
    const p = new PauseScreen({ onResume: noop, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop, onSkipRound: noop, onChallenge, onFullscreen: noop });
    p.setChallenge(false);
    button(p).fire('click');
    expect(onChallenge).toHaveBeenCalledTimes(1);
  });
});

describe('the pause screen\'s click to resume (IN1)', () => {
  const hint = (p: PauseScreen): EventNode => (p.root as unknown as EventNode).all('p').find((n) => n.className.includes('menu-hint'))!;

  it('resumes on a click anywhere only once the browser refused the mouse, and says so', () => {
    const onResume = vi.fn();
    const p = new PauseScreen({ onResume, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop, onSkipRound: noop, onChallenge: noop, onFullscreen: noop });
    const root = p.root as unknown as EventNode;
    root.fire('click');
    expect(onResume).not.toHaveBeenCalled();
    p.askForClick('first');
    expect(hint(p).text).toBe(MENU_TEXT.clickToResume.first);
    expect(root.classList.contains('click-to-resume')).toBe(true);
    root.fire('click');
    expect(onResume).toHaveBeenCalledTimes(1);
    // Any other hint (or clearing it, as Resume does) ends it.
    p.showHint('');
    root.fire('click');
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(root.classList.contains('click-to-resume')).toBe(false);
  });

  it('goes fullscreen on the click the Fullscreen key asked for', () => {
    const onResume = vi.fn();
    const onFullscreen = vi.fn();
    const p = new PauseScreen({ onResume, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop, onSkipRound: noop, onChallenge: noop, onFullscreen });
    p.askForClick('fullscreen');
    expect(hint(p).text).toBe(MENU_TEXT.clickToResume.fullscreen);
    (p.root as unknown as EventNode).fire('click');
    expect(onFullscreen).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });
});

describe('the challenge line on a map (M94)', () => {
  const at = (over: Partial<RangeChallenge>): RangeChallenge => ({ ...createChallenge(0), ...over });

  it('tells you to move up, since a target lights only once you see it; the run and its score read as on the range', () => {
    for (const phase of ['ready', 'countdown'] as const) {
      const t = challengeText(at({ phase, best: 4 }), true);
      expect(t).toContain('move up');
      expect(t).toContain('as you see them');
      expect(t).toContain('best 4');
      expect(challengeText(at({ phase }))).not.toContain('move up');
    }
    for (const over of [{ phase: 'running', clock: 42, hits: 1, best: 5 }, { phase: 'ready', last: { hits: 9, shots: 12, missed: 2, best: true } }] as const) {
      expect(challengeText(at(over), true)).toBe(challengeText(at(over)));
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import poolText from '../../../data/pool.md?raw';
import { RECORDS_KEY } from '../../config/matchInfo';
import { DEFAULT_MATCH_RULES } from '../../config/matchRules';
import { MENU_TEXT, PLAY_TEXT } from '../../config/menus';
import { MATCH_MODES } from '../../config/modes';
import { loadPool } from '../../pool/pool';
import { MemoryStorage } from '../../pool/testStorage';
import { GAME_LEVELS } from '../../progress/gameLevels';
import { newProgress } from '../../progress/progress';
import { SETTINGS_KEY, saveSetting } from '../../settings/storage';
import { ArmoryScreen } from './armoryScreen';
import { TopBar } from './chrome';
import { EventNode, stubMenuPage } from './menuTestSupport';
import { PauseScreen } from './pauseScreen';
import { ResultScreen } from './resultScreen';
import { loadMatchStarted, loadMode, loadTutorialDone } from './savedChoices';
import { type PlayModel, type PlayView, SetupScreen } from './setupScreen';
import { TitleScreen, tutorialOffered } from './titleScreen';

/**
 * QA for menu redesign 2 (M100), on the fake DOM: the clean-save Tutorial logic, the plain title, the top bar, the
 * keys and the mouse on the screens and Practice as the last mode. The Armory's level track: armoryScreen.test.ts (LV1).
 */
beforeEach(() => {
  stubMenuPage();
});
afterEach(() => vi.unstubAllGlobals());

const noop = (): void => {};
const node = (e: unknown): EventNode => e as EventNode;
/** The text a person can read in `n`: nothing under a hidden element. */
function shown(n: EventNode): string[] {
  if (n.hidden) return [];
  if (n.children.length === 0) return n.textContent ? [n.textContent] : [];
  return (n.children as EventNode[]).flatMap(shown);
}
const buttons = (n: EventNode): string[] => n.all('button').filter((b) => !b.hidden).map((b) => b.text);

describe('the Tutorial on a clean save only (M100 QA)', () => {
  const storage = (settings?: Record<string, unknown>, records?: string): MemoryStorage => {
    const s = new MemoryStorage();
    if (settings) s.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, ...settings }));
    if (records !== undefined) s.setItem(RECORDS_KEY, records);
    return s;
  };

  it.each([
    ['nothing saved at all', storage(), false],
    ['a save with settings but no matchStarted field (a build from before it)', storage({ difficulty: 'hard', tutorialDone: false, volume: 0.5 }), false],
    ['matchStarted true', storage({ matchStarted: true }), true],
    ['matchStarted false and nothing else', storage({ matchStarted: false }), false],
    ['matchStarted false, but records saved (the first match was played)', storage({ matchStarted: false }, JSON.stringify({ version: 1 })), true],
    ['an old save with records and no field', storage({ difficulty: 'easy' }, JSON.stringify({ version: 1, streak: 2 })), true],
    ['records that cannot be parsed (the key is there: a returning player)', storage({}, '{oops'), true],
    ['matchStarted as the text "true"', storage({ matchStarted: 'true' }), false],
    ['matchStarted as 1', storage({ matchStarted: 1 }), false],
    ['matchStarted as null', storage({ matchStarted: null }), false],
  ])('a first match started? %s -> %s', (_name, s, expected) => {
    expect(loadMatchStarted(s)).toBe(expected);
  });

  it('is false, without a throw, when the storage is missing or refuses to be read', () => {
    expect(loadMatchStarted(null)).toBe(false);
    const refusing = { getItem: () => { throw new Error('blocked'); }, setItem: noop, removeItem: noop, key: () => null, clear: noop, length: 0 } as unknown as Storage;
    expect(() => loadMatchStarted(refusing)).not.toThrow();
    expect(loadMatchStarted(refusing)).toBe(false);
  });

  it('is kept: written by the first match, read back by a later visit, and a second write changes nothing', () => {
    const s = storage();
    expect(loadMatchStarted(s)).toBe(false);
    saveSetting('matchStarted', true, s);
    saveSetting('matchStarted', true, s);
    expect(loadMatchStarted(s)).toBe(true);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toMatchObject({ matchStarted: true });
  });

  it('is offered by the two saved flags together exactly when neither is set (clean, tutorial only, match only, old save with records)', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const offeredFor = (s: MemoryStorage): boolean => {
      vi.stubGlobal('localStorage', s);
      return tutorialOffered(loadTutorialDone(), loadMatchStarted(s));
    };
    expect(offeredFor(storage())).toBe(true);
    expect(offeredFor(storage({ tutorialDone: true }))).toBe(false);
    expect(offeredFor(storage({ matchStarted: true }))).toBe(false);
    expect(offeredFor(storage({ tutorialDone: false }, JSON.stringify({ version: 1 })))).toBe(false);
    expect(offeredFor(storage({ tutorialDone: true, matchStarted: true }))).toBe(false);
  });
});

describe('the plain title (M100 QA)', () => {
  const title = (offered: boolean) => new TitleScreen({ onStart: noop, onTutorial: noop, onSettings: noop }, offered);
  /** What the title shows once the menus have un-hidden it. */
  const read = (offered: boolean): string[] => {
    const t = title(offered);
    t.root.hidden = false;
    return shown(node(t.root));
  };

  it('reads exactly: the wordmark, the tagline, START, the Tutorial under it on a clean save, Fullscreen and the version, in that order', () => {
    expect(read(true)).toEqual(['Airsoft', 'Call your hit. Go again.', 'START', 'Tutorial', 'Fullscreen', __BUILD_VERSION__.label]);
    expect(read(false)).toEqual(['Airsoft', 'Call your hit. Go again.', 'START', 'Fullscreen', __BUILD_VERSION__.label]);
  });

  it('puts the Tutorial after START in the same column, and the version after everything else as the last child', () => {
    const root = node(title(true).root);
    const actions = root.querySelector('.title-actions')!;
    expect(actions.all('button').map((b) => b.text)).toEqual(['START', 'Tutorial']);
    expect((root.children.at(-1) as EventNode).className).toBe('title-version');
  });

  it('puts the keyboard on START, and never on the Tutorial, whichever is shown', () => {
    for (const offered of [true, false]) {
      const root = node(title(offered).root);
      expect(root.querySelectorAll('[data-autofocus]').map((n) => n.text)).toEqual(['START']);
    }
  });

  it('a hidden Tutorial stays out of reach: hidden, and T does nothing, until it is shown again', () => {
    const ran: string[] = [];
    const t = new TitleScreen({ onStart: noop, onTutorial: () => ran.push('tutorial'), onSettings: noop }, false);
    const tab = t.hints.find((h) => h.code === 'KeyT')!;
    tab.run!();
    expect(ran).toEqual([]);
    t.setTutorialShown(true);
    tab.run!();
    expect(ran).toEqual(['tutorial']);
  });

  it('START opens the Match screen: its button calls onStart, and Enter (no code, so the focused START) is not a second route', () => {
    const ran: string[] = [];
    const t = new TitleScreen({ onStart: () => ran.push('start'), onTutorial: noop, onSettings: noop }, true);
    node(t.root).all('button')[0]!.click();
    expect(ran).toEqual(['start']);
    expect(t.hints.find((h) => h.keys.includes('Enter'))!.code).toBeUndefined();
  });

  it('no screen but the title shows the build\'s version', () => {
    const label = __BUILD_VERSION__.label;
    const model = { picks: () => ({ map: 'depot', mode: 'elimination', difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'skirmish', rules: { ...DEFAULT_MATCH_RULES } }), lightingOf: () => 'day', setMode: noop, practicePlace: () => 'range', setPracticePlace: noop } as unknown as PlayModel;
    const setup = new SetupScreen(model, { equipped: () => [] } as never, { pictures: null, realistic: () => false }, { onLoadout: noop, onBack: noop, onPlay: noop, onPractice: noop });
    const pool = loadPool(poolText);
    const armory = new ArmoryScreen({ pool: () => pool, levels: GAME_LEVELS, progress: () => newProgress(GAME_LEVELS), levellingOff: () => false, devContent: () => false });
    const pause = new PauseScreen({ onResume: noop, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop, onSkipRound: noop, onChallenge: noop, onFullscreen: noop });
    const result = new ResultScreen({ onPlayAgain: noop, onSummary: noop, onChangeSetup: noop, onTitle: noop });
    const bar = new TopBar(noop, noop);
    bar.setLevel({ level: 1, into: 50, next: 300, toNext: '250 XP to level 2' });
    for (const root of [setup.root, armory.root, pause.root, result.root, bar.root]) {
      root.hidden = false;
      expect(shown(node(root)).join(' ')).not.toContain(label);
      expect(shown(node(root)).length).toBeGreaterThan(0);
    }
  });
});

describe('the top bar (M100 QA)', () => {
  it('reads the level as "Lv" and its number, from level 0 to the cap, and hides it with levelling off (LV1)', () => {
    const bar = new TopBar(noop, noop);
    const chips = (): string[] => node(bar.root).querySelector('.menu-status')!.children.filter((c) => !c.hidden).map((c) => c.text);
    bar.setLevel({ level: 0, into: 0, next: 100, toNext: '100 XP to level 1' });
    expect(chips()).toEqual(['LVL 0']);
    bar.setLevel({ level: 10, into: 0, next: null, toNext: '' });
    expect(chips()).toEqual(['LVL 10']);
    bar.setLevel(null);
    expect(chips()).toEqual([]);
  });

  it('has nothing but the wordmark button, the four places and the level (no version, no key, no hint, no wallet)', () => {
    const bar = new TopBar(noop, noop);
    bar.setLevel({ level: 3, into: 50, next: 500, toNext: '450 XP to level 4' });
    const root = node(bar.root);
    // The third, Back to practice (M95), shows only on the Loadout opened from Practice.
    expect(root.children.map((c) => (c as EventNode).tag)).toEqual(['button', 'nav', 'button', 'div']);
    expect(root.children[2]!.hidden).toBe(true);
    expect(shown(root)).toEqual(['Airsoft', ...MENU_TEXT.nav.map((n) => n.label), 'LVL 3']);
    expect(shown(root).join(' ')).not.toMatch(/\bFC\b|Token/);
    expect(shown(root).join(' ')).not.toContain(__BUILD_VERSION__.label);
  });
});

describe('every screen can be left and used with the mouse, and the keys still work (M100 QA)', () => {
  it('each key the title answers to has a button on it for the mouse, except Settings, which START and the top bar reach', () => {
    const t = new TitleScreen({ onStart: noop, onTutorial: noop, onSettings: noop }, true);
    const names = buttons(node(t.root));
    expect(names).toContain(MENU_TEXT.hints.start);
    expect(names).toContain(MENU_TEXT.hints.tutorial);
    expect(MENU_TEXT.nav.map((n) => n.id)).toContain('settings');
  });

  it('the top bar leads to every screen a person needs and the wordmark leads back, each by a click (the level to the Armory too)', () => {
    const went: string[] = [];
    const bar = new TopBar((p) => went.push(p), () => went.push('mark'));
    const root = node(bar.root);
    for (const b of root.all('button')) b.click();
    expect(went).toEqual(['mark', 'setup', 'loadout', 'armory', 'settings', 'armory']);
  });

  it('a screen opened from the pause menu keeps only itself on the bar, and the wordmark button becomes Back', () => {
    const bar = new TopBar(noop, noop);
    bar.show('settings', true);
    const shownPlaces = node(bar.root).querySelector('nav')!.children.filter((c) => !c.hidden).map((c) => c.text);
    expect(shownPlaces).toEqual(['Settings']);
    expect(shown(node(bar.root))[0]).toBe('Back');
  });

  it('the Armory answers to no key of its own and has no button to press: it only shows the levels (LV1, the Shots gone)', () => {
    const pool = loadPool(poolText);
    const screen = new ArmoryScreen({ pool: () => pool, levels: GAME_LEVELS, progress: () => newProgress(GAME_LEVELS), levellingOff: () => false, devContent: () => false });
    expect(screen.hints).toEqual([]);
    // Its only buttons are the level track's scroll arrows (MR1), out of the tab order.
    expect(node(screen.root).all('button').map((b) => b.tabIndex)).toEqual([-1, -1]);
    expect(node(screen.root).querySelectorAll('[data-autofocus]').map((n) => n.tag)).toEqual(['h1']);
  });

  it('the pause and result screens answer to no key of their own (Esc and Enter belong to the menus and the focused button)', () => {
    const pause = new PauseScreen({ onResume: noop, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop, onSkipRound: noop, onChallenge: noop, onFullscreen: noop });
    const result = new ResultScreen({ onPlayAgain: noop, onSummary: noop, onChangeSetup: noop, onTitle: noop });
    expect([pause.hints, result.hints]).toEqual([[], []]);
    expect(buttons(node(pause.root))).toContain('Resume');
    expect(buttons(node(result.root))).toEqual(expect.arrayContaining(['Play again', 'New game', 'Summary', 'Quit']));
  });
});

describe('Practice, the last mode of the Match screen (M100 QA)', () => {
  const view = (picks: unknown, devContent = false) =>
    ({ played: picks, devContent, run: false, sizeMax: 3, sizeMin: 1, mapLine: 'Depot · Day', modeLabel: 'Elimination', rules: 'Skirmish · 3v3', bots: 'Normal bots', notes: 'a note', loadout: { replicas: 'AEG', detail: '' }, pays: 'Gives XP', practice: { mapLine: 'Range' } }) as unknown as PlayView;

  function setup(mode = 'elimination') {
    const picks = { map: 'depot', mode, difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'skirmish', rules: { ...DEFAULT_MATCH_RULES } };
    const setMode = vi.fn((m: string) => void (picks.mode = m));
    const model = { picks: () => picks, lightingOf: () => 'day', setMode, practicePlace: () => 'range', setPracticePlace: noop } as unknown as PlayModel;
    const ran: string[] = [];
    const screen = new SetupScreen(model, { equipped: () => [] } as never, { pictures: null, realistic: () => false }, { onLoadout: noop, onBack: noop, onPlay: () => ran.push('match'), onPractice: () => ran.push('practice') });
    screen.refresh(view(picks));
    const root = node(screen.root);
    const modes = root.querySelector('.mode-cards')!;
    const name = (w: EventNode): string => w.querySelector('.choice-name')!.text;
    return {
      picks,
      setMode,
      ran,
      screen,
      root,
      refresh: (dev = false) => screen.refresh(view(picks, dev)),
      cards: () => modes.children as EventNode[],
      card: (n: string): EventNode => (modes.children as EventNode[]).find((w) => name(w) === n)!.children[0] as EventNode,
      line: (cls: string): EventNode => root.querySelector(`.${cls}`)!,
    };
  }

  it('stays the last card that is shown with Dev content on or off, and on a map that offers no Extraction', () => {
    const s = setup();
    for (const dev of [false, true]) {
      s.refresh(dev);
      const visible = s.cards().filter((w) => !w.hidden).map((w) => w.querySelector('.choice-name')!.text);
      expect(visible.at(-1), `dev content ${dev}`).toBe('Practice');
      expect(visible.slice(0, -1).every((n) => MATCH_MODES.some((m) => m.label === n))).toBe(true);
    }
    expect(s.cards().map((w) => w.querySelector('.choice-name')!.text).at(-1)).toBe(PLAY_TEXT.practice.label);
  });

  it('is never reported to the game or saved as the mode: picking it, leaving it for the saved mode and back again, writes and sets nothing', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const s = setup();
    s.card('Practice').click();
    s.card('Elimination').click();
    s.card('Practice').click();
    s.card('Practice').click();
    expect(s.setMode).not.toHaveBeenCalled();
    expect(storage.getItem(SETTINGS_KEY)).toBeNull();
    expect(s.picks.mode).toBe('elimination');
  });

  it('a saved mode of "practice" (from outside, or a future build) is read as the default mode, not as a mode', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    saveSetting('mode', 'practice', storage);
    expect(loadMode()).toBe('elimination');
    expect(MATCH_MODES.map((m) => m.id)).not.toContain('practice');
  });

  it('with Practice picked, every other mode card is unpressed, Start practice runs the range once, and a match is never started', () => {
    const s = setup('attackDefend');
    s.card('Practice').click();
    expect(s.cards().map((w) => (w.children[0] as EventNode).getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true']);
    s.line('play-button').click();
    expect(s.ran).toEqual(['practice']);
  });

  it('keeps the Map section 01 and the Mode section 02 while Practice is picked (M94: the Map cards offer its places)', () => {
    const s = setup();
    const number = s.root.querySelectorAll('.menu-section-n').map((n) => n.text);
    expect(number).toEqual(['01', '02', '03']);
    s.card('Practice').click();
    expect(s.root.querySelectorAll('.menu-section-n').map((n) => n.text)).toEqual(['01', '02', '03']);
    s.card('Attack and Defend').click();
    expect(s.root.querySelectorAll('.menu-section-n').map((n) => n.text)).toEqual(['01', '02', '03']);
  });

  it('shows the range in "Your match" while Practice is picked, and the match again once a different mode is picked', () => {
    const s = setup();
    s.card('Practice').click();
    expect(s.line('play-map-line').textContent).toBe(PLAY_TEXT.practice.mapLine);
    s.card('Attack and Defend').click();
    s.refresh();
    expect(s.line('play-map-line').textContent).toBe('Depot · Day');
    expect(s.line('play-pays').hidden).toBe(false);
  });

  // The saved mode's own card picked while Practice is on is not a change the model reports: the screen redraws "Your match" itself.
  it('picking the saved mode again while Practice is picked brings "Your match" back to the match, not the range (setupScreen.setPractice / choiceCards.pick)', () => {
    const s = setup();
    s.card('Practice').click();
    s.card('Elimination').click();
    expect(s.line('play-map-line').textContent).toBe('Depot · Day');
    expect(s.line('play-pays').hidden).toBe(false);
    expect(s.line('play-button').text).toContain('Start match');
  });

  it('the button reads Start match after the saved mode is picked again, whatever "Your match" says', () => {
    const s = setup();
    s.card('Practice').click();
    expect(s.line('play-button').text).toContain('Start practice');
    s.card('Elimination').click();
    expect(s.line('play-button').text).toContain('Start match');
    s.line('play-button').click();
    expect(s.ran).toEqual(['match']);
  });
});

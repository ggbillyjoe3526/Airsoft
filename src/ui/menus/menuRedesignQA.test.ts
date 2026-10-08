import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import poolText from '../../../pool.md?raw';
import { RECORDS_KEY } from '../../config/matchInfo';
import { DEFAULT_MATCH_RULES } from '../../config/matchRules';
import { MENU_TEXT, PLAY_TEXT } from '../../config/menus';
import { MATCH_MODES } from '../../config/modes';
import { newCollection } from '../../pool/collection';
import { loadPool } from '../../pool/pool';
import { MemoryStorage } from '../../pool/testStorage';
import { SETTINGS_KEY, saveSetting } from '../../settings/storage';
import { ArmoryScreen } from './armoryScreen';
import { TopBar } from './chrome';
import { CATEGORY_LABELS } from './itemTile';
import { EventNode, stubMenuPage } from './menuTestSupport';
import { PauseScreen } from './pauseScreen';
import { ResultScreen } from './resultScreen';
import { loadMatchStarted, loadMode, loadTutorialDone } from './savedChoices';
import { type PlayModel, type PlayView, SetupScreen } from './setupScreen';
import { TitleScreen, tutorialOffered } from './titleScreen';

/**
 * QA for menu redesign 2 (M100), on the fake DOM: the clean-save Tutorial logic, the plain title, the top bar, the
 * keys and the mouse on the screens, Practice as the last mode, and the collection's columns.
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

  it('reads exactly: the wordmark, the tagline, START, the Tutorial under it on a clean save, and the version, in that order', () => {
    expect(read(true)).toEqual(['Airsoft', 'Call your hit. Go again.', 'START', 'Tutorial', __BUILD_VERSION__.label]);
    expect(read(false)).toEqual(['Airsoft', 'Call your hit. Go again.', 'START', __BUILD_VERSION__.label]);
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
    const model = { picks: () => ({ map: 'depot', mode: 'elimination', difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'skirmish', rules: { ...DEFAULT_MATCH_RULES } }), lightingOf: () => 'day', supply: () => null, setMode: noop } as unknown as PlayModel;
    const setup = new SetupScreen(model, { equipped: () => [] } as never, { pictures: null, realistic: () => false }, { onLoadout: noop, onBack: noop, onPlay: noop, onPractice: noop });
    const pool = loadPool(poolText);
    const armory = new ArmoryScreen({ pool: () => pool, collection: () => newCollection(pool, 1), equipped: () => [], onChange: () => false });
    const pause = new PauseScreen({ onResume: noop, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop });
    const result = new ResultScreen({ onPlayAgain: noop, onSummary: noop, onChangeSetup: noop, onTitle: noop });
    const bar = new TopBar(noop, noop);
    bar.setWallet({ fc: 100, tokens: 2 }, false);
    for (const root of [setup.root, armory.root, pause.root, result.root, bar.root]) {
      root.hidden = false;
      expect(shown(node(root)).join(' ')).not.toContain(label);
      expect(shown(node(root)).length).toBeGreaterThan(0);
    }
  });
});

describe('the top bar (M100 QA)', () => {
  it('reads Tokens in the singular for one and the plural otherwise, FC with a thousands comma, and hides both with no wallet', () => {
    const bar = new TopBar(noop, noop);
    const chips = (): string[] => node(bar.root).querySelector('.menu-wallet')!.children.filter((c) => !c.hidden).map((c) => c.text);
    bar.setWallet({ fc: 1600, tokens: 1 }, false);
    expect(chips()).toEqual(['1,600 FC', '1 Token']);
    bar.setWallet({ fc: 0, tokens: 0 }, false);
    expect(chips()).toEqual(['0 FC', '0 Tokens']);
    bar.setWallet(null, true);
    expect(chips()).toEqual([]);
  });

  it('has nothing but the wordmark button, the four places and the wallet (no version, no key, no hint)', () => {
    const bar = new TopBar(noop, noop);
    bar.setWallet({ fc: 100, tokens: 2 }, false);
    const root = node(bar.root);
    expect(root.children.map((c) => (c as EventNode).tag)).toEqual(['button', 'nav', 'div']);
    expect(shown(root)).toEqual(['Airsoft', ...MENU_TEXT.nav.map((n) => n.label), '100 FC', '2 Tokens']);
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

  it('the top bar leads to every screen a person needs and the wordmark leads back, each by a click', () => {
    const went: string[] = [];
    const bar = new TopBar((p) => went.push(p), () => went.push('mark'));
    const root = node(bar.root);
    for (const b of root.all('button')) b.click();
    expect(went).toEqual(['mark', 'setup', 'loadout', 'armory', 'settings']);
  });

  it('a screen opened from the pause menu keeps only itself on the bar, and the wordmark button becomes Back', () => {
    const bar = new TopBar(noop, noop);
    bar.show('settings', true);
    const shownPlaces = node(bar.root).querySelector('nav')!.children.filter((c) => !c.hidden).map((c) => c.text);
    expect(shownPlaces).toEqual(['Settings']);
    expect(shown(node(bar.root))[0]).toBe('Back');
  });

  it('the Armory\'s Space takes a Shot when one can be paid for, and does nothing, quietly, when it cannot', () => {
    const pool = loadPool(poolText);
    const make = (fc: number) => {
      const c = newCollection(pool, 5);
      c.fc = fc;
      let changes = 0;
      const screen = new ArmoryScreen({ pool: () => pool, collection: () => c, equipped: () => [], onChange: () => (changes++, false) });
      return { c, screen, changes: () => changes };
    };
    const space = (s: ArmoryScreen) => s.hints.find((h) => h.code === 'Space')!;
    const broke = make(0);
    expect(() => space(broke.screen).run!()).not.toThrow();
    expect([broke.changes(), Object.keys(broke.c.owned).length]).toEqual([0, Object.keys(newCollection(pool, 5).owned).length]);
    const rich = make(1_000_000);
    const before = rich.c.fc;
    space(rich.screen).run!();
    expect(rich.changes()).toBe(1);
    expect(rich.c.fc).toBeLessThan(before);
    // Space presses a focused button instead while a control has the keyboard.
    expect(space(rich.screen).idle).toBe(true);
    // The button it presses is on the screen for the mouse, named for the key.
    expect(buttons(node(rich.screen.root)).some((t) => t.includes(MENU_TEXT.hints.shot))).toBe(true);
  });

  it('the pause and result screens answer to no key of their own (Esc and Enter belong to the menus and the focused button)', () => {
    const pause = new PauseScreen({ onResume: noop, onLoadout: noop, onSettings: noop, onQuit: noop, onSkipStep: noop, onSkipTutorial: noop });
    const result = new ResultScreen({ onPlayAgain: noop, onSummary: noop, onChangeSetup: noop, onTitle: noop });
    expect([pause.hints, result.hints]).toEqual([[], []]);
    expect(buttons(node(pause.root))).toContain('Resume');
    expect(buttons(node(result.root))).toEqual(expect.arrayContaining(['Play again', 'New game', 'Summary', 'Quit']));
  });
});

describe('Practice, the last mode of the Match screen (M100 QA)', () => {
  const view = (picks: unknown, devContent = false) =>
    ({ played: picks, devContent, run: false, sizeMax: 3, mapLine: 'Depot · Day', still: null, modeLabel: 'Elimination', rules: 'Skirmish · 3v3', bots: 'Normal bots', notes: 'a note', loadout: { replicas: 'AEG', detail: '' }, pays: 'Pays Field Credits' }) as unknown as PlayView;

  function setup(mode = 'elimination') {
    const picks = { map: 'depot', mode, difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'skirmish', rules: { ...DEFAULT_MATCH_RULES } };
    const setMode = vi.fn((m: string) => void (picks.mode = m));
    const model = { picks: () => picks, lightingOf: () => 'day', supply: () => null, setMode } as unknown as PlayModel;
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

  it('numbers the Mode section 01 while the Map section is gone, and 02 again with it back', () => {
    const s = setup();
    const number = s.root.querySelectorAll('.menu-section-n').map((n) => n.text);
    expect(number).toEqual(['01', '02', '03']);
    s.card('Practice').click();
    expect(s.root.querySelectorAll('.menu-section-n').map((n) => n.text)).toEqual(['01', '01', '03']);
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

  // The saved mode's own card picked while Practice is on is not a change (nothing is reported, so nothing redraws "Your match").
  it.fails('picking the saved mode again while Practice is picked brings "Your match" back to the match, not the range (setupScreen.setPractice / choiceCards.pick)', () => {
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

describe('the collection in a column for each kind (M100 QA)', () => {
  const pool = loadPool(poolText);
  const armory = (owned: Record<string, number> = {}, assets = pool.assets) => {
    const c = newCollection(pool, 2);
    c.owned = { ...owned };
    const screen = new ArmoryScreen({ pool: () => ({ ...pool, assets }), collection: () => c, equipped: () => [], onChange: () => false });
    const root = node(screen.root);
    return { root, kinds: () => root.querySelectorAll('.armory-kind') };
  };
  const categories = (assets: readonly { category: string; tag?: string }[]): string[] => [...new Set(assets.filter((a) => a.tag !== 'dev').map((a) => a.category))];

  it('makes one column per kind the shop gives, in the pool\'s order, each headed by its name, and puts every card in its own kind\'s column', () => {
    const a = armory();
    const wanted = categories(pool.assets);
    expect(a.kinds().map((k) => k.dataset.kind)).toEqual(wanted);
    for (const k of a.kinds()) {
      const kind = k.dataset.kind as keyof typeof CATEGORY_LABELS;
      expect(k.querySelector('h3')!.text).toBe(CATEGORY_LABELS[kind]);
      expect(k.getAttribute('aria-label')).toBe(CATEGORY_LABELS[kind]);
      const cards = k.querySelectorAll('.armory-row').map((r) => r.querySelector('.armory-row-name')!.text);
      const expected = pool.assets.filter((x) => x.category === kind && x.tag !== 'dev').map((x) => x.name);
      expect(cards).toEqual(expected);
    }
  });

  it('has a heading with words for every kind (never "undefined"), and no empty column', () => {
    const a = armory();
    for (const k of a.kinds()) {
      expect(k.querySelector('h3')!.text).toMatch(/\S/);
      expect(k.querySelector('h3')!.text).not.toMatch(/undefined/);
      expect(k.querySelectorAll('.armory-row').length).toBeGreaterThan(0);
    }
    expect(a.root.querySelectorAll('.armory-row')).toHaveLength(a.kinds().reduce((n, k) => n + k.querySelectorAll('.armory-row').length, 0));
  });

  it('adds a column only for an item you own of a kind the shop does not give (a dev light), and then it is a column of its own', () => {
    const dev = pool.assets.find((x) => x.tag === 'dev')!;
    const without = armory().kinds().map((k) => k.dataset.kind);
    expect(without).not.toContain(dev.category);
    const withIt = armory({ [`${dev.id}@common`]: 1 }).kinds();
    expect(withIt.map((k) => k.dataset.kind)).toContain(dev.category);
    expect(withIt.find((k) => k.dataset.kind === dev.category)!.querySelectorAll('.armory-row')).toHaveLength(1);
  });

  it('keeps the scrap hint, the "best copy" note and Scrap all above the columns, and the columns in one list', () => {
    const a = armory({ [`${pool.assets[0]!.id}@common`]: 3 });
    const owned = a.root.querySelector('.armory-owned')!;
    expect((owned.children as EventNode[]).map((c) => c.className)).toEqual(['loadout-replica-head', 'menu-readout armory-scrap-hint', 'menu-readout', 'armory-list']);
    expect(owned.querySelectorAll('.armory-list')).toHaveLength(1);
  });

  // A pool whose assets are not grouped by kind (a new optic added after the grips in pool.md) draws that kind twice.
  it.fails('draws a kind once even when the pool lists its items apart (latent: columns follow the pool\'s order, armoryScreen.renderOwned)', () => {
    const optic = pool.assets.find((x) => x.category === 'optic' && x.tag !== 'dev')!;
    const split = [...pool.assets.filter((x) => x !== optic)];
    split.splice(3, 0, optic);
    const kinds = armory({}, split).kinds().map((k) => k.dataset.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

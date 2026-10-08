import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MATCH_MODES } from '../../config/modes';
import { DEFAULT_MATCH_RULES } from '../../config/matchRules';
import { MENU_TEXT, PLAY_TEXT, TITLE_TEXT } from '../../config/menus';
import { MemoryStorage } from '../../pool/testStorage';
import { SETTINGS_KEY, saveSetting } from '../../settings/storage';
import { RECORDS_KEY } from '../../config/matchInfo';
import { BACKDROPS } from '../../config/menuArt';
import { FakeElement, findAll } from '../testSupport';
import { ChoiceCards } from './choiceCards';
import { loadMatchStarted } from './savedChoices';
import { type PlayModel, SetupScreen } from './setupScreen';
import { TitleScreen, tutorialOffered } from './titleScreen';

/**
 * The menu redesign (M100): the plain title, the Tutorial only on a clean save, no key strip, Practice the last mode.
 * Built on the fake DOM; the stylesheet and top bar checks are in styleSheet.test.ts and chrome.test.ts.
 */
/** The fake DOM with what the menus also use: dataset, tab index and title. */
class Node extends FakeElement {
  dataset: Record<string, string> = {};
  tabIndex = 0;
  title = '';
  replaceChildren(...n: Node[]): void {
    this.children.length = 0;
    this.append(...n);
  }
}
const fake = (e: unknown): FakeElement => e as FakeElement;
const texts = (nodes: FakeElement[]): string[] => nodes.filter((n) => !n.hidden).map((n) => n.text);
const all = (root: FakeElement, tag: string): FakeElement[] => [...(root.tag === tag ? [root] : []), ...root.children.flatMap((c) => all(c, tag))];

beforeEach(() => vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) }));
afterEach(() => vi.unstubAllGlobals());

describe('the title screen (M100: plain)', () => {
  const noop = (): void => {};
  const title = (tutorialShown: boolean) => new TitleScreen({ onStart: noop, onTutorial: noop, onSettings: noop }, tutorialShown);

  it('holds the wordmark, the tagline, START and the version, and nothing else a player can press or read', () => {
    const t = fake(title(false).root);
    expect(texts(findAll(t, 'menu-title-wordmark'))).toEqual(['Airsoft']);
    expect(texts(findAll(t, 'menu-title-tagline'))).toEqual(['Call your hit. Go again.']);
    expect(TITLE_TEXT.tagline).toBe('Call your hit. Go again.');
    expect(texts(all(t, 'button'))).toEqual(['START']);
    expect(findAll(t, 'title-version')).toHaveLength(1);
    // Gone from the title: the tip, the next match, the kit, the wallet, the range, Loadout, Armory and Settings buttons.
    for (const gone of ['title-tip', 'title-next', 'title-side', 'title-wallet', 'title-list', 'title-kicker', 'menu-hints', 'menu-chip']) expect(findAll(t, gone)).toEqual([]);
  });

  it('shows no picture: no image in its markup, and the title picture is gone from the art list and from public/menu', async () => {
    const t = fake(title(true).root);
    expect(all(t, 'img')).toEqual([]);
    expect(all(t, 'picture')).toEqual([]);
    expect(Object.keys(BACKDROPS)).toEqual(['blurred']);
    const nodeFs = 'node:' + 'fs';
    const { existsSync } = (await import(/* @vite-ignore */ nodeFs)) as { existsSync(path: URL): boolean };
    expect(existsSync(new URL('../../../public/menu/title.jpg', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../../../public/menu/backdrop.jpg', import.meta.url))).toBe(true);
  });

  it('puts the version small at the bottom left, as its own line after the buttons', () => {
    const t = fake(title(false).root);
    const version = findAll(t, 'title-version')[0]!;
    expect(version.text).toBe(__BUILD_VERSION__.label);
    expect(t.children.at(-1)).toBe(version);
  });

  it('shows the Tutorial under START while the save is clean, and hides it once it should not be offered', () => {
    const shown = title(true);
    expect(texts(all(fake(shown.root), 'button'))).toEqual(['START', 'Tutorial']);
    expect(shown.tutorialShown()).toBe(true);
    shown.setTutorialShown(false);
    expect(shown.tutorialShown()).toBe(false);
    expect(findAll(fake(shown.root), 'menu-title-tutorial')[0]!.hidden).toBe(true);
    expect(title(false).tutorialShown()).toBe(false);
  });

  it('answers to T for the Tutorial only while it is shown, and to Esc for Settings (the keys still work)', () => {
    const ran: string[] = [];
    const t = new TitleScreen({ onStart: () => ran.push('start'), onTutorial: () => ran.push('tutorial'), onSettings: () => ran.push('settings') }, true);
    const key = (code: string) => t.hints.find((h) => h.code === code || (code === 'Escape' && h.keys.includes('Esc')))!;
    key('KeyT').run!();
    key('Escape').run!();
    t.setTutorialShown(false);
    key('KeyT').run!();
    expect(ran).toEqual(['tutorial', 'settings']);
  });

  it('offers the Tutorial on a clean save only: not once it was finished, nor once a first match was started', () => {
    expect(tutorialOffered(false, false)).toBe(true);
    expect(tutorialOffered(true, false)).toBe(false);
    expect(tutorialOffered(false, true)).toBe(false);
    expect(tutorialOffered(true, true)).toBe(false);
  });
});

describe('a first match started (M100: a new saved field, matchStarted)', () => {
  const store = (): MemoryStorage => new MemoryStorage();

  it('is false on a clean save, and the default for a save that predates the field', () => {
    expect(loadMatchStarted(store())).toBe(false);
    const old = store();
    old.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, difficulty: 'hard', tutorialDone: false }));
    expect(loadMatchStarted(old)).toBe(false);
  });

  it('is true once saved, and survives other settings being written after it', () => {
    const s = store();
    saveSetting('matchStarted', true, s);
    saveSetting('difficulty', 'easy', s);
    expect(loadMatchStarted(s)).toBe(true);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toMatchObject({ version: 1, matchStarted: true, difficulty: 'easy' });
  });

  it('counts a save that already holds records as started, so a returning player is not pointed at the tutorial', () => {
    const s = store();
    s.setItem(RECORDS_KEY, JSON.stringify({ version: 1 }));
    expect(loadMatchStarted(s)).toBe(true);
  });

  it('ignores a value of the wrong type', () => {
    const s = store();
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, matchStarted: 'yes' }));
    expect(loadMatchStarted(s)).toBe(false);
  });
});

describe('Practice is the last mode on the Match screen (M100)', () => {
  const setup = () => {
    const model = {
      picks: () => ({ map: 'depot', mode: 'elimination', difficulty: 'normal', teammateDifficulty: 'normal', ruleset: 'skirmish', rules: { ...DEFAULT_MATCH_RULES } }),
      lightingOf: () => 'day',
      supply: () => null,
      setMode: () => {},
    } as unknown as PlayModel;
    const loadout = { equipped: () => [] } as never;
    const ran: string[] = [];
    const screen = new SetupScreen(model, loadout, { pictures: null, realistic: () => false }, { onLoadout: () => {}, onBack: () => {}, onPlay: () => ran.push('match'), onPractice: () => ran.push('practice') });
    const root = fake(screen.root);
    const modes = findAll(root, 'mode-cards')[0]!;
    const names = (): string[] => modes.children.map((w) => findAll(w, 'choice-name')[0]!.text);
    const card = (name: string): FakeElement => modes.children.find((w) => findAll(w, 'choice-name')[0]!.text === name)!.children[0]!;
    const start = findAll(root, 'play-button')[0]!;
    return { screen, root, modes, names, card, start, ran, startLabel: () => start.text };
  };

  it('lists Elimination, Attack and Defend and Extraction (as the config has them), then Practice', () => {
    const { names } = setup();
    expect(names()).toEqual([...MATCH_MODES.map((m) => m.label), PLAY_TEXT.practice.label]);
    expect(names().at(-1)).toBe('Practice');
    expect(MATCH_MODES.map((m) => m.id)).toEqual(['elimination', 'attackDefend', 'extraction']);
  });

  it('is a pressed-or-not button like the others, off until picked', () => {
    const { card } = setup();
    expect(card('Practice').getAttribute('aria-pressed')).toBe('false');
    expect(card('Elimination').getAttribute('aria-pressed')).toBe('true');
  });

  it('picked, takes the pick from the saved mode without saving a mode, and Start practice opens the range', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const { card, start, ran, startLabel, root } = setup();
    expect(startLabel()).toBe('Start match');
    card('Practice').click();
    expect(card('Practice').getAttribute('aria-pressed')).toBe('true');
    expect(card('Elimination').getAttribute('aria-pressed')).toBe('false');
    expect(startLabel()).toBe('Start practice');
    // Nothing for the map or the rules to say about a range.
    expect(findAll(root, 'play-section').filter((s) => s.hidden)).toHaveLength(2);
    start.click();
    expect(ran).toEqual(['practice']);
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  it('goes back to a match when another mode is picked', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const { card, start, ran, startLabel } = setup();
    card('Practice').click();
    card('Attack and Defend').click();
    expect(startLabel()).toBe('Start match');
    expect(card('Practice').getAttribute('aria-pressed')).toBe('false');
    start.click();
    expect(ran).toEqual(['match']);
  });

  it('is never tagged as dev content: it is there with Dev content off too', () => {
    const { card } = setup();
    expect(findAll(card('Practice'), 'tag-dev')).toEqual([]);
    expect(card('Practice').hidden).toBe(false);
  });
});

describe('the cards\' extra card (M100)', () => {
  const options = [
    { id: 'a', label: 'A', blurb: 'First.' },
    { id: 'b', label: 'B', blurb: 'Second.' },
  ] as const;
  const make = (onToggle: (on: boolean) => void) => new ChoiceCards<'a' | 'b'>('Mode', options, 'a', 'mode', () => {}, { extra: { label: 'Last', blurb: 'The extra.', icon: '', art: '<svg></svg>', onToggle } });

  it('comes after every option and reports being picked and left, never saving', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    const seen: boolean[] = [];
    const c = make((on) => seen.push(on));
    const wraps = fake(c.root).children;
    expect(wraps.map((w) => findAll(w, 'choice-name')[0]!.text)).toEqual(['A', 'B', 'Last']);
    wraps[2]!.children[0]!.click();
    expect(c.extraPicked).toBe(true);
    expect(wraps[0]!.children[0]!.getAttribute('aria-pressed')).toBe('false');
    wraps[1]!.children[0]!.click();
    expect(c.extraPicked).toBe(false);
    expect(seen).toEqual([true, false]);
    expect(MENU_TEXT.hints.startPractice).toBe('Start practice');
  });
});

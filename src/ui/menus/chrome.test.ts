import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES } from '../../config/bots';
import { DEFAULT_MATCH_RULES } from '../../config/matchRules';
import { MENU_TEXT } from '../../config/menus';
import { DEFAULT_MAP, loadDevMaps } from '../../map/maps';
import type { NewGamePicks } from '../../newGamePicks';
import { fakeDocument, type FakeElement } from '../testSupport';
import { Backdrop, hintsBar, optionTick, TopBar } from './chrome';
import { PictureSlot } from './menuPictures';
import { DEV_CONTENT_NOTE, playView } from './playView';

/**
 * The menus' frame (G3): the top bar, the key hints and the backdrop, and the Your match panel's view (playView.ts),
 * built on the fake DOM.
 */
const fake = (e: unknown): FakeElement & { title?: string; tabIndex?: number } => e as FakeElement;

describe('the top bar (G3)', () => {
  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  const places = (bar: TopBar): FakeElement[] => fake(bar.root).children[1]!.children;

  it('lists every place in order, marks only the current one, and calls back with the place clicked', () => {
    const picked: string[] = [];
    const bar = new TopBar((p) => picked.push(p));
    expect(fake(bar.root).children[1]!.getAttribute('aria-label')).toBe(MENU_TEXT.navLabel);
    expect(places(bar).map((b) => b.children.at(-1)!.textContent)).toEqual(MENU_TEXT.nav.map((n) => n.label));
    bar.show('loadout', false);
    expect(places(bar).map((b) => b.getAttribute('aria-current'))).toEqual(MENU_TEXT.nav.map((n) => (n.id === 'loadout' ? 'page' : null)));
    expect(places(bar).every((b) => !b.hidden)).toBe(true);
    places(bar)[0]!.click();
    expect(picked).toEqual([MENU_TEXT.nav[0]!.id]);
  });

  it('shows only the current place when opened from the pause menu (the others are out of reach mid-match)', () => {
    const bar = new TopBar(() => {});
    bar.show('settings', true);
    expect(places(bar).filter((b) => !b.hidden).map((b) => b.getAttribute('aria-current'))).toEqual(['page']);
  });

  it('shows the wallet, hides it with the Armory off, and then greys the Armory place out with the reason', () => {
    const bar = new TopBar(() => {});
    const [fc, tokens] = fake(bar.root).children[2]!.children;
    const armory = places(bar)[MENU_TEXT.nav.findIndex((n) => n.id === 'armory')]!;
    bar.setWallet({ fc: 1200, tokens: 3 }, false);
    expect([fc!.hidden, tokens!.hidden, armory.disabled]).toEqual([false, false, false]);
    expect(fc!.textContent).toBe(MENU_TEXT.fc(1200));
    bar.setWallet(null, true);
    expect([fc!.hidden, tokens!.hidden, armory.disabled]).toEqual([true, true, true]);
    expect(fake(armory).title).not.toBe('');
  });
});

describe('the key hints (G3)', () => {
  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('names each hint by its words, hides the key caps from screen readers, and makes a hint with an action a button', () => {
    let ran = 0;
    const bar = fake(hintsBar([{ keys: ['Esc'], label: 'Back', run: () => ran++ }, { keys: ['W', 'S'], label: 'Move' }], 'v0.1'));
    const [back, move, aside] = bar.children;
    expect([back!.tag, move!.tag]).toEqual(['button', 'span']);
    expect(back!.children.map((c) => [c.tag, c.getAttribute('aria-hidden')])).toEqual([
      ['kbd', 'true'],
      ['span', null],
    ]);
    expect(move!.children.filter((c) => c.tag === 'kbd')).toHaveLength(2);
    expect(aside!.textContent).toBe('v0.1');
    back!.click();
    expect(ran).toBe(1);
  });

  it("keeps an echo of the screen's own button out of the tab order and the accessibility tree, so the action is named once", () => {
    const [echo] = fake(hintsBar([{ keys: ['Enter'], label: 'Play', run: () => {}, echo: true }])).children;
    expect(echo!.getAttribute('aria-hidden')).toBe('true');
    expect(fake(echo).tabIndex).toBe(-1);
  });

  it("marks a picked tile's tick as decoration", () => {
    const t = fake(optionTick());
    expect([t.className, t.getAttribute('aria-hidden')]).toEqual(['option-tick', 'true']);
  });
});

describe('the backdrop (G3: one picture, blurred when it was made)', () => {
  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('shows the sharp title picture on the title and the one pre-blurred picture everywhere else', () => {
    const b = new Backdrop();
    const [title, blurred] = fake(b.root).children;
    expect(b.root.getAttribute('aria-hidden')).toBe('true');
    b.show('title', false);
    expect([title!.hidden, blurred!.hidden]).toEqual([false, true]);
    b.show('blurred', true);
    expect([title!.hidden, blurred!.hidden, b.root.classList.contains('even')]).toEqual([true, false, true]);
  });
});

describe('the Your match panel (G3, playView.ts)', () => {
  beforeAll(() => loadDevMaps());
  const picks = (over: Partial<NewGamePicks> = {}): NewGamePicks => ({
    map: DEFAULT_MAP,
    mode: 'elimination',
    difficulty: 'normal',
    teammateDifficulty: 'normal',
    ruleset: 'skirmish',
    rules: { ...DEFAULT_MATCH_RULES },
    ...over,
  });
  const opts = (devContent: boolean) => ({
    rules: { playerTeam: 'Blue', enemyTeam: 'Orange', raiseTime: 5, attackFirst: true, eliminationStartEnd: 1, attackDefendStartEnd: 0 },
    dev: { devContent: () => devContent, devContentUsed: () => devContent, cheating: () => false },
    armory: { wallet: () => ({ fc: 0, tokens: 0 }) },
    loadout: { summary: () => ({ replicas: 'AEG Rifle · Gas Pistol', detail: '' }) },
  }) as unknown as Parameters<typeof playView>[1];

  it("names the light only on a map that offers two, and shows that light's still", () => {
    const depot = playView(picks(), opts(false), () => 'day');
    expect(depot.mapLine).toBe('Depot');
    expect(depot.still).toMatch(/depot-day\.jpg$/);
    const city = playView(picks({ map: 'neonHeights' }), opts(true), () => 'night');
    expect(city.mapLine).toBe('Neon Heights · Night');
    expect(city.still).toMatch(/neonHeights-night\.jpg$/);
  });

  it('plays a dev map as Depot while Dev content is off, and says so in the notes when dev content is used', () => {
    const off = playView(picks({ map: 'neonHeights' }), opts(false), () => 'night');
    expect(off.mapLine).toBe('Depot');
    expect(off.notes).not.toContain(DEV_CONTENT_NOTE);
    const on = playView(picks({ map: 'neonHeights' }), opts(true), () => 'night');
    expect(on.notes).toContain(DEV_CONTENT_NOTE);
    expect(on.pays).toBe(''); // dev content pays nothing
  });

  it('sums up the bots in one line, both levels only when they differ', () => {
    const label = (id: string) => DIFFICULTIES.find((d) => d.id === id)!.label;
    expect(playView(picks(), opts(false), () => 'day').bots).toContain(label('normal'));
    expect(playView(picks({ difficulty: 'hard' }), opts(false), () => 'day').bots).toContain(`${label('hard')} / ${label('normal')}`);
  });
});

describe('a picture slot (G3, menuPictures.ts)', () => {
  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it("is decoration, so an empty slot's dash never joins a part tab's name, and says when it is empty", () => {
    const slot = new PictureSlot('x');
    expect(slot.root.getAttribute('aria-hidden')).toBe('true');
    slot.show(null, null, '');
    expect(slot.root.classList.contains('is-empty')).toBe(true);
    slot.show(null, null, '<svg></svg>');
    expect(slot.root.classList.contains('is-empty')).toBe(false);
  });
});

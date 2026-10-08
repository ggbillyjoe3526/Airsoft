import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES } from '../../config/bots';
import { DEFAULT_MATCH_RULES } from '../../config/matchRules';
import { MENU_TEXT } from '../../config/menus';
import { DEFAULT_MAP, loadDevMaps } from '../../map/maps';
import type { NewGamePicks } from '../../newGamePicks';
import { fakeDocument, type FakeElement } from '../testSupport';
import * as chromeModule from './chrome';
import { Backdrop, optionTick, TopBar } from './chrome';
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
  const wallet = (bar: TopBar): FakeElement => fake(bar.root).children[2]!;

  it('lists every place in order, marks only the current one, and calls back with the place clicked', () => {
    const picked: string[] = [];
    const bar = new TopBar((p) => picked.push(p), () => {});
    expect(fake(bar.root).children[1]!.getAttribute('aria-label')).toBe(MENU_TEXT.navLabel);
    expect(places(bar).map((b) => b.children.at(-1)!.textContent)).toEqual(MENU_TEXT.nav.map((n) => n.label));
    bar.show('loadout', false);
    expect(places(bar).map((b) => b.getAttribute('aria-current'))).toEqual(MENU_TEXT.nav.map((n) => (n.id === 'loadout' ? 'page' : null)));
    expect(places(bar).every((b) => !b.hidden)).toBe(true);
    places(bar)[0]!.click();
    expect(picked).toEqual([MENU_TEXT.nav[0]!.id]);
  });

  it('reads Match, Loadout, Armory, Settings from the left, then the wallet (FC and Tokens only) at the far right, with no version (M100)', () => {
    const bar = new TopBar(() => {}, () => {});
    const [mark, nav, end] = fake(bar.root).children;
    expect(mark!.tag).toBe('button'); // the wordmark is a way back, not a place
    expect(places(bar).map((b) => b.children.at(-1)!.textContent)).toEqual(['Match', 'Loadout', 'Armory', 'Settings']);
    expect(fake(bar.root).children.at(-1)).toBe(end);
    expect(end!.className).toBe('menu-wallet');
    expect(wallet(bar).children.map((c) => c.className)).toEqual(['menu-chip menu-chip-fc', 'menu-chip menu-chip-tokens']);
    expect(nav!.children).toHaveLength(4);
    bar.setWallet({ fc: 1200, tokens: 3 }, false);
    expect(wallet(bar).children.map((c) => c.textContent)).toEqual(['1,200 FC', '3 Tokens']);
    expect(fake(bar.root).children.some((c) => c.className.includes('menu-build'))).toBe(false);
  });

  it("makes the wordmark the way back: to the title, or Back to the pause menu when Settings or the Loadout came from there", () => {
    let back = 0;
    const bar = new TopBar(() => {}, () => back++);
    const mark = fake(bar.root).children[0]!;
    bar.show('settings', false);
    expect(mark.children.at(-1)!.textContent).toBe('Airsoft');
    mark.click();
    bar.show('settings', true);
    expect(mark.children.at(-1)!.textContent).toBe('Back');
    expect(back).toBe(1);
  });

  it('shows only the current place when opened from the pause menu (the others are out of reach mid-match)', () => {
    const bar = new TopBar(() => {}, () => {});
    bar.show('settings', true);
    expect(places(bar).filter((b) => !b.hidden).map((b) => b.getAttribute('aria-current'))).toEqual(['page']);
  });

  it('shows the wallet, hides it with the Armory off, and then greys the Armory place out with the reason', () => {
    const bar = new TopBar(() => {}, () => {});
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

describe('no key prompts along the bottom (M100)', () => {
  it('no longer builds a hints bar: the keys a screen answers to are data for the menus, not drawn', () => {
    expect('hintsBar' in chromeModule).toBe(false);
  });

  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it("marks a picked tile's tick as decoration", () => {
    const t = fake(optionTick());
    expect([t.className, t.getAttribute('aria-hidden')]).toEqual(['option-tick', 'true']);
  });
});

describe('the backdrop (M100: the title has no picture)', () => {
  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('shows no picture at all on the title, and the one pre-blurred picture everywhere else', () => {
    const b = new Backdrop();
    const pictures = fake(b.root).children;
    // One picture only, the blurred one; the title never had a second.
    expect(pictures.map((p) => p.tag)).toEqual(['img']);
    expect(b.root.getAttribute('aria-hidden')).toBe('true');
    b.show('title', false);
    expect(pictures.every((p) => p.hidden)).toBe(true);
    expect(b.root.classList.contains('plain')).toBe(true);
    b.show('blurred', true);
    expect([pictures[0]!.hidden, b.root.classList.contains('plain'), b.root.classList.contains('even')]).toEqual([false, false, true]);
    // Back to the title: plain again, and the darkening for dense pages does not follow it there.
    b.show('title', true);
    expect([pictures[0]!.hidden, b.root.classList.contains('plain'), b.root.classList.contains('even')]).toEqual([true, true, false]);
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

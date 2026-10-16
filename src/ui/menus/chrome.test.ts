import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES } from '../../config/bots';
import { DEFAULT_MATCH_RULES, TEAM_SIZE_CHOICES } from '../../config/matchRules';
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
  const status = (bar: TopBar): FakeElement => fake(bar.root).children.find((c) => c.className === 'menu-status')!;
  const badge = (bar: TopBar): FakeElement => status(bar).children[0]!;

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

  it('reads Match, Loadout, Armory, Settings from the left, then your level at the far right, with no version (M100, LV1)', () => {
    const bar = new TopBar(() => {}, () => {});
    // Back to practice (M95, hidden off the Loadout from Practice) stands just before your level.
    const [mark, nav, practice, end] = fake(bar.root).children;
    expect(practice!.hidden).toBe(true);
    expect(mark!.tag).toBe('button'); // the wordmark is a way back, not a place
    expect(places(bar).map((b) => b.children.at(-1)!.textContent)).toEqual(['Match', 'Loadout', 'Armory', 'Settings']);
    expect(fake(bar.root).children.at(-1)).toBe(end);
    expect(end!.className).toBe('menu-status');
    expect(status(bar).children.map((c) => c.className)).toEqual(['menu-chip menu-chip-level']);
    expect(nav!.children).toHaveLength(4);
    bar.setLevel({ level: 3, into: 150, next: 600, toNext: '450 XP to level 4' });
    expect(badge(bar).children[0]!.textContent).toBe('LVL 3');
    expect(fake(bar.root).children.some((c) => c.className.includes('menu-build'))).toBe(false);
    // The gacha's wallet is gone (LV1): no Field Credits, no Tokens.
    expect(fake(bar.root).children.some((c) => c.className.includes('menu-wallet'))).toBe(false);
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

  it('shows your level and the XP into the next one, says it to a screen reader, and opens the Armory when clicked (LV1)', () => {
    const picked: string[] = [];
    const bar = new TopBar((p) => picked.push(p), () => {});
    const level = badge(bar);
    const [text, track] = level.children;
    bar.show('setup', false);
    bar.setLevel({ level: 3, into: 150, next: 600, toNext: '450 XP to level 4' });
    expect([level.tag, level.hidden, level.disabled]).toEqual(['button', false, false]);
    expect(text!.textContent).toBe(MENU_TEXT.level(3));
    expect(track!.getAttribute('aria-hidden')).toBe('true');
    expect(track!.style['--xp']).toBe('0.25');
    expect(level.getAttribute('aria-label')).toBe('Level 3, 450 XP to level 4. Open the Armory');
    expect(fake(level).title).toBe(level.getAttribute('aria-label'));
    level.click();
    expect(picked).toEqual(['armory']);
  });

  it('fills the bar at the top level, where nothing is left to earn, and leaves out the XP still to go', () => {
    const bar = new TopBar(() => {}, () => {});
    bar.setLevel({ level: 10, into: 0, next: null, toNext: '' });
    const [text, track] = badge(bar).children;
    expect(text!.textContent).toBe('LVL 10');
    expect(track!.style['--xp']).toBe('1');
    expect(badge(bar).getAttribute('aria-label')).toBe('Level 10. Open the Armory');
    // More XP than the level takes (a cap raised later) never overfills it.
    bar.setLevel({ level: 2, into: 900, next: 600, toNext: 'x' });
    expect(track!.style['--xp']).toBe('1');
  });

  it('hides the level with levelling off (Dev settings) and keeps the Armory place on the bar', () => {
    const bar = new TopBar(() => {}, () => {});
    const armory = places(bar)[MENU_TEXT.nav.findIndex((n) => n.id === 'armory')]!;
    bar.show('setup', false);
    bar.setLevel(null);
    expect([badge(bar).hidden, armory.hidden, armory.disabled]).toEqual([true, false, false]);
    expect(places(bar).filter((b) => !b.hidden).length).toBe(MENU_TEXT.nav.length);
    bar.setLevel({ level: 1, into: 0, next: 300, toNext: '300 XP to level 2' });
    expect(badge(bar).hidden).toBe(false);
  });

  it('keeps the level on the bar from the pause menu, where it goes nowhere', () => {
    const bar = new TopBar(() => {}, () => {});
    bar.setLevel({ level: 1, into: 0, next: 300, toNext: '300 XP to level 2' });
    bar.show('settings', true);
    expect([badge(bar).hidden, badge(bar).disabled]).toEqual([false, true]);
    bar.show('settings', false);
    expect(badge(bar).disabled).toBe(false);
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
    rules: { raiseTime: 5 },
    dev: { devContent: () => devContent, devContentUsed: () => devContent, cheating: () => false },
    loadout: { summary: () => ({ replicas: 'AEG Rifle · GBB Pistol', detail: '' }) },
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

  it('offers only 5v5 and 6v6 on Woodland, playing a smaller pick as 5v5, and a run there still takes a squad of one to three (M88)', () => {
    const offered = (v: { sizeMin: number; sizeMax: number }) => TEAM_SIZE_CHOICES.filter((c) => Number(c.id) >= v.sizeMin && Number(c.id) <= v.sizeMax).map((c) => c.label);
    const wood = playView(picks({ map: 'woodland', rules: { ...DEFAULT_MATCH_RULES, teamSize: 3 } }), opts(true), () => 'night');
    expect(offered(wood)).toEqual(['5v5', '6v6']);
    expect(wood.rules).toContain('5v5');
    expect(playView(picks({ map: 'woodland', rules: { ...DEFAULT_MATCH_RULES, teamSize: 6 } }), opts(true), () => 'night').rules).toContain('6v6');
    expect(offered(playView(picks(), opts(false), () => 'day'))).toEqual(['1v1', '2v2', '3v3']);
    const run = playView(picks({ map: 'woodland', mode: 'extraction', rules: { ...DEFAULT_MATCH_RULES, teamSize: 2 } }), opts(true), () => 'night');
    expect(offered(run)).toEqual(['1v1', '2v2', '3v3']);
    expect(run.rules).toContain('Squad of 2');
  });

  it('sums up the bots in one line, both levels only when they differ', () => {
    const label = (id: string) => DIFFICULTIES.find((d) => d.id === id)!.label;
    expect(playView(picks(), opts(false), () => 'day').bots).toContain(label('normal'));
    expect(playView(picks({ difficulty: 'hard' }), opts(false), () => 'day').bots).toContain(`${label('hard')} / ${label('normal')}`);
  });

  it('says your team beside the bots and in the rules, from where it starts (M98), and nothing of it in an Extraction run', () => {
    const view = (over: Partial<NewGamePicks>) => playView(picks(over), opts(true), () => 'day');
    expect(view({}).bots).toMatch(/^Alpha · /);
    expect(view({}).notes).toContain('(Alpha) against Beta');
    expect(view({ team: 'beta' }).bots).toMatch(/^Beta · /);
    expect(view({ team: 'beta' }).notes).toContain('you and 2 bot teammates (Beta) against Alpha.');
    // Alpha starts Elimination in the east and attacks first (config/hits.ts ROUNDS), so Beta starts in the west and defends.
    expect(view({}).notes).toContain('You start at the east end');
    expect(view({ team: 'beta' }).notes).toContain('You start at the west end');
    expect(view({ mode: 'attackDefend' }).notes).toContain('Your team attacks first, from the west end');
    expect(view({ mode: 'attackDefend', team: 'beta' }).notes).toContain('Your team defends first, from the east end');
    const run = view({ mode: 'extraction', team: 'beta' });
    expect(run.run).toBe(true);
    expect(run.bots).not.toMatch(/Alpha|Beta/);
    expect(run.notes).toContain('(Alpha), against');
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

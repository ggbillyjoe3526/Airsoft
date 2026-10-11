import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../pool/testStorage';
import { loadSetting, saveSetting, SETTINGS_KEY } from '../../settings/storage';
import { TUTORIAL_COMPLETE_TEXT, TutorialCompleteDialog } from './tutorialCompleteDialog';
import { stubMenuPage } from './menuTestSupport';
import { arrangeByRarity, DEFAULT_RARITY_VIEW, loadRarityView, RarityBar, type RarityView, saveRarityView } from './rarityFilter';

/** QA for M82 (gaps beside rarityFilter.test.ts) and for M80's "Tutorial complete" pop-up. */
const TIERS = ['common', 'uncommon', 'rare', 'veryRare', 'epic', 'legendary'];
const v = (sort: RarityView['sort'], hidden: string[] = []): RarityView => ({ sort, hidden: new Set(hidden) });

describe('M82: the carried or fitted item is never hidden', () => {
  const items = [
    { id: 'a', tier: 'common' },
    { id: 'b', tier: 'common' },
    { id: 'c', tier: 'epic' },
  ];
  it('keeps only the carried copy of a hidden tier, not its siblings, and sorts it into place by rarity', () => {
    const out = arrangeByRarity(items, (x) => x.tier, TIERS, v('rarity', ['common']), (x) => x.id === 'b');
    expect(out.map((x) => x.id)).toEqual(['c', 'b']);
  });
  it('keeps a carried copy even when every tier is hidden', () => {
    const out = arrangeByRarity(items, (x) => x.tier, TIERS, v('kind', TIERS), (x) => x.id === 'a' || x.id === 'c');
    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('does not mutate the input and puts a tier outside the list last by rarity', () => {
    const copy = items.map((x) => ({ ...x }));
    arrangeByRarity(items, (x) => x.tier, TIERS, v('rarity'));
    expect(items).toEqual(copy);
    const odd = [{ id: 'x', tier: 'mythic' }, ...items];
    expect(arrangeByRarity(odd, (x) => x.tier, TIERS, v('rarity')).map((x) => x.id)).toEqual(['c', 'a', 'b', 'x']);
  });
});

describe('M82: the saved choice survives a reload', () => {
  it('reads back through a fresh storage handle on the same data, replicas and parts apart', () => {
    const first = new MemoryStorage();
    saveRarityView('replicas', v('rarity', ['common', 'uncommon']), TIERS, first);
    saveRarityView('parts', v('kind', ['rare']), TIERS, first);
    const second = new MemoryStorage(); // a reload: new page, same stored text
    second.setItem(SETTINGS_KEY, first.getItem(SETTINGS_KEY)!);
    expect(loadRarityView('replicas', TIERS, second)).toEqual(v('rarity', ['common', 'uncommon']));
    expect(loadRarityView('parts', TIERS, second)).toEqual(v('kind', ['rare']));
  });
  it('writes the exact keys rarity.sort.<list> and rarity.hide.<list>, and showing All saves an empty hide list', () => {
    const s = new MemoryStorage();
    saveRarityView('parts', v('rarity', ['epic']), TIERS, s);
    saveRarityView('parts', v('rarity'), TIERS, s);
    const saved = JSON.parse(s.getItem(SETTINGS_KEY)!);
    expect(saved['rarity.sort.parts']).toBe('rarity');
    expect(saved['rarity.hide.parts']).toBe('');
    expect(loadRarityView('parts', TIERS, s)).toEqual(v('rarity'));
  });
  it('is not lost when another setting is saved afterwards, and does not disturb it', () => {
    const s = new MemoryStorage();
    saveSetting('difficulty', 'hard', s);
    saveRarityView('replicas', v('rarity', ['common']), TIERS, s);
    saveSetting('sensitivity', 0.3, s);
    expect(loadRarityView('replicas', TIERS, s)).toEqual(v('rarity', ['common']));
    expect(loadSetting('difficulty', (r) => (typeof r === 'string' ? r : undefined), 'x', s)).toBe('hard');
  });
  it('reads a save with a tier list that a hand edit left with blanks and repeats as just the real tiers', () => {
    const s = new MemoryStorage();
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, 'rarity.hide.replicas': ',common,,common,bogus' }));
    expect(loadRarityView('replicas', TIERS, s)).toEqual(v('kind', ['common']));
  });
});

describe('M82: the bar opens as saved', () => {
  beforeEach(() => void stubMenuPage());
  afterEach(() => vi.unstubAllGlobals());
  type Fake = { children: Fake[]; className: string; hidden: boolean; getAttribute(n: string): string | null; textContent: string };
  const all = (r: Fake): Fake[] => [r, ...r.children.flatMap(all)];
  const find = (r: Fake, c: string) => all(r).filter((e) => e.className.split(' ').includes(c));

  it('shows the saved sort and hidden tiers as pressed, with All and no stale count', () => {
    const tiers = TIERS.map((id) => ({ id, label: id }));
    const bar = new RarityBar('parts', tiers, v('rarity', ['common', 'epic']), () => {});
    const root = bar.root as unknown as Fake;
    const [byKind, byRarity] = find(root, 'rarity-sort-option');
    expect([byKind!.textContent, byKind!.getAttribute('aria-pressed'), byRarity!.getAttribute('aria-pressed')]).toEqual(['Part', 'false', 'true']);
    const chips = find(root, 'rarity-chip').filter((c) => !c.className.includes('rarity-all'));
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'true', 'true', 'false', 'true']);
    expect(find(root, 'rarity-all')[0]!.hidden).toBe(false);
    bar.setHiddenCount(4);
    bar.setHiddenCount(0);
    expect(find(root, 'rarity-hidden')[0]!.textContent).toBe('');
  });
  it('the default view shows everything and sorts by kind', () => {
    expect(DEFAULT_RARITY_VIEW.sort).toBe('kind');
    expect(DEFAULT_RARITY_VIEW.hidden.size).toBe(0);
  });
});

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

  it('is titled "Tutorial complete" and offers exactly Practice range and Menu', () => {
    const { root, buttons } = make();
    expect(root.getAttribute('aria-label')).toBe('Tutorial complete');
    expect(root.text).toContain(TUTORIAL_COMPLETE_TEXT.title);
    expect(buttons.map((b) => b.textContent)).toEqual(['Practice range', 'Menu']);
  });
  it('opens modal; Practice range and Menu each close it and do their one thing', () => {
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

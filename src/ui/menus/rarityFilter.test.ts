import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../../pool/testStorage';
import { SETTINGS_KEY } from '../../settings/storage';
import { stubMenuPage } from './menuTestSupport';
import { arrangeByRarity, DEFAULT_RARITY_VIEW, loadRarityView, RarityBar, type RarityView, saveRarityView } from './rarityFilter';

const TIERS = ['common', 'uncommon', 'rare', 'veryRare', 'epic', 'legendary'];
/** As the Loadout lists them: by replica (pool order), each one's rarest copy first. */
const ITEMS = [
  { name: 'pistol', tier: 'epic' },
  { name: 'pistol', tier: 'common' },
  { name: 'rifle', tier: 'legendary' },
  { name: 'rifle', tier: 'rare' },
  { name: 'rifle', tier: 'common' },
  { name: 'cyber', tier: 'legendary' },
];
const label = (xs: readonly { name: string; tier: string }[]) => xs.map((x) => `${x.name}@${x.tier}`);
const view = (sort: RarityView['sort'], hidden: string[] = []): RarityView => ({ sort, hidden: new Set(hidden) });

describe('sort and filter by rarity (M82)', () => {
  it('keeps the order things came in by kind, and puts the rarest first by rarity (same tier: as they came)', () => {
    expect(label(arrangeByRarity(ITEMS, (x) => x.tier, TIERS, DEFAULT_RARITY_VIEW))).toEqual(label(ITEMS));
    expect(label(arrangeByRarity(ITEMS, (x) => x.tier, TIERS, view('rarity')))).toEqual([
      'rifle@legendary',
      'cyber@legendary',
      'pistol@epic',
      'rifle@rare',
      'pistol@common',
      'rifle@common',
    ]);
  });

  it('hides the tiers asked for ("only Epic and Legendary"), but never the one picked', () => {
    const epicUp = view('kind', ['common', 'uncommon', 'rare', 'veryRare']);
    expect(label(arrangeByRarity(ITEMS, (x) => x.tier, TIERS, epicUp))).toEqual(['pistol@epic', 'rifle@legendary', 'cyber@legendary']);
    const picked = ITEMS[4]!;
    expect(label(arrangeByRarity(ITEMS, (x) => x.tier, TIERS, epicUp, (x) => x === picked))).toEqual(['pistol@epic', 'rifle@legendary', 'rifle@common', 'cyber@legendary']);
    expect(arrangeByRarity(ITEMS, (x) => x.tier, TIERS, view('rarity', TIERS))).toEqual([]);
  });

  it('remembers each list\'s choice in the settings, apart, and drops a tier no longer in the pool', () => {
    const storage = new MemoryStorage();
    expect(loadRarityView('replicas', TIERS, storage)).toEqual(DEFAULT_RARITY_VIEW);
    saveRarityView('replicas', view('rarity', ['rare', 'common']), TIERS, storage);
    saveRarityView('parts', view('kind', ['legendary']), TIERS, storage);
    const saved = JSON.parse(storage.getItem(SETTINGS_KEY)!);
    // Permanent keys; the hidden tiers in the tiers' order, so one choice always saves the same way.
    expect([saved['rarity.sort.replicas'], saved['rarity.hide.replicas'], saved['rarity.sort.parts'], saved['rarity.hide.parts']]).toEqual(['rarity', 'common,rare', 'kind', 'legendary']);
    expect(loadRarityView('replicas', TIERS, storage)).toEqual(view('rarity', ['common', 'rare']));
    expect(loadRarityView('parts', TIERS, storage)).toEqual(view('kind', ['legendary']));
    expect(loadRarityView('replicas', ['common', 'epic'], storage)).toEqual(view('rarity', ['common']));
  });

  it('reads garbage as the default', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, 'rarity.sort.replicas': 'sideways', 'rarity.hide.replicas': 7 }));
    expect(loadRarityView('replicas', TIERS, storage)).toEqual(DEFAULT_RARITY_VIEW);
  });
});

describe('the rarity bar (M82)', () => {
  beforeEach(() => void stubMenuPage());
  afterEach(() => vi.unstubAllGlobals());

  type Fake = { children: Fake[]; className: string; textContent: string; hidden: boolean; getAttribute(n: string): string | null; click(): void; dataset?: Record<string, string> };
  const all = (root: Fake): Fake[] => [root, ...root.children.flatMap(all)];
  const find = (root: Fake, cls: string) => all(root).filter((e) => e.className.split(' ').includes(cls));

  it('switches the sort, toggles a tier, shows All while one is hidden, and reports each change', () => {
    const tiers = TIERS.map((id) => ({ id, label: id }));
    const seen: RarityView[] = [];
    const bar = new RarityBar('replicas', tiers, DEFAULT_RARITY_VIEW, (v) => seen.push(v));
    const root = bar.root as unknown as Fake;
    const [byKind, byRarity] = find(root, 'rarity-sort-option');
    const chips = find(root, 'rarity-chip').filter((c) => !c.className.includes('rarity-all'));
    const allChip = find(root, 'rarity-all')[0]!;
    expect([byKind!.textContent, byKind!.getAttribute('aria-pressed'), byRarity!.getAttribute('aria-pressed')]).toEqual(['Replica', 'true', 'false']);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(TIERS.map(() => 'true'));
    expect(allChip.hidden).toBe(true);
    byRarity!.click();
    chips[0]!.click();
    chips[2]!.click();
    expect(seen.at(-1)).toEqual(view('rarity', ['common', 'rare']));
    expect([byRarity!.getAttribute('aria-pressed'), chips[0]!.getAttribute('aria-pressed'), allChip.hidden]).toEqual(['true', 'false', false]);
    chips[0]!.click();
    expect(seen.at(-1)).toEqual(view('rarity', ['rare']));
    allChip.click();
    expect(seen.at(-1)).toEqual(view('rarity'));
    expect(allChip.hidden).toBe(true);
    bar.setHiddenCount(3);
    expect(find(root, 'rarity-hidden')[0]!.textContent).toBe('3 hidden');
  });
});

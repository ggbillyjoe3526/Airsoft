import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import poolText from '../../../pool.md?raw';
import { loadPool } from '../../pool/pool';
import { fakeDocument, type FakeElement } from '../testSupport';
import { haulLine, haulSummary, SummaryScreen } from './summaryScreen';

const found = { fc: 145, items: [{ asset: '000004', tier: 'rare' }] };
const none = { fc: 0, items: [] };

describe("the summary's haul line (M44)", () => {
  it('says what you got out with, and whether it went into your collection', () => {
    expect(haulLine({ extracted: true, found, out: found, kept: [] })).toBe('+145 FC and 1 part, now in your collection.');
    expect(haulLine({ extracted: true, found, out: found, kept: null })).toBe('145 FC and 1 part. Not kept: nothing from this run goes into your collection.');
  });

  it('says what you lost when you didn’t get out, and when there was nothing', () => {
    expect(haulLine({ extracted: false, found, out: none, kept: null })).toBe('Lost: 145 FC and 1 part. Only what you get out with is yours.');
    expect(haulLine({ extracted: false, found: none, out: none, kept: null })).toBe('You found nothing on this run.');
    expect(haulLine({ extracted: true, found, out: none, kept: null })).toBe('You got out, but what you dropped stayed where you fell.');
    expect(haulLine({ extracted: true, found: none, out: none, kept: null })).toBe('You got out with nothing.');
  });
});

/** The fake DOM with what the summary's tiles also use: dataset, a title, CSS properties and replaceChildren. */
type Node = FakeElement & { dataset: Record<string, string>; title: string; styleProps: Record<string, string>; replaceChildren(...n: FakeElement[]): void };
function richDocument() {
  const base = fakeDocument();
  return {
    createElement(tag: string): Node {
      const node = base.createElement(tag) as Node;
      node.dataset = {};
      node.title = '';
      node.styleProps = {};
      (node.style as unknown as { setProperty: (n: string, v: string) => void }).setProperty = (n, v) => void (node.styleProps[n] = v);
      const me = node as unknown as { createTHead(): Node; createTBody(): Node; insertRow(): Node };
      me.createTHead = me.createTBody = () => node;
      me.insertRow = () => node;
      node.replaceChildren = (...n) => {
        node.children.length = 0;
        node.children.push(...n);
      };
      return node;
    },
  };
}
const RECORDS = { modes: [], rows: [], bests: [], notCounted: '' };
const walk = (n: FakeElement): FakeElement[] => [n, ...n.children.flatMap(walk)];
const tilesOf = (root: FakeElement): Node[] => walk(root).filter((n) => n.className.split(' ').includes('armory-tile')) as Node[];
const textOf = (n: FakeElement): string[] => walk(n).map((c) => c.textContent).filter(Boolean);

describe("the summary's haul reveals parts as the Armory does (M44)", () => {
  const pool = loadPool(poolText);
  const grip = pool.assets.find((a) => a.category === 'grip')!;
  const optic = pool.assets.find((a) => a.category === 'optic')!;
  const mixed = [
    { asset: grip.id, tier: 'common' },
    { asset: optic.id, tier: 'epic' },
    { asset: grip.id, tier: 'rare' },
  ];
  const show = (extracted: boolean, kept: { item: { asset: string; tier: string }; isNew: boolean }[] | null) => {
    const screen = new SummaryScreen(() => {});
    const out = extracted ? { fc: 40, items: mixed } : { fc: 0, items: [] };
    const haul = haulSummary(pool, { extracted, found: { fc: 40, items: mixed }, out }, kept)!;
    screen.set({ result: 'You got out', blocks: [], records: RECORDS, haul });
    return screen.root as unknown as FakeElement;
  };

  beforeEach(() => vi.stubGlobal('document', richDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('gives each part a tile carrying its tier id, which the Armory’s rarity colours key on, rarest first', () => {
    const tiles = tilesOf(show(true, mixed.map((item, i) => ({ item, isNew: i === 0 }))));
    expect(tiles.map((t) => t.dataset.tier)).toEqual(['epic', 'rare', 'common']);
    for (const t of tiles) expect(pool.tiers.map((x) => x.id)).toContain(t.dataset.tier);
    // Each tile names its part and its tier as the Armory's tile does.
    const epic = textOf(tiles[0]!);
    expect(epic).toContain(optic.name);
    expect(epic).toContain(pool.tiers.find((t) => t.id === 'epic')!.label);
  });

  it('marks what went into the collection new or spare, and the new ones stand out', () => {
    const tiles = tilesOf(show(true, mixed.map((item) => ({ item, isNew: item.tier !== 'rare' }))));
    expect(tiles.map((t) => [t.dataset.tier, textOf(t).at(-1), t.classList.contains('is-new')])).toEqual([
      ['epic', 'New', true],
      ['rare', 'Spare', false],
      ['common', 'New', true],
    ]);
    expect(tiles.map((t) => t.styleProps['--i'])).toEqual(['0', '1', '2']);
  });

  it('shows what was not kept (extracted, nothing granted) and what was lost (not extracted), none of it new', () => {
    const notKept = tilesOf(show(true, null));
    expect(notKept).toHaveLength(3);
    for (const t of notKept) {
      expect(textOf(t).at(-1)).toBe('Not kept');
      expect(t.classList.contains('is-new')).toBe(false);
    }
    const lost = tilesOf(show(false, null));
    expect(lost.map((t) => t.dataset.tier)).toEqual(['epic', 'rare', 'common']);
    for (const t of lost) expect(textOf(t).at(-1)).toBe('Lost');
  });

  it('shows no tiles for a run with no parts, and no haul block outside Extraction', () => {
    const screen = new SummaryScreen(() => {});
    const empty = haulSummary(pool, { extracted: true, found: { fc: 0, items: [] }, out: { fc: 0, items: [] } }, null)!;
    screen.set({ result: 'x', blocks: [], records: RECORDS, haul: empty });
    expect(tilesOf(screen.root as unknown as FakeElement)).toHaveLength(0);
    expect(textOf(screen.root as unknown as FakeElement)).toContain('You got out with nothing.');
    screen.set({ result: 'x', blocks: [], records: RECORDS });
    expect(textOf(screen.root as unknown as FakeElement)).not.toContain('The haul');
    expect(haulSummary(pool, null, null)).toBeNull();
  });
});

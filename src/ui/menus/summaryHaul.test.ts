import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARMORY_TEXT, HAUL_TEXT } from '../../config/menus';
import { GAME_POOL } from '../../pool/gamePool';
import { fakeDocument, type FakeElement } from '../testSupport';
import { haulLine, haulSummary, type MatchSummary, SummaryScreen, xpSummary } from './summaryScreen';

const found = { xp: 145 };
const none = { xp: 0 };

describe("the summary's haul line (M44, LV1)", () => {
  it('says what you got out with, and whether its XP counted', () => {
    expect(haulLine({ extracted: true, found, out: found, kept: true })).toBe('You got out with 145 XP. It is in your XP below.');
    expect(haulLine({ extracted: true, found, out: { xp: 1250 }, kept: true })).toBe('You got out with 1,250 XP. It is in your XP below.');
    expect(haulLine({ extracted: true, found, out: found, kept: false })).toBe('You got out with 145 XP, but this run gives no XP.');
  });

  it('says what you lost when you didn’t get out, and when there was nothing', () => {
    expect(haulLine({ extracted: false, found, out: none, kept: true })).toBe('Lost: 145 XP. Only what you get out with counts.');
    expect(haulLine({ extracted: false, found, out: none, kept: false })).toBe('Lost: 145 XP. Only what you get out with counts.');
    expect(haulLine({ extracted: false, found: none, out: none, kept: true })).toBe('You found nothing on this run.');
    expect(haulLine({ extracted: true, found, out: none, kept: true })).toBe('You got out, but what you dropped stayed where you fell.');
    expect(haulLine({ extracted: true, found: none, out: none, kept: true })).toBe('You got out with nothing.');
  });

  it('builds the haul from the run’s finds and whether it gave XP; none outside Extraction', () => {
    expect(haulSummary({ extracted: true, found, out: found }, true)).toEqual({ extracted: true, found, out: found, kept: true });
    expect(haulSummary({ extracted: false, found, out: none }, false)).toEqual({ extracted: false, found, out: none, kept: false });
    expect(haulSummary(null, true)).toBeNull();
  });

  it('never words a haul in the gacha’s terms (LV1)', () => {
    const lines = [
      haulLine({ extracted: true, found, out: found, kept: true }),
      haulLine({ extracted: true, found, out: found, kept: false }),
      haulLine({ extracted: false, found, out: none, kept: true }),
    ];
    for (const line of lines) expect(line).not.toMatch(/\bFC\b|Field Credits|part|collection|pay/);
  });
});

/** The fake DOM with what the summary also uses: dataset, a title, CSS properties (kept apart) and replaceChildren. */
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
      const me = node as unknown as { createTHead(): Node; createTBody(): Node; insertRow(): Node; insertCell(): Node };
      me.createTHead = me.createTBody = () => node;
      me.insertRow = me.insertCell = () => node;
      node.replaceChildren = (...n) => {
        node.children.length = 0;
        node.children.push(...n);
      };
      return node;
    },
  };
}
const RECORDS = { title: 'Your records', modes: [], rows: [], bests: [], notCounted: '' };
const walk = (n: FakeElement): FakeElement[] => [n, ...n.children.flatMap(walk)];
const textOf = (n: FakeElement): string[] => walk(n).map((c) => c.textContent).filter(Boolean);
const byClass = (root: FakeElement, name: string): Node[] => walk(root).filter((n) => n.className.split(' ').includes(name)) as Node[];

describe("the summary's haul block (M44, LV1)", () => {
  beforeEach(() => vi.stubGlobal('document', richDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('heads it The haul and says its line, with no part tiles (caches give XP, never parts)', () => {
    const screen = new SummaryScreen(() => {});
    screen.set({ result: 'You got out', blocks: [], records: RECORDS, haul: haulSummary({ extracted: true, found, out: found }, true) });
    const haul = byClass(screen.root as unknown as FakeElement, 'summary-haul')[0]!;
    expect(haul.hidden).toBe(false);
    expect(textOf(haul)).toEqual([HAUL_TEXT.title, 'You got out with 145 XP. It is in your XP below.']);
    expect(byClass(haul, 'armory-tile')).toHaveLength(0);
  });

  it('says a run with nothing found, and shows no haul block outside Extraction', () => {
    const screen = new SummaryScreen(() => {});
    screen.set({ result: 'x', blocks: [], records: RECORDS, haul: haulSummary({ extracted: true, found: none, out: none }, true) });
    expect(textOf(screen.root as unknown as FakeElement)).toContain('You got out with nothing.');
    screen.set({ result: 'x', blocks: [], records: RECORDS });
    expect(byClass(screen.root as unknown as FakeElement, 'summary-haul')[0]!.hidden).toBe(true);
    expect(textOf(screen.root as unknown as FakeElement)).not.toContain(HAUL_TEXT.title);
  });
});

describe("the summary's XP block (LV1)", () => {
  const name = (id: string) => GAME_POOL.byId.get(id)?.name ?? id;
  const idOf = (n: string) => GAME_POOL.assets.find((a) => a.name === n)!.id;
  const earned = {
    lines: [
      { label: 'Match played', xp: 100 },
      { label: 'Match won', xp: 100 },
      { label: '5 rounds won', xp: 100 },
      { label: '4 hits on an opponent', xp: 40 },
    ],
    multiplier: 1.5,
    total: 510,
  };
  let screen: SummaryScreen;
  const xpCard = (): Node => byClass(screen.root as unknown as FakeElement, 'summary-xp')[0]!;
  const show = (over: Partial<MatchSummary>): Node => {
    screen.set({ result: 'You win! · Alpha 5 – 3 Beta', blocks: [], records: RECORDS, ...over });
    return xpCard();
  };

  beforeEach(() => {
    vi.stubGlobal('document', richDocument());
    screen = new SummaryScreen(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('heads it with the total earned, then the lines that gave it and the difficulty multiplier', () => {
    const card = show({ xp: xpSummary(earned, null, { level: 3, into: 110, next: 500 }, name) });
    expect(card.hidden).toBe(false);
    const total = byClass(card, 'summary-xp-total')[0]!;
    expect(textOf(total)).toEqual([ARMORY_TEXT.earned, '+510 XP']);
    expect(textOf(card)).toContain('Match played 100 · Match won 100 · 5 rounds won 100 · 4 hits on an opponent 40 · difficulty ×1.5');
  });

  it('leaves the multiplier out at ×1, and shows the level after the match with a bar into the next', () => {
    const card = show({ xp: xpSummary({ ...earned, multiplier: 1, total: 340 }, null, { level: 3, into: 100, next: 400 }, name) });
    const lines = textOf(card);
    expect(lines).toContain('Match played 100 · Match won 100 · 5 rounds won 100 · 4 hits on an opponent 40');
    expect(lines.some((l) => l.includes('×'))).toBe(false);
    expect(lines).toContain('Level 3: 100 / 400 XP');
    const bar = byClass(card, 'summary-level-bar')[0]!;
    expect(bar.getAttribute('aria-hidden')).toBe('true');
    expect(bar.styleProps['--xp']).toBe('0.25');
    expect(byClass(card, 'summary-level-up')).toHaveLength(0);
  });

  it('says a level up with the new level and the names of what it unlocked', () => {
    const up = { from: 1, to: 2, unlocked: [idOf('Vertical Grip'), idOf('Red Laser')] };
    const card = show({ xp: xpSummary(earned, up, { level: 2, into: 10, next: 400 }, name) });
    const line = byClass(card, 'summary-level-up')[0]!;
    expect(textOf(line)).toEqual([ARMORY_TEXT.levelUp(2), ` ${ARMORY_TEXT.unlockedNow}: Vertical Grip, Red Laser`]);
    expect(textOf(line)[0]).toBe('Level 2!');
  });

  it('says a level up with nothing new as the level alone, and no level up when the level stayed', () => {
    expect(xpSummary(earned, { from: 2, to: 2, unlocked: [] }, { level: 2, into: 50, next: 400 }, name)!.levelUp).toBeNull();
    const card = show({ xp: xpSummary(earned, { from: 2, to: 3, unlocked: [] }, { level: 3, into: 0, next: 500 }, name) });
    expect(textOf(byClass(card, 'summary-level-up')[0]!)).toEqual(['Level 3!']);
  });

  it('fills the bar at the top level and says the cap is reached', () => {
    const card = show({ xp: xpSummary(earned, null, { level: 10, into: 0, next: null }, name) });
    expect(textOf(card)).toContain(`Level 10: ${ARMORY_TEXT.atCap}`);
    expect(byClass(card, 'summary-level-bar')[0]!.styleProps['--xp']).toBe('1');
  });

  it('says why a match gave no XP: Dev settings, or content still being built; and no block when there is no reason', () => {
    expect(xpSummary(null, null, { level: 1, into: 0, next: 300 }, name)).toBeNull();
    expect(textOf(show({ xp: null, noXp: 'dev' }))).toEqual([ARMORY_TEXT.noXpDev]);
    expect(textOf(show({ xp: null, noXp: 'devContent' }))).toEqual([ARMORY_TEXT.noXpDevContent]);
    expect(xpCard().hidden).toBe(false);
    const card = show({ xp: null, noXp: null });
    expect(card.hidden).toBe(true);
    expect(card.children).toHaveLength(0);
  });
});

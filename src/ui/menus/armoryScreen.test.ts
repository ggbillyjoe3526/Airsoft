import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARMORY_TEXT } from '../../config/menus';
import { contentPool } from '../../pool/contentPool';
import { GAME_POOL } from '../../pool/gamePool';
import { GAME_LEVELS } from '../../progress/gameLevels';
import { addXp, newProgress, type Progress } from '../../progress/progress';
import { ArmoryScreen } from './armoryScreen';
import { KIND_LABELS } from './itemTile';
import { EventNode, stubMenuPage } from './menuTestSupport';

/**
 * The Armory on the fake DOM (LV1): your level, the XP bar and its lines, how XP is earned, what the next level unlocks
 * and every level with its state, at the cap and with levelling off.
 */
beforeEach(() => {
  stubMenuPage();
  // The bars' --xp is read back: each element's style keeps what setProperty puts in it.
  const doc = document as unknown as { createElement(tag: string): EventNode };
  const make = doc.createElement;
  doc.createElement = (tag) => {
    const n = make(tag);
    const style: Record<string, string> = {};
    Object.defineProperty(style, 'setProperty', { value: (k: string, v: string) => (style[k] = v), enumerable: false });
    n.style = style;
    return n;
  };
});
afterEach(() => vi.unstubAllGlobals());

const node = (e: unknown): EventNode => e as EventNode;
const one = (root: EventNode, sel: string): EventNode => root.querySelector(sel)!;
const texts = (n: EventNode): string[] => (n.children.length === 0 ? (n.textContent ? [n.textContent] : []) : (n.children as EventNode[]).flatMap(texts));

/** A player who has earned `xp` from a new save. */
function playerAt(xp: number): Progress {
  const p = newProgress(GAME_LEVELS);
  addXp(p, GAME_LEVELS, xp);
  return p;
}

function armory(over: { xp?: number; progress?: () => Progress; off?: boolean; devContent?: boolean } = {}) {
  const progress = over.progress ?? (() => playerAt(over.xp ?? 0));
  const screen = new ArmoryScreen({
    pool: () => contentPool(GAME_POOL, over.devContent ?? false),
    levels: GAME_LEVELS,
    progress,
    levellingOff: () => over.off ?? false,
    devContent: () => over.devContent ?? false,
  });
  const root = node(screen.root);
  return {
    screen,
    root,
    standing: () => one(root, '.armory-standing'),
    next: () => one(root, '.armory-next'),
    rows: () => root.querySelectorAll('.armory-level-row'),
    count: () => one(root, '.armory-count').text,
  };
}
const itemNames = (n: EventNode): string[] => n.querySelectorAll('.item-name').map((c) => c.text);

describe('the Armory: your level (LV1)', () => {
  it('shows your level of the cap, the XP bar into the next level and the lines under it', () => {
    const a = armory({ xp: 900 });
    expect(one(a.root, 'h1').text).toBe(ARMORY_TEXT.heading);
    expect(texts(one(a.standing(), '.armory-level'))).toEqual(['Level 3', 'of 10']);
    const bar = one(a.standing(), '.armory-xp');
    expect([bar.getAttribute('role'), bar.getAttribute('aria-valuemin'), bar.getAttribute('aria-valuemax'), bar.getAttribute('aria-valuenow')]).toEqual(['progressbar', '0', '500', '100']);
    expect(bar.style['--xp']).toBe('0.2');
    expect(one(a.standing(), '.armory-xp-line').text).toBe('100 / 500 XP');
    expect(one(a.standing(), '.armory-to-next').text).toBe('400 XP to level 4');
    expect(one(a.standing(), '.armory-total').text).toBe('900 XP earned in all');
    expect(a.standing().getAttribute('aria-live')).toBe('polite');
  });

  it('starts a new player at level 0 with the bar empty and 100 XP to level 1', () => {
    const a = armory();
    expect(texts(one(a.standing(), '.armory-level'))).toEqual(['Level 0', 'of 10']);
    expect(one(a.standing(), '.armory-xp').style['--xp']).toBe('0');
    expect(one(a.standing(), '.armory-to-next').text).toBe('100 XP to level 1');
    expect(a.count()).toBe('4 / 19 unlocked');
  });

  it('lands the keyboard on the heading and answers to no key of its own: nothing here is a control', () => {
    const a = armory();
    expect(a.screen.hints).toEqual([]);
    expect(a.root.querySelectorAll('[data-autofocus]').map((n) => n.tag)).toEqual(['h1']);
    expect(a.root.all('button')).toHaveLength(0);
  });
});

describe('the Armory: how XP is earned (LV1)', () => {
  it("lists levels.md's numbers, then the multipliers of the difficulties offered, and that practice gives none", () => {
    const earn = one(armory().root, '.armory-earn');
    expect(one(earn, 'h2').text).toBe(ARMORY_TEXT.earn);
    expect(one(earn, '.armory-earn-list').children.map((li) => li.text)).toEqual(['Every match: 100 XP', 'A win: 100 more', 'Each round won: 20', 'Each hit on an opponent: 10']);
    const notes = earn.querySelectorAll('.armory-earn-note').map((n) => n.text);
    // Pro is still being built (dev content): it is named only with Dev content on.
    expect(notes).toEqual(['Then times the difficulty: Easy ×0.5 · Normal ×1 · Hard ×1.5.', ARMORY_TEXT.noXp]);
  });

  it('names Pro and its ×2 with Dev content on', () => {
    const earn = one(armory({ devContent: true }).root, '.armory-earn');
    expect(earn.querySelectorAll('.armory-earn-note')[0]!.text).toBe('Then times the difficulty: Easy ×0.5 · Normal ×1 · Hard ×1.5 · Pro ×2.');
  });
});

describe('the Armory: the next unlock and the level track (LV1)', () => {
  it("shows the next level's items as cards under its level tag", () => {
    const a = armory({ xp: 900 });
    expect(one(a.next(), 'h2').text).toBe(ARMORY_TEXT.next);
    expect(one(a.next(), '.tag-pill').text).toBe('Level 4');
    const cards = a.next().querySelectorAll('.armory-next-item');
    expect(cards.map((c) => [c.dataset.kind, one(c, '.item-kind').text, one(c, '.item-name').text])).toEqual([['muzzle', KIND_LABELS.muzzle, 'Silencer']]);
    expect(cards[0]!.querySelectorAll('.armory-next-pic')).toHaveLength(1);
  });

  it('has a row for every level, the starting kit first, each with its running XP, its state and its items', () => {
    const a = armory({ xp: 900 });
    const rows = a.rows();
    expect(rows).toHaveLength(11);
    expect(rows.map((r) => one(r, '.armory-level-name').text)).toEqual(['Starting kit', ...Array.from({ length: 10 }, (_, i) => `Level ${i + 1}`)]);
    // The starting kit takes no XP, so it has no XP line.
    expect(rows[0]!.querySelectorAll('.armory-level-xp')).toHaveLength(0);
    expect(rows.slice(1).map((r) => one(r, '.armory-level-xp').text)).toEqual(['100 XP', '400 XP', '800 XP', '1,300 XP', '1,900 XP', '2,600 XP', '3,400 XP', '4,300 XP', '5,300 XP', '6,500 XP']);
    expect(rows.map((r) => r.dataset.state)).toEqual(['unlocked', 'unlocked', 'unlocked', 'unlocked', 'next', ...Array(6).fill('locked')]);
    expect(rows.map((r) => one(r, '.armory-level-state').text)).toEqual(['Unlocked', 'Unlocked', 'Unlocked', 'Unlocked', 'Next', ...Array(6).fill('Locked')]);
    expect(itemNames(rows[0]!)).toEqual(['GBB Pistol', 'AEG Rifle', 'Standard Battery', 'Green Gas']);
    expect(itemNames(rows[2]!)).toEqual(['Vertical Grip', 'Red Laser']);
    expect(itemNames(rows[10]!)).toEqual(['Cyber Pistol']);
    expect(a.count()).toBe('9 / 19 unlocked');
  });

  it('draws an item you already have as yours on a locked level (levels.md moved it up, BP6)', () => {
    const p = playerAt(0);
    p.unlocked.push(GAME_POOL.assets.find((x) => x.name === 'Silencer')!.id);
    const rows = armory({ progress: () => p }).rows();
    const row = rows.find((r) => itemNames(r).includes('Silencer'))!;
    expect(row.dataset.state).toBe('locked');
    const cards = row.querySelectorAll('.armory-item');
    expect(cards.map((c) => [one(c, '.item-name').text, c.dataset.owned !== undefined])).toEqual(itemNames(row).map((n) => [n, n === 'Silencer']));
    expect(rows[1]!.querySelectorAll('.armory-item').map((c) => c.dataset.owned)).toEqual([undefined]);
  });

  it('shows the Weapon Torch (dev) in the starting kit only with Dev content on, and counts it then', () => {
    expect(itemNames(armory().rows()[0]!)).not.toContain('Weapon Torch');
    const dev = armory({ devContent: true });
    expect(itemNames(dev.rows()[0]!)).toContain('Weapon Torch');
    expect(dev.count()).toBe('5 / 20 unlocked');
  });

  it('reads the progress again on refresh, after a match gave XP', () => {
    let p = playerAt(0);
    const a = armory({ progress: () => p });
    expect(one(a.next(), '.tag-pill').text).toBe('Level 1');
    p = playerAt(450);
    a.screen.refresh();
    expect(texts(one(a.standing(), '.armory-level'))).toEqual(['Level 2', 'of 10']);
    expect(one(a.next(), '.tag-pill').text).toBe('Level 3');
    expect(itemNames(a.next())).toEqual(['Hi-Cap Magazine', 'Extended Magazine']);
    expect(a.rows().map((r) => r.dataset.state).slice(0, 4)).toEqual(['unlocked', 'unlocked', 'unlocked', 'next']);
  });
});

describe('the Armory at the cap and with levelling off (LV1)', () => {
  it('says the top level is reached, fills the bar and has everything unlocked, with nothing next', () => {
    const a = armory({ xp: 9000 });
    expect(texts(one(a.standing(), '.armory-level'))).toEqual(['Level 10', 'of 10']);
    const bar = one(a.standing(), '.armory-xp');
    expect([bar.style['--xp'], bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')]).toEqual(['1', '1', '1']);
    expect(one(a.standing(), '.armory-xp-line').text).toBe(ARMORY_TEXT.atCap);
    expect(a.standing().querySelectorAll('.armory-to-next')).toHaveLength(0);
    expect(one(a.standing(), '.armory-total').text).toBe('6,500 XP earned in all');
    expect(one(a.next(), '.armory-next-none').text).toBe(ARMORY_TEXT.allUnlocked);
    expect(a.next().querySelectorAll('.tag-pill')).toHaveLength(0);
    expect(a.rows().every((r) => r.dataset.state === 'unlocked')).toBe(true);
    expect(a.count()).toBe('19 / 19 unlocked');
  });

  it('with levelling off reads every level unlocked with no next, says why, and shows no XP bar', () => {
    const a = armory({ xp: 150, off: true });
    // Your own level stays on show: it comes back when levelling is on again.
    expect(texts(one(a.standing(), '.armory-level'))).toEqual(['Level 1', 'of 10']);
    expect(one(a.standing(), '.armory-off').text).toBe(ARMORY_TEXT.off);
    expect(a.standing().querySelectorAll('.armory-xp')).toHaveLength(0);
    expect(a.standing().querySelectorAll('.armory-to-next')).toHaveLength(0);
    expect(one(a.next(), '.armory-next-none').text).toBe(ARMORY_TEXT.off);
    expect(a.rows().map((r) => r.dataset.state)).toEqual(Array(11).fill('unlocked'));
    expect(a.rows().some((r) => one(r, '.armory-level-state').text === 'Next')).toBe(false);
    expect(a.count()).toBe('19 / 19 unlocked');
    // How XP is earned still says what levelling gives.
    expect(one(a.root, '.armory-earn-list').children).toHaveLength(4);
  });
});

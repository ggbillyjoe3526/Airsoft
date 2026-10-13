import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS, REBINDABLE } from '../../config/controls';
import { GEAR_TEXT, MENU_TEXT } from '../../config/menus';
import { GAME_POOL } from '../../pool/gamePool';
import { GEAR_SLOTS, LoadoutModel, type Ownership } from '../../pool/loadoutModel';
import { MemoryStorage } from '../../pool/testStorage';
import { lastShotText } from '../rangeReadout';
import { TopBar } from './chrome';
import { LoadoutScreen } from './loadoutScreen';
import { type EventNode, stubMenuPage } from './menuTestSupport';

/**
 * Practice with any replica (M95) on the fake DOM: the Loadout key, the Loadout opened from Practice (its line, the slot
 * in hand picked, Back to practice on the top bar), Unlock all gear said on the Loadout, and the range's first line.
 */
beforeEach(() => {
  stubMenuPage();
  vi.stubGlobal('localStorage', new MemoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

const node = (e: unknown): EventNode => e as EventNode;
/** Whether `line` is the text of a node shown under `root` (none of its ancestors hidden), null when it isn't there. */
function lineShown(root: EventNode, line: string): boolean | null {
  const walk = (n: EventNode, hiddenAbove: boolean): boolean[] => {
    const hidden = hiddenAbove || (n !== root && n.hidden);
    return [...(n.text === line ? [!hidden] : []), ...n.children.flatMap((c) => walk(c as EventNode, hidden))];
  };
  const found = walk(root, false);
  return found.length === 0 ? null : found.some(Boolean);
}

const everything: Ownership = { owns: () => true };
const lent: Ownership = { owns: () => true, sandboxed: () => true };
const screen = (ownership: Ownership = everything): LoadoutScreen =>
  new LoadoutScreen({ model: new LoadoutModel(GAME_POOL, ownership), context: { pictures: null, realistic: () => false }, onChange: () => {} });
/** The carried cards' slot buttons, Primary then Secondary. */
const slotButtons = (s: LoadoutScreen): EventNode[] => node(s.root).all('button').filter((b) => b.classList.contains('gear-slot') && !b.classList.contains('gear-grenades'));

describe('the Loadout key (M95)', () => {
  it('is L by default, rebindable, and on no other action', () => {
    expect(DEFAULT_BINDINGS.loadout).toEqual(['KeyL']);
    expect(REBINDABLE.find((r) => r.action === 'loadout')?.label).toBe('Loadout (in Practice)');
    const others = Object.entries(DEFAULT_BINDINGS).filter(([a]) => a !== 'loadout');
    expect(others.some(([, codes]) => (codes as readonly string[]).includes('KeyL'))).toBe(false);
  });
});

describe('the range readout before the first shot (M95)', () => {
  it('names the Loadout key, or Esc when it has none', () => {
    expect(lastShotText(null, 'L')).toBe('Practice · spare magazines refill · L for the Loadout');
    expect(lastShotText(null, '')).toBe('Practice · spare magazines refill · Esc for the Loadout');
    expect(lastShotText(null)).toContain('Esc for the Loadout');
  });

  it('gives the last BB once there is one, whatever the key', () => {
    expect(lastShotText({ distance: 12.4, target: null }, 'L')).toBe('Last BB: 12 m · miss');
  });
});

describe('the Loadout opened from Practice (M95)', () => {
  it('says what it is for there only when opened from Practice', () => {
    const s = screen();
    s.open(true);
    expect(lineShown(node(s.root), GEAR_TEXT.practice)).toBe(true);
    s.open(false);
    expect(lineShown(node(s.root), GEAR_TEXT.practice)).toBe(false);
    s.refresh(); // a refresh (the Armory gave something) leaves it as the last open set it
    expect(lineShown(node(s.root), GEAR_TEXT.practice)).toBe(false);
  });

  it('picks the slot of the replica in hand, which takes the keyboard focus, and keeps the pick when none is given', () => {
    const s = screen();
    s.open(true, 'secondary');
    const [primary, secondary] = slotButtons(s);
    expect(secondary!.getAttribute('aria-pressed')).toBe('true');
    expect(primary!.getAttribute('aria-pressed')).toBe('false');
    expect('autofocus' in secondary!.dataset).toBe(true);
    expect('autofocus' in primary!.dataset).toBe(false);
    s.open(false);
    expect(secondary!.getAttribute('aria-pressed')).toBe('true');
    s.open(true, 'primary');
    expect(primary!.getAttribute('aria-pressed')).toBe('true');
    expect('autofocus' in primary!.dataset).toBe(true);
    expect('autofocus' in secondary!.dataset).toBe(false);
  });

  it('puts a replica clicked into the picked slot: the one in hand', () => {
    const model = new LoadoutModel(GAME_POOL, everything);
    const s = new LoadoutScreen({ model, context: { pictures: null, realistic: () => false }, onChange: () => {} });
    s.open(true, 'secondary');
    const before = model.equipped();
    const other = node(s.root)
      .all('button')
      .find((b) => b.classList.contains('replica-tile') && !before.some((r) => r && `${r.asset}@${r.tier}` === b.dataset.item));
    expect(other).toBeDefined();
    other!.click();
    const [asset, tier] = other!.dataset.item!.split('@');
    expect(model.equipped()[1]).toEqual({ asset, tier });
    expect(model.equipped()[0]).toEqual(before[0]);
  });
});

describe('Unlock all gear on the Loadout (M95)', () => {
  it('says everything is lent, and drops the line that sends you to the Armory, only while it is on', () => {
    const on = screen(lent);
    on.open(true);
    expect(lineShown(node(on.root), GEAR_TEXT.lent)).toBe(true);
    expect(lineShown(node(on.root), GEAR_TEXT.unlockMore)).toBe(false);
    const off = screen();
    off.open(true);
    expect(lineShown(node(off.root), GEAR_TEXT.lent)).toBe(false);
    expect(lineShown(node(off.root), GEAR_TEXT.unlockMore)).toBe(true);
  });

  it('offers every replica in the pool at every tier it comes in', () => {
    const model = new LoadoutModel(GAME_POOL, lent);
    expect(model.lent()).toBe(true);
    const replicas = GAME_POOL.assets.filter((a) => a.category === 'replica');
    expect(new Set(model.replicaChoices().map((r) => r.asset))).toEqual(new Set(replicas.map((a) => a.id)));
    expect(new LoadoutModel(GAME_POOL, everything).lent()).toBe(false);
  });
});

describe('the gear slot of the replica in hand (M95)', () => {
  it('maps the kit index to its gear slot', () => {
    const model = new LoadoutModel(GAME_POOL, everything);
    expect(GEAR_SLOTS.map((_, i) => model.gearSlotOf(i))).toEqual(['primary', 'secondary']);
    expect(model.gearSlotOf(5)).toBe('primary');
  });

  it('gives the first slot for a kit of one replica (the other slot empty: only one replica owned)', () => {
    const one = GAME_POOL.assets.find((a) => a.category === 'replica')!.id;
    const model = new LoadoutModel(GAME_POOL, { owns: (ref) => ref.asset === one || GAME_POOL.byId.get(ref.asset)?.category !== 'replica' });
    expect(model.equipped()[1]).toBeNull();
    expect(model.kit().slots).toHaveLength(1);
    expect(model.gearSlotOf(0)).toBe('primary');
  });
});

describe('Back to practice on the top bar (M95)', () => {
  it('is hidden until the Loadout is open from Practice, then shows with its key and goes back to practice', () => {
    let back = 0;
    const bar = new TopBar(() => {}, () => {}, () => back++);
    const button = node(bar.root)
      .all('button')
      .find((b) => b.getAttribute('aria-label') === MENU_TEXT.backToPractice)!;
    expect(button.hidden).toBe(true);
    bar.setPractice('L');
    expect(button.hidden).toBe(false);
    expect(button.all('kbd')[0]!.text).toBe('L');
    expect(button.title).toBe('Back to practice (L)');
    button.click();
    expect(back).toBe(1);
    bar.setPractice('');
    expect(button.all('kbd')[0]!.hidden).toBe(true);
    expect(button.title).toBe('Back to practice');
    bar.setPractice(null);
    expect(button.hidden).toBe(true);
  });
});

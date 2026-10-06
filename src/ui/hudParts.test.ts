import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD_TEXT } from '../config/hudText';
import { AEG, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { defaultScheme } from '../config/schemes';
import type { PictureSubject } from '../render/itemPictures';
import { createArmament } from '../sim/armament';
import type { Character } from '../sim/character';
import { HitFeed } from './hitFeed';
import { kitSubjects } from './menus/menuPictures';
import { REPLICA_PANEL_HTML, ReplicaPanel } from './replicaPanel';
import { SquadBar } from './squadBar';
import { FakeElement, findAll } from './testSupport';

/**
 * G4 (HUD restyle): the replica panel's picture, fire-mode chips and spare line; the squad line's cards and keys; the hit
 * feed's rows as seen and as heard; the HUD's words. Each part writes the DOM only when what it shows changes.
 */

/** A fake element that counts its text writes, and finds the replica panel's parts by selector (one fake each). */
class Counted extends FakeElement {
  writes = 0;
  firstElementChild: Counted | null = null;
  private readonly found = new Map<string, Counted>();
  constructor(tag: string) {
    super(tag);
    // Over the base class's own field, so every write is counted.
    let shown = '';
    Object.defineProperty(this, 'textContent', {
      get: () => shown,
      set: (text: string) => {
        shown = text;
        this.writes++;
      },
    });
  }
  /** As the DOM's: `nodes` in place of every child. */
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }
  querySelector(selector: string): Counted {
    let el = this.found.get(selector);
    if (!el) {
      el = new Counted('div');
      if (selector === '.hud-reload') el.firstElementChild = new Counted('div');
      this.found.set(selector, el);
    }
    return el;
  }
  /** The magazine gauges: one `<i>` (with its `<b>`) for each in the markup just set. */
  querySelectorAll(): Counted[] {
    return Array.from({ length: this.innerHTML.split('<i>').length - 1 }, () => {
      const gauge = new Counted('i');
      gauge.firstElementChild = new Counted('b');
      return gauge;
    });
  }
}

let made: Counted[] = [];
beforeEach(() => {
  made = [];
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      const el = new Counted(tag);
      made.push(el);
      return el;
    },
  });
});
afterEach(() => void vi.unstubAllGlobals());

describe('the replica panel (G4 criterion 4)', () => {
  const panel = () => {
    const root = new Counted('div');
    root.innerHTML = REPLICA_PANEL_HTML;
    const p = new ReplicaPanel(root as unknown as HTMLElement, () => 'R');
    return { root, p, modes: root.querySelector('.hud-modes'), spare: root.querySelector('.hud-spare'), main: root.querySelector('.hud-replica-main') };
  };

  it('shows a chip per fire mode the replica has, the current one lit, and moves the light as the mode changes', () => {
    const { p, modes } = panel();
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    expect(modes.children.map((c) => c.textContent)).toEqual(AEG.fireModes.map((m) => ({ semi: 'Semi', burst: 'Burst', auto: 'Auto' })[m]));
    const lit = () => modes.children.filter((c) => c.classList.contains('on')).map((c) => c.textContent);
    expect(lit()).toEqual([{ semi: 'Semi', burst: 'Burst', auto: 'Auto' }[AEG.defaultFireMode]]);
    armament.modes[0] = 'semi';
    p.update(armament, LOADOUT, 1 / 60);
    expect(lit()).toEqual(['Semi']);
    // The pistol has one mode: one chip, lit.
    armament.active = 1;
    p.update(armament, LOADOUT, 1 / 60);
    expect(modes.children).toHaveLength(GAS_PISTOL.fireModes.length);
    expect(lit()).toEqual(['Semi']);
  });

  it('builds the chips once per replica, not per frame', () => {
    const { p } = panel();
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    const chips = made.filter((e) => e.className === 'hud-mode').length;
    for (let i = 0; i < 120; i++) p.update(armament, LOADOUT, 1 / 60);
    expect(made.filter((e) => e.className === 'hud-mode')).toHaveLength(chips);
  });

  it('reads the spare BBs and how many magazines still hold any, written only when they change', () => {
    const { p, spare } = panel();
    const armament = createArmament(LOADOUT);
    const pouch = armament.ammo[0]!.pouch;
    p.update(armament, LOADOUT, 1 / 60);
    const bbs = pouch.reduce((a, b) => a + b, 0);
    expect(spare.textContent).toBe(`/ ${bbs} · ${pouch.filter((m) => m > 0).length} spare`);
    const writes = spare.writes;
    for (let i = 0; i < 60; i++) p.update(armament, LOADOUT, 1 / 60);
    expect(spare.writes).toBe(writes);
    const first = pouch[0]!;
    pouch[0] = 0;
    p.update(armament, LOADOUT, 1 / 60);
    expect(spare.textContent).toBe(`/ ${bbs - first} · ${pouch.filter((m) => m > 0).length} spare`);
    expect(spare.writes).toBe(writes + 1);
  });

  it('shows the carried replica\'s picture from the game\'s pictures, the drawing until then, and the other slot\'s on a switch', () => {
    const { p, main } = panel();
    const asked: PictureSubject[] = [];
    const source = { picture: (s: PictureSubject) => (asked.push(s), new Promise<string>(() => undefined)) };
    const subjects = kitSubjects({ slots: LOADOUT.map((replica) => ({ replica, optic: null, parts: { grip: 'none', magazine: 'standard' } })), schemes: [] }, false);
    p.setPictures(source, subjects);
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    // The slot is the panel's first part, before the words.
    const slot = main.children[0]!;
    expect(slot.className).toContain('hud-replica-pic');
    expect(asked).toEqual([subjects[0]]);
    expect(findAll(slot, 'pic-placeholder')[0]!.innerHTML).toContain('<svg');
    for (let i = 0; i < 30; i++) p.update(armament, LOADOUT, 1 / 60);
    expect(asked).toHaveLength(1);
    armament.active = 1;
    p.update(armament, LOADOUT, 1 / 60);
    expect(asked).toEqual([subjects[0], subjects[1]]);
  });
});

describe('kitSubjects (G4: the HUD\'s pictures of the carried replicas)', () => {
  it('gives each slot its replica, its scheme (the replica\'s own by default) and its parts', () => {
    const slots = [
      { replica: AEG, optic: 'redDot' as const, parts: { grip: 'none' as const, magazine: 'standard' as const, muzzle: null } },
      { replica: GAS_PISTOL, optic: null, parts: { grip: 'none' as const, magazine: 'standard' as const } },
    ];
    const [aeg, pistol] = kitSubjects({ slots, schemes: ['tan'] as never }, true);
    expect(aeg).toMatchObject({ replica: AEG, scheme: 'tan', realistic: true, fit: { optic: 'redDot', grip: 'none', magazine: 'standard' } });
    expect(aeg!.fit).not.toHaveProperty('muzzle');
    expect(pistol).toMatchObject({ replica: GAS_PISTOL, scheme: defaultScheme(GAS_PISTOL), realistic: true });
    expect(pistol!.fit).not.toHaveProperty('optic');
  });
});

describe('the squad line (G4 criterion 5)', () => {
  const people = (n: number) => Array.from({ length: n }, (_, id) => ({ id, status: 'alive' }) as unknown as Character);
  const names = new Map([
    [0, 'You'],
    [1, 'Blue 2'],
    [2, 'Blue 3'],
  ]);
  const keys: Record<string, string> = { orderFollow: 'F', orderHold: 'X', orderRegroup: '' };
  const bar = (members: Character[]) => {
    const parent = new Counted('div');
    const squad = new SquadBar(parent as unknown as HTMLElement, 0, members, names, (a) => keys[a] ?? '');
    const root = parent.children[0] as Counted;
    return { squad, root, cards: findAll(root, 'squad-card') as Counted[], strip: findAll(root, 'squad-keys')[0] as Counted };
  };
  const states = (cards: Counted[]) => cards.map((c) => (findAll(c, 'squad-card-state')[0] as Counted).textContent);

  it('has a card per player on your side, you first, each with a head and the name', () => {
    const { cards } = bar(people(3));
    expect(cards).toHaveLength(3);
    expect(cards.map((c) => c.children.find((w) => w.className === 'squad-card-words')!.children[0]!.textContent)).toEqual(['You', 'Blue 2', 'Blue 3']);
    for (const c of cards) expect(c.children[0]!.className).toBe('head-icon-box');
  });

  it('says what each is doing: in play, the order in force (teammates only), or hit, greyed', () => {
    const members = people(3);
    const { squad, cards } = bar(members);
    squad.update('none', 0.016);
    expect(states(cards)).toEqual([HUD_TEXT.inPlay, HUD_TEXT.inPlay, HUD_TEXT.inPlay]);
    squad.update('hold', 0.016);
    expect(states(cards)).toEqual([HUD_TEXT.inPlay, 'Holding', 'Holding']);
    (members[2] as { status: string }).status = 'out';
    squad.update('hold', 0.016);
    expect(states(cards)).toEqual([HUD_TEXT.inPlay, 'Holding', HUD_TEXT.hit]);
    expect(cards.map((c) => c.classList.contains('hit'))).toEqual([false, false, true]);
  });

  it('writes a card only when its state changes', () => {
    const { squad, cards } = bar(people(3));
    squad.update('follow', 0.016);
    const state = findAll(cards[1]!, 'squad-card-state')[0] as Counted;
    const writes = state.writes;
    for (let i = 0; i < 100; i++) squad.update('follow', 0.016);
    expect(state.writes).toBe(writes);
  });

  it('shows the order keys as bound when it shows, and leaves out an unbound one', () => {
    const { squad, strip } = bar(people(3));
    squad.setVisible(true);
    const items = strip.children;
    expect(items.map((i) => i.children[0]!.textContent)).toEqual(['F', 'X', '']);
    expect(items.map((i) => i.children[1]!.textContent)).toEqual([' Follow', ' Hold', ' Regroup']);
    expect(items.map((i) => i.hidden)).toEqual([false, false, true]);
    keys.orderRegroup = 'V';
    squad.setVisible(true);
    expect(items[2]!.hidden).toBe(false);
    expect(items[2]!.children[0]!.textContent).toBe('V');
    keys.orderRegroup = '';
  });

  it('has no cards and no keys in a 1v1: nobody to order', () => {
    const { root } = bar(people(1));
    expect(findAll(root, 'squad-cards')[0]!.hidden).toBe(true);
    expect(findAll(root, 'squad-keys')[0]!.hidden).toBe(true);
  });
});

describe('the hit feed rows (G4 criterion 3)', () => {
  it('draws the shooter, a BB, who called it and a Hit tag, and says "<who> called HIT · <shooter>" to a screen reader', () => {
    const parent = new Counted('div');
    const feed = new HitFeed(parent as unknown as HTMLElement);
    feed.add({ name: 'Orange 2', team: 1 }, { name: 'Blue 1', team: 0 }, false, true, 1);
    const line = findAll(parent, 'hit-feed-line')[0]!;
    expect(line.classList.contains('you')).toBe(true);
    const heard = line.children.find((c) => c.className === 'sr-only')!;
    expect(heard.textContent).toBe('Orange 2 called HIT · Blue 1');
    const seen = line.children.find((c) => c.className === 'hit-feed-row')!;
    expect(seen.getAttribute('aria-hidden')).toBe('true');
    expect(seen.children.map((c) => c.className)).toEqual(['hit-feed-name', 'hit-feed-bb', 'hit-feed-name', 'hit-feed-tag']);
    expect([seen.children[0]!.textContent, seen.children[2]!.textContent, seen.children[3]!.textContent]).toEqual(['Blue 1', 'Orange 2', HUD_TEXT.hit]);
  });

  it('keeps the friendly tag after the row', () => {
    const parent = new Counted('div');
    const feed = new HitFeed(parent as unknown as HTMLElement);
    feed.add({ name: 'Blue 2', team: 0 }, { name: 'Blue 3', team: 0 }, true, false, 1);
    const line = findAll(parent, 'hit-feed-line')[0]!;
    expect(line.children.map((c) => c.tag)).toEqual(['span', 'span', 'em']);
    expect(line.children[2]!.textContent).toBe('friendly');
  });
});

describe('the HUD\'s words (config/hudText.ts)', () => {
  it('words the aim under the clock, the minimap caption and the spare line', () => {
    expect(HUD_TEXT.firstTo(5)).toBe('First to 5');
    expect(HUD_TEXT.firstTo(7, 2)).toBe('First to 7, by 2');
    expect(HUD_TEXT.where('Depot', 2)).toBe('Depot · Round 2');
    expect(HUD_TEXT.where('Depot', 0)).toBe('Depot');
    expect(HUD_TEXT.spare(120, 2)).toBe('/ 120 · 2 spare');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD_TEXT } from '../config/hudText';
import { HIT_FEED } from '../config/matchInfo';
import { AEG, GAS_PISTOL, LOADOUT } from '../config/replicas';
import { SQUAD_ORDERS } from '../config/squad';
import { defaultScheme } from '../config/schemes';
import type { PictureSubject } from '../render/itemPictures';
import { createArmament } from '../sim/armament';
import { HitFeed } from './hitFeed';
import { HitFeedback } from './hitFeedback';
import { kitSubjects } from './menus/menuPictures';
import { REPLICA_PANEL_HTML, ReplicaPanel } from './replicaPanel';
import { SquadOrderLine } from './squadOrderLine';
import { FakeElement, findAll } from './testSupport';

/**
 * G4 (HUD restyle): the replica panel's picture, fire-mode chips and spare line; the squad order line, now off the
 * screen; the round banner; the hit feed's rows as seen and as heard; the HUD's words. Each part writes the DOM only when what it shows changes.
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

// Owner, 2026-10-08: the squad cards and the order keys left the HUD (the orders show on the order wheel only); the
// order line stays, off the screen, for a screen reader (audit UI-15).
describe('the squad order line, off the screen (G4, owner 2026-10-08)', () => {
  const line = () => {
    const parent = new Counted('div');
    const order = new SquadOrderLine(parent as unknown as HTMLElement);
    return { parent, order, root: parent.children[0] as Counted };
  };

  it('puts one element on the HUD: a status region kept off the screen, with no cards, heads or keys', () => {
    const { parent, root } = line();
    expect(parent.children).toHaveLength(1);
    expect(root.className.split(' ')).toEqual(['squad-order', 'sr-only']);
    expect(root.getAttribute('role')).toBe('status');
    expect(root.children).toEqual([]);
    expect(made.map((el) => el.className)).toEqual(['squad-order sr-only']);
    for (const gone of ['squad-bar', 'squad-cards', 'squad-card', 'squad-keys', 'head-icon-box']) expect(findAll(parent, gone), gone).toEqual([]);
  });

  it('says the order in force and why an order changed nothing, as before', () => {
    const { order, root } = line();
    order.setVisible(true);
    order.update('follow', 0.016);
    expect(root.textContent).toBe('Squad · Follow me');
    order.ordered('none', 'cancelled');
    order.update('none', 0.016);
    expect(root.textContent).toBe(SQUAD_ORDERS.cancelled);
    order.update('none', SQUAD_ORDERS.noticeTime);
    expect(root.textContent).toBe('');
  });

  it('stays in the page while you play, empty or not, so each change is read out; it goes while a menu is up', () => {
    const { order, root } = line();
    expect(root.hidden).toBe(true);
    order.setVisible(true);
    expect(root.hidden).toBe(false);
    order.update('none', 0.016);
    expect(root.hidden).toBe(false);
    order.update('hold', 0.016);
    expect(root.hidden).toBe(false);
    order.setVisible(false);
    expect(root.hidden).toBe(true);
  });

  it('writes its words only when they change', () => {
    const { order, root } = line();
    order.setVisible(true);
    order.update('regroup', 0.016);
    const writes = root.writes;
    for (let i = 0; i < 100; i++) order.update('regroup', 0.016);
    expect(root.writes).toBe(writes);
  });
});

describe('the round banner (G4, owner 2026-10-08: "ROUND 1")', () => {
  const banner = () => {
    const feedback = new HitFeedback(new Counted('div') as unknown as HTMLElement, () => 'F');
    const round = (feedback as unknown as { round: Counted }).round;
    const news = (feedback as unknown as { news: Counted }).news;
    return { feedback, round, news };
  };

  it('keeps the words as written (the capitals are the stylesheet\'s), and a screen reader hears them so', () => {
    const { feedback, round, news } = banner();
    feedback.setRoundMessage('Round 1');
    expect(round.textContent).toBe('Round 1');
    expect(news.textContent).toBe('Round 1');
    expect(round.classList.contains('show')).toBe(true);
  });

  it('marks the round\'s start as its headline, and nothing else it says', () => {
    const { feedback, round } = banner();
    for (const start of ['Round 1', 'Round 12', 'Round 3 · Attack', 'Round 3 · Defend']) {
      feedback.setRoundMessage(start);
      expect(round.classList.contains('start'), start).toBe(true);
    }
    for (const other of ['Your team wins the round · next round in 4', 'You win the match!', 'Extraction · get to an exit', 'Under a minute left']) {
      feedback.setRoundMessage(other);
      expect(round.classList.contains('start'), other).toBe(false);
    }
    feedback.setRoundMessage('');
    expect(round.classList.contains('show')).toBe(false);
    expect(round.classList.contains('start')).toBe(false);
  });

  it('writes the DOM only when the message changes', () => {
    const { feedback, round } = banner();
    feedback.setRoundMessage('Round 2');
    const writes = round.writes;
    for (let i = 0; i < 100; i++) feedback.setRoundMessage('Round 2');
    expect(round.writes).toBe(writes);
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
    expect([seen.children[0]!.textContent, seen.children[2]!.textContent, seen.children[3]!.textContent]).toEqual(['Blue 1', 'Orange 2', HIT_FEED.tag]);
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

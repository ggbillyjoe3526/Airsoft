import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIT_FEED } from '../config/matchInfo';
import { LOADOUT } from '../config/replicas';
import type { PictureSubject } from '../render/itemPictures';
import { createArmament, nextSpare } from '../sim/armament';
import { createCharacter, type Character } from '../sim/character';
import { vec3 } from '../sim/vec';
import { emptyStats } from '../stats/matchStats';
import { emptyMagHint, isLowAmmo } from './ammoStatus';
import { HitFeed } from './hitFeed';
import { FEED_ICONS } from './menus/icons';
import { kitSubjects } from './menus/menuPictures';
import { REPLICA_PANEL_HTML, ReplicaPanel } from './replicaPanel';
import { Scoreboard } from './scoreboard';
import { SquadBar } from './squadBar';
import { rosterNames, statsBlocks } from './statsRows';
import { StatsTable } from './statsTable';
import { FakeElement, findAll } from './testSupport';
import { createRoundState } from '../sim/round';
import { ROUNDS } from '../config/hits';

/**
 * G4 QA: the HUD's parts against a fake page that counts every write (a property set, a class change, a child added or
 * taken away, an attribute), so "the DOM is written only on a change" is measured, not assumed. The page fakes keep the
 * markup the parts build and answer the few selectors they ask for.
 */

let writes = 0;
let created = 0;
const WATCHED = new Set(['textContent', 'innerHTML', 'hidden', 'className', 'src', 'alt', 'title', 'colSpan']);
const CALLS = new Set(['append', 'prepend', 'appendChild', 'replaceChildren', 'remove', 'setAttribute', 'removeAttribute', 'insertAdjacentHTML', 'after']);

class QaElement extends FakeElement {
  firstElementChild: QaElement | null = null;
  private readonly found = new Map<string, QaElement>();
  private readonly foundAll = new Map<string, QaElement[]>();

  constructor(tag: string) {
    super(tag);
    // Over the base class's own field: assigning '' empties the element, as the DOM's does.
    let text = '';
    Object.defineProperty(this, 'textContent', {
      get: () => text,
      set: (v: string) => {
        text = v;
        if (v === '') this.children.length = 0;
      },
      configurable: true,
    });
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }
  querySelector(selector: string): QaElement {
    let el = this.found.get(selector);
    if (!el) {
      el = track(new QaElement('div'));
      if (selector === '.hud-reload') el.firstElementChild = track(new QaElement('div'));
      this.found.set(selector, el);
    }
    return el;
  }
  /** The magazine bars (an `<i><b></b></i>` each in the markup just set) and the score bar's pips (`<i></i>` per team). */
  querySelectorAll(selector: string): QaElement[] {
    const key = `${selector}|${this.innerHTML}`;
    let list = this.foundAll.get(key);
    if (!list) {
      const team = /sb-team-(\d) \.sb-pips i/.exec(selector)?.[1];
      let n = 0;
      if (team !== undefined) {
        const side = new RegExp(`sb-team-${team}"[\\s\\S]*?<span class="sb-pips">((?:<i></i>)*)</span>`).exec(this.innerHTML);
        n = (side?.[1] ?? '').split('<i>').length - 1;
      } else n = this.innerHTML.split('<i>').length - 1;
      list = Array.from({ length: n }, () => {
        const i = track(new QaElement('i'));
        i.firstElementChild = track(new QaElement('b'));
        return i;
      });
      this.foundAll.set(key, list);
    }
    return list;
  }
  createTHead(): QaElement {
    const head = track(new QaElement('thead'));
    this.append(head);
    return head;
  }
  createTBody(): QaElement {
    const body = track(new QaElement('tbody'));
    this.append(body);
    return body;
  }
  insertRow(): QaElement {
    const tr = track(new QaElement('tr'));
    this.append(tr);
    return tr;
  }
  insertCell(): QaElement {
    const td = track(new QaElement('td'));
    this.append(td);
    return td;
  }
}

/** The element behind a proxy that counts every write made to it. */
function track<T extends QaElement>(el: T): T {
  const style = new Proxy(el.style, {
    set: (t, p: string, v: string) => {
      writes++;
      t[p] = v;
      return true;
    },
    get: (t, p: string) => (p === 'setProperty' ? (name: string, v: string) => (writes++, (t[name] = v)) : t[p]),
  });
  const classList = {
    add: (...n: string[]) => (writes++, el.classList.add(...n)),
    remove: (...n: string[]) => (writes++, el.classList.remove(...n)),
    toggle: (n: string, force?: boolean) => (writes++, el.classList.toggle(n, force)),
    contains: (n: string) => el.classList.contains(n),
  };
  return new Proxy(el, {
    get: (t, p, receiver) => {
      if (p === 'style') return style;
      if (p === 'classList') return classList;
      const v = Reflect.get(t, p, t) as unknown;
      if (typeof p === 'string' && CALLS.has(p) && typeof v === 'function') return (...a: unknown[]) => (writes++, (v as (...x: unknown[]) => unknown).apply(receiver, a));
      return v;
    },
    set: (t, p, v) => {
      if (typeof p === 'string' && WATCHED.has(p)) writes++;
      return Reflect.set(t, p, v, t);
    },
  });
}

const made = (tag = 'div'): QaElement => track(new QaElement(tag));

beforeEach(() => {
  writes = 0;
  created = 0;
  vi.stubGlobal('document', { createElement: (tag: string) => (created++, made(tag)) });
});
afterEach(() => void vi.unstubAllGlobals());

/** Steps `frames` of a part, returning how many writes they made. */
function writesDuring(frames: number, step: (i: number) => void): number {
  const before = writes;
  for (let i = 0; i < frames; i++) step(i);
  return writes - before;
}

// ---------------------------------------------------------------------------------------------------------------- replica

describe('the replica panel (G4 criterion 4)', () => {
  const panel = (key = () => 'R') => {
    const root = made();
    root.innerHTML = REPLICA_PANEL_HTML;
    const p = new ReplicaPanel(root as unknown as HTMLElement, key);
    const q = (s: string) => root.querySelector(s);
    return { p, root, main: q('.hud-replica-main'), mags: q('.hud-mags'), status: q('.hud-status'), mag: q('.hud-mag'), modes: q('.hud-modes') };
  };
  const subjectsFor = () => kitSubjects({ slots: LOADOUT.map((replica) => ({ replica, optic: null, parts: { grip: 'none', magazine: 'standard' } })), schemes: [] }, false);

  /** A picture source whose pictures arrive when the test says so. */
  function lateSource() {
    const asks: { subject: PictureSubject; resolve: (url: string) => void; reject: () => void }[] = [];
    const source = {
      picture: (subject: PictureSubject) =>
        new Promise<string>((resolve, reject) => {
          asks.push({ subject, resolve, reject: () => reject(new Error('lost')) });
        }),
    };
    return { source, asks };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('shows a picture that arrives after the panel is up, in the slot that asked', async () => {
    const { p, main } = panel();
    const { source, asks } = lateSource();
    const subjects = subjectsFor();
    p.setPictures(source, subjects);
    p.update(createArmament(LOADOUT), LOADOUT, 1 / 60);
    const slot = main.children[0]!;
    const img = slot.children[1]!;
    expect(img.hidden).toBe(true);
    asks[0]!.resolve('aeg.png');
    await flush();
    expect(img.src).toBe('aeg.png');
    expect(img.hidden).toBe(false);
    expect(slot.classList.contains('has-picture')).toBe(true);
  });

  it('drops a picture that arrives after the player switched to the other replica', async () => {
    const { p, main } = panel();
    const { source, asks } = lateSource();
    p.setPictures(source, subjectsFor());
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    armament.active = 1;
    p.update(armament, LOADOUT, 1 / 60);
    expect(asks.map((a) => a.subject.replica)).toEqual([LOADOUT[0], LOADOUT[1]]);
    const slot = main.children[0]!;
    const img = slot.children[1]!;
    // The rifle's picture comes late, with the pistol in hand: it must not stand in for the pistol.
    asks[0]!.resolve('aeg.png');
    await flush();
    expect(img.src).toBe('');
    expect(img.hidden).toBe(true);
    expect(slot.classList.contains('has-picture')).toBe(false);
    asks[1]!.resolve('pistol.png');
    await flush();
    expect(img.src).toBe('pistol.png');
    expect(slot.classList.contains('has-picture')).toBe(true);
  });

  it('takes the picture away on a switch, and asks again for the replica switched back to', async () => {
    const { p, main } = panel();
    const { source, asks } = lateSource();
    p.setPictures(source, subjectsFor());
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    asks[0]!.resolve('aeg.png');
    await flush();
    const slot = main.children[0]!;
    expect(slot.classList.contains('has-picture')).toBe(true);
    armament.active = 1;
    p.update(armament, LOADOUT, 1 / 60);
    // The rifle's picture is not shown beside the pistol's name while its own comes.
    expect(slot.children[1]!.hidden).toBe(true);
    expect(slot.classList.contains('has-picture')).toBe(false);
    armament.active = 0;
    p.update(armament, LOADOUT, 1 / 60);
    expect(asks).toHaveLength(3);
    asks[2]!.resolve('aeg2.png');
    await flush();
    expect(slot.children[1]!.src).toBe('aeg2.png');
  });

  it('keeps the drawing when a picture cannot be made, and asks again on the next visit', async () => {
    const { p, main } = panel();
    const { source, asks } = lateSource();
    p.setPictures(source, subjectsFor());
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    asks[0]!.reject();
    await flush();
    const slot = main.children[0]!;
    expect(slot.classList.contains('has-picture')).toBe(false);
    expect(findAll(slot, 'pic-placeholder')[0]!.innerHTML).toContain('<svg');
    armament.active = 1;
    p.update(armament, LOADOUT, 1 / 60);
    armament.active = 0;
    p.update(armament, LOADOUT, 1 / 60);
    expect(asks.filter((a) => a.subject.replica === LOADOUT[0])).toHaveLength(2);
  });

  it('draws the pistol\'s line drawing, not the rifle\'s, for the pistol before its picture comes', () => {
    const { p, main } = panel();
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    const rifle = findAll(main.children[0]!, 'pic-placeholder')[0]!.innerHTML;
    armament.active = 1;
    p.update(armament, LOADOUT, 1 / 60);
    const pistol = findAll(main.children[0]!, 'pic-placeholder')[0]!.innerHTML;
    expect(pistol).toContain('<svg');
    expect(pistol).not.toBe(rifle);
  });

  it('has a chip per fire mode, the pistol\'s one chip lit, the rifle\'s moving with the selector', () => {
    const { p, modes } = panel();
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    const lit = () => modes.children.filter((c) => c.classList.contains('on')).map((c) => c.textContent);
    expect(modes.children.map((c) => c.textContent)).toEqual(['Semi', 'Burst', 'Auto']);
    for (const mode of ['semi', 'burst', 'auto'] as const) {
      armament.modes[0] = mode;
      p.update(armament, LOADOUT, 1 / 60);
      expect(lit()).toEqual([{ semi: 'Semi', burst: 'Burst', auto: 'Auto' }[mode]]);
    }
    armament.active = 1;
    p.update(armament, LOADOUT, 1 / 60);
    expect(modes.children.map((c) => c.textContent)).toEqual(['Semi']);
    expect(lit()).toEqual(['Semi']);
    // Back to the rifle: the light is where its selector left it, on a single chip.
    armament.active = 0;
    p.update(armament, LOADOUT, 1 / 60);
    expect(lit()).toEqual(['Auto']);
  });

  describe('a bar per spare magazine', () => {
    const ready = () => {
      const t = panel();
      const armament = createArmament(LOADOUT);
      const ammo = armament.ammo[0]!;
      const size = armament.handling[0]!.magSize;
      return { ...t, armament, ammo, size, bars: () => t.mags.querySelectorAll('i') };
    };
    const marked = (bars: FakeElement[]) => bars.map((b, i) => (b.classList.contains('next') ? i : -1)).filter((i) => i >= 0);

    it('has one per spare magazine and fills each to its BBs', () => {
      const { p, armament, ammo, size, bars } = ready();
      ammo.pouch.length = 0;
      ammo.pouch.push(size, Math.floor(size / 2), 0);
      ammo.mag = 0;
      p.update(armament, LOADOUT, 1 / 60);
      const fills = bars().map((b) => b.firstElementChild?.style.width);
      expect(bars()).toHaveLength(3);
      expect(fills).toEqual(['100%', `${Math.round((Math.floor(size / 2) / size) * 100)}%`, '0%']);
      expect(bars()[2]!.classList.contains('empty')).toBe(true);
      expect(bars()[0]!.classList.contains('empty')).toBe(false);
    });

    it('marks the magazine a reload takes (the fullest, if fuller than the loaded one), and moves the mark after the reload', () => {
      const { p, armament, ammo, size, bars } = ready();
      ammo.pouch.length = 0;
      ammo.pouch.push(10, size, 20);
      ammo.mag = 5;
      p.update(armament, LOADOUT, 1 / 60);
      expect(nextSpare(ammo)).toBe(1);
      expect(marked(bars())).toEqual([1]);
      // A reload swaps the loaded 5 into that slot; the full magazine is loaded and nothing is fuller: no mark.
      [ammo.mag, ammo.pouch[1]] = [ammo.pouch[1]!, ammo.mag];
      p.update(armament, LOADOUT, 1 / 60);
      expect(marked(bars())).toEqual([]);
      // Fired down below the 20: the mark is on that one now.
      ammo.mag = 8;
      p.update(armament, LOADOUT, 1 / 60);
      expect(marked(bars())).toEqual([2]);
    });

    it('marks nothing when every spare is empty, and draws the low ones as low', () => {
      const { p, armament, ammo, size, bars } = ready();
      ammo.pouch.length = 0;
      ammo.pouch.push(0, 1, 0);
      ammo.mag = 0;
      p.update(armament, LOADOUT, 1 / 60);
      expect(marked(bars())).toEqual([1]);
      expect(bars()[1]!.classList.contains('low')).toBe(isLowAmmo(1, size));
      expect(bars()[0]!.classList.contains('low')).toBe(false);
      ammo.pouch[1] = 0;
      p.update(armament, LOADOUT, 1 / 60);
      expect(marked(bars())).toEqual([]);
    });

    it('carries no mark from one replica to the other', () => {
      const { p, armament, ammo, size, bars } = ready();
      ammo.pouch.length = 0;
      ammo.pouch.push(size, size);
      ammo.mag = 0;
      p.update(armament, LOADOUT, 1 / 60);
      expect(marked(bars()).length).toBe(1);
      // The pistol, its own bars: its loaded magazine is the fullest, so nothing is marked.
      const pistol = armament.ammo[1]!;
      pistol.mag = armament.handling[1]!.magSize;
      armament.active = 1;
      p.update(armament, LOADOUT, 1 / 60);
      expect(marked(bars())).toEqual([]);
      armament.active = 0;
      p.update(armament, LOADOUT, 1 / 60);
      expect(marked(bars()).length).toBe(1);
    });
  });

  it('words the status line: reloading, out of BBs, the last magazine, and the empty hint with the reload key as bound now', () => {
    let key = 'R';
    const { p, status } = panel(() => key);
    const armament = createArmament(LOADOUT);
    const ammo = armament.ammo[0]!;
    p.update(armament, LOADOUT, 1 / 60);
    expect(status.textContent).toBe('');
    ammo.mag = 0;
    p.update(armament, LOADOUT, 1 / 60);
    expect(status.textContent).toBe(emptyMagHint('R'));
    key = 'T';
    p.update(armament, LOADOUT, 1 / 60);
    expect(status.textContent).toBe(emptyMagHint('T'));
    armament.reload = 0.5;
    p.update(armament, LOADOUT, 1 / 60);
    expect(status.textContent).toBe('Reloading');
    armament.reload = 0;
    ammo.pouch.fill(0);
    p.update(armament, LOADOUT, 1 / 60);
    expect(status.textContent).toBe('Out of BBs');
    ammo.mag = 5;
    p.update(armament, LOADOUT, 1 / 60);
    expect(status.textContent).toBe('Last magazine');
  });

  it('writes nothing while nothing it shows changes, picture and bars included', () => {
    const { p } = panel();
    const { source } = lateSource();
    p.setPictures(source, subjectsFor());
    const armament = createArmament(LOADOUT);
    p.update(armament, LOADOUT, 1 / 60);
    expect(writesDuring(300, () => p.update(armament, LOADOUT, 1 / 60))).toBe(0);
    // And one change writes only what it touches: one fewer BB is one text write.
    const mag = armament.ammo[0]!;
    mag.mag -= 1;
    expect(writesDuring(1, () => p.update(armament, LOADOUT, 1 / 60))).toBeGreaterThan(0);
    expect(writesDuring(300, () => p.update(armament, LOADOUT, 1 / 60))).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------- squad

describe('the squad line (G4 criterion 5)', () => {
  const people = (n: number): Character[] => Array.from({ length: n }, (_, id) => createCharacter(id, vec3(), 0, LOADOUT, 0));
  const names = new Map([
    [0, 'You'],
    [1, 'Blue 2'],
    [2, 'Blue 3'],
  ]);
  const make = (members: Character[], keys: Record<string, string>) => {
    const parent = made();
    const squad = new SquadBar(parent as unknown as HTMLElement, 0, members, names, (a) => keys[a] ?? '');
    const root = parent.children[0]!;
    return { squad, root, cards: findAll(root, 'squad-card'), strip: findAll(root, 'squad-keys')[0]! };
  };
  const state = (card: FakeElement) => findAll(card, 'squad-card-state')[0]!.textContent;

  it('greys a card once its player is hit, and brings it back when they are in play again', () => {
    const members = people(3);
    const { squad, cards } = make(members, {});
    squad.update('none', 0.016);
    expect(cards.map((c) => c.classList.contains('hit'))).toEqual([false, false, false]);
    members[1]!.status = 'calling';
    members[0]!.status = 'out';
    squad.update('none', 0.016);
    expect(cards.map((c) => c.classList.contains('hit'))).toEqual([true, true, false]);
    expect(cards.map(state)).toEqual(['Hit', 'Hit', 'In play']);
    // The next round: everyone alive again.
    for (const m of members) m.status = 'alive';
    squad.update('none', 0.016);
    expect(cards.map((c) => c.classList.contains('hit'))).toEqual([false, false, false]);
    expect(cards.map(state)).toEqual(['In play', 'In play', 'In play']);
  });

  it('a hit teammate says Hit even under an order, not what they were told to do', () => {
    const members = people(3);
    const { squad, cards } = make(members, {});
    members[2]!.status = 'walkingOff' as never;
    squad.update('regroup', 0.016);
    expect(cards.map(state)).toEqual(['In play', 'Regrouping', 'Hit']);
  });

  it('words each order for the teammates on their cards, and not for you', () => {
    const { squad, cards } = make(people(3), {});
    for (const [order, doing] of [['follow', 'Following'], ['hold', 'Holding'], ['regroup', 'Regrouping']] as const) {
      squad.update(order, 0.016);
      expect(cards.map(state)).toEqual(['In play', doing, doing]);
    }
    squad.update('none', 0.016);
    expect(cards.map(state)).toEqual(['In play', 'In play', 'In play']);
  });

  it('shows the order keys as bound, follows a rebind the next time it shows, and drops an unbound key', () => {
    const keys: Record<string, string> = { orderFollow: 'F', orderHold: 'X', orderRegroup: 'V' };
    const { squad, strip } = make(people(3), keys);
    squad.setVisible(true);
    const letters = () => strip.children.map((i) => (i.hidden ? '-' : i.children[0]!.textContent));
    expect(letters()).toEqual(['F', 'X', 'V']);
    // Rebound on the pause menu (the line hides with the menu and shows again after it).
    squad.setVisible(false);
    keys.orderFollow = 'G';
    keys.orderRegroup = '';
    squad.setVisible(true);
    expect(letters()).toEqual(['G', 'X', '-']);
    squad.setVisible(false);
    keys.orderRegroup = 'Shift+V';
    squad.setVisible(true);
    expect(letters()).toEqual(['G', 'X', 'Shift+V']);
  });

  it('writes nothing in a steady frame, and one card\'s state for one card\'s change', () => {
    const members = people(3);
    const { squad } = make(members, { orderFollow: 'F' });
    squad.setVisible(true);
    squad.update('follow', 0.016);
    expect(writesDuring(300, () => squad.update('follow', 0.016))).toBe(0);
    members[2]!.status = 'out';
    // That card's words and its grey; nobody else's.
    expect(writesDuring(1, () => squad.update('follow', 0.016))).toBe(2);
    expect(writesDuring(300, () => squad.update('follow', 0.016))).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------- hit feed

describe('the hit feed (G4 criterion 3)', () => {
  const feed = () => {
    const parent = made();
    const f = new HitFeed(parent as unknown as HTMLElement);
    const root = parent.children[0]!;
    return { f, root, lines: () => root.children };
  };
  const blue = { name: 'Blue 2', team: 0 };
  const orange = { name: 'Orange 1', team: 1 };

  it('puts the newest row on top, and each row\'s tags after its words, friendly then ricochet', () => {
    const { f, lines } = feed();
    f.add(blue, orange, false, false, 0);
    f.add(blue, { name: 'Blue 3', team: 0 }, true, false, 1, true);
    expect(lines()).toHaveLength(2);
    const newest = lines()[0]!;
    expect(newest.classList.contains('friendly')).toBe(true);
    expect(newest.children.map((c) => c.tag)).toEqual(['span', 'span', 'em', 'em']);
    expect(newest.children.slice(2).map((c) => c.textContent)).toEqual(['friendly', 'ricochet']);
    expect(lines()[1]!.classList.contains('friendly')).toBe(false);
    expect(lines()[1]!.children).toHaveLength(2);
  });

  it('puts the BB mark in each row and tags it Hit; the names carry their teams\' colours', () => {
    const { f, lines } = feed();
    f.add(blue, orange, false, true, 0);
    const row = findAll(lines()[0]!, 'hit-feed-row')[0]!;
    expect(findAll(row, 'hit-feed-bb')[0]!.innerHTML).toBe(FEED_ICONS.bb);
    expect(findAll(row, 'hit-feed-tag')[0]!.textContent).toBe(HIT_FEED.tag);
    const [shooter, , victim] = row.children;
    expect(shooter!.style['--team']).not.toBe(victim!.style['--team']);
    expect(lines()[0]!.style['--hitter']).toBe(shooter!.style['--team']);
  });

  it('reads "<who> called HIT · <shooter>" to a screen reader, for a friendly and a ricochet row too', () => {
    const { f, lines, root } = feed();
    f.add(blue, { name: 'Blue 3', team: 0 }, true, false, 0, true);
    const line = lines()[0]!;
    expect(findAll(line, 'sr-only')[0]!.textContent).toBe('Blue 2 called HIT · Blue 3');
    // What is drawn is hidden from the reader, so it is not read twice; the tags are not hidden.
    expect(findAll(line, 'hit-feed-row')[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(line.children.filter((c) => c.tag === 'em').every((c) => c.getAttribute('aria-hidden') === null)).toBe(true);
    expect(root.getAttribute('aria-live')).toBe('polite');
  });

  it('fades a row near the end of its life and takes it away at the end, on simulation time', () => {
    const { f, lines } = feed();
    f.add(blue, orange, false, false, 10);
    f.update(10 + HIT_FEED.lineTime - HIT_FEED.fadeTime - 0.01);
    expect(lines()[0]!.classList.contains('fading')).toBe(false);
    f.update(10 + HIT_FEED.lineTime - HIT_FEED.fadeTime);
    expect(lines()[0]!.classList.contains('fading')).toBe(true);
    f.update(10 + HIT_FEED.lineTime);
    expect(lines()).toHaveLength(0);
  });

  it('shows the last few rows only in Fade, and the last ten that stay in Keep, through rounds', () => {
    const { f, lines } = feed();
    for (let i = 0; i < 12; i++) f.add(blue, orange, false, false, i);
    expect(lines()).toHaveLength(HIT_FEED.maxLines);
    f.setMode('keep');
    for (let i = 0; i < 12; i++) f.add(blue, orange, false, false, 100 + i);
    expect(lines()).toHaveLength(HIT_FEED.keptLines);
    f.update(100_000);
    expect(lines()).toHaveLength(HIT_FEED.keptLines);
    expect(lines().some((l) => l.classList.contains('fading'))).toBe(false);
    f.roundStarted(2);
    f.roundStarted(5);
    expect(lines()).toHaveLength(HIT_FEED.keptLines);
    f.roundStarted(1);
    expect(lines()).toHaveLength(0);
  });

  it('empties at every round in Fade', () => {
    const { f, lines } = feed();
    f.add(blue, orange, false, false, 0);
    f.roundStarted(2);
    expect(lines()).toHaveLength(0);
  });

  it('gives kept rows their full time from the moment Keep is turned off, and trims to the Fade count', () => {
    const { f, lines } = feed();
    f.setMode('keep');
    for (let i = 0; i < 8; i++) f.add(blue, orange, false, false, i);
    f.update(500);
    f.setMode('fade');
    expect(lines()).toHaveLength(HIT_FEED.maxLines);
    f.update(500 + HIT_FEED.lineTime - HIT_FEED.fadeTime - 0.1);
    expect(lines()).toHaveLength(HIT_FEED.maxLines);
    expect(lines().some((l) => l.classList.contains('fading'))).toBe(false);
    f.update(500 + HIT_FEED.lineTime);
    expect(lines()).toHaveLength(0);
  });

  it('writes nothing while the rows stand, and one class for one row starting to fade', () => {
    const { f } = feed();
    f.add(blue, orange, false, true, 0);
    f.add(orange, blue, false, false, 0.5);
    f.update(1);
    expect(writesDuring(300, (i) => f.update(1 + i * 0.001))).toBe(0);
    expect(writesDuring(1, () => f.update(HIT_FEED.lineTime - HIT_FEED.fadeTime))).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------- score bar

describe('the score bar (G4 criterion 1)', () => {
  const build = (sizes = [3, 3], playerTeam = 0) => {
    const parent = made();
    const bar = new Scoreboard(parent as unknown as HTMLElement, sizes, playerTeam);
    const root = parent.children[0]!;
    const pips = (team: number) => (root as QaElement).querySelectorAll(`.sb-team-${team} .sb-pips i`);
    return { bar, root: root as QaElement, pips };
  };
  const squad = (...teams: number[]): Character[] => teams.map((team, id) => createCharacter(id, vec3(), 0, LOADOUT, team));
  const round = () => createRoundState({ ...ROUNDS, roundTime: 120 }, 'elimination');
  const out = (pips: QaElement[]) => pips.map((p) => p.classList.contains('out'));

  it('has a pip per player on each side', () => {
    const { pips } = build([3, 5]);
    expect([pips(0).length, pips(1).length]).toEqual([3, 5]);
  });

  it('dims the pip of a player who is out, on their own team\'s row, with the teams interleaved', () => {
    const { bar, pips } = build();
    const people = squad(0, 1, 0, 1, 0, 1);
    const r = round();
    bar.update(r, people);
    expect(out(pips(0)).concat(out(pips(1)))).toEqual([false, false, false, false, false, false]);
    people[2]!.status = 'calling';
    people[1]!.status = 'out';
    bar.update(r, people);
    expect(out(pips(0))).toEqual([false, true, false]);
    expect(out(pips(1))).toEqual([true, false, false]);
  });

  it('lights them again at the next round', () => {
    const { bar, pips } = build();
    const people = squad(0, 0, 0, 1, 1, 1);
    const r = round();
    bar.update(r, people);
    for (const c of people) c.status = 'out';
    bar.update(r, people);
    expect(out(pips(0)).concat(out(pips(1)))).toEqual([true, true, true, true, true, true]);
    for (const c of people) c.status = 'alive';
    bar.update(r, people);
    expect(out(pips(0)).concat(out(pips(1)))).toEqual([false, false, false, false, false, false]);
  });

  it('writes nothing in a steady second, and a pip only when a player goes out', () => {
    const { bar } = build();
    const people = squad(0, 0, 0, 1, 1, 1);
    const r = round();
    bar.setAim('First to 5');
    bar.setVisible(true);
    bar.update(r, people);
    expect(writesDuring(300, () => bar.update(r, people))).toBe(0);
    people[3]!.status = 'out';
    expect(writesDuring(1, () => bar.update(r, people))).toBeGreaterThan(0);
    expect(writesDuring(300, () => bar.update(r, people))).toBe(0);
  });

  it('shows what wins the match under the clock, as given', () => {
    const { bar, root } = build();
    bar.setAim('First to 7, by 2');
    expect(root.querySelector('.sb-aim').textContent).toBe('First to 7, by 2');
  });
});

// ---------------------------------------------------------------------------------------------------------------- Tab board

describe('the Tab scoreboard (G4 criterion 6)', () => {
  const people = (): Character[] => [0, 1, 2, 3].map((id) => createCharacter(id, vec3(), 0, LOADOUT, id % 2));
  it('marks your row, wherever the sort puts it, and the rows of players who are out', () => {
    const characters = people();
    const player = characters[0]!;
    const names = rosterNames(characters, player.id);
    const hits: Record<number, number> = {};
    const statsOf = (id: number) => ({ ...emptyStats(), hits: hits[id] ?? 0 });
    const table = new StatsTable();
    const rowsOf = (team: number) => (table.root as unknown as FakeElement).children.filter((c) => c.tag === 'tbody')[team]!.children.slice(1);
    const you = (team: number) => rowsOf(team).map((r) => r.classList.contains('you'));
    table.set(statsBlocks(characters, names, statsOf, [0, 0], player, true));
    expect(you(0)).toEqual([true, false]);
    // Your mate out-shoots you: the sort puts you second; the mark goes with you.
    hits[2] = 3;
    table.set(statsBlocks(characters, names, statsOf, [0, 0], player, true));
    expect(you(0)).toEqual([false, true]);
    expect(you(1)).toEqual([false, false]);
    characters[3]!.status = 'out';
    table.set(statsBlocks(characters, names, statsOf, [0, 0], player, true));
    expect(rowsOf(1).map((r) => r.classList.contains('out'))).toEqual([false, true]);
  });

  it('heads each team with its name and rounds won, yours first, and writes nothing when nothing changed', () => {
    const characters = people();
    const player = characters[0]!;
    const names = rosterNames(characters, player.id);
    const table = new StatsTable();
    const blocks = () => statsBlocks(characters, names, () => emptyStats(), [2, 1], player, true);
    table.set(blocks());
    const titles = (table.root as unknown as FakeElement).children.filter((c) => c.tag === 'tbody').map((b) => b.children[0]!.children[0]!.textContent);
    expect(titles).toEqual(['Blue (you) · 2 rounds won', 'Orange · 1 round won']);
    table.set(blocks());
    expect(writesDuring(100, () => table.set(blocks()))).toBe(0);
  });
});


// ---------------------------------------------------------------------------------------------------------------- allocation

describe('no element is made per frame (G4 criterion 7)', () => {
  it('holds for the replica panel, the squad line, the hit feed and the score bar over a steady stretch', () => {
    const root = made();
    root.innerHTML = REPLICA_PANEL_HTML;
    const panel = new ReplicaPanel(root as unknown as HTMLElement, () => 'R');
    const armament = createArmament(LOADOUT);
    const members = [0, 1, 2].map((id) => createCharacter(id, vec3(), 0, LOADOUT, 0));
    const squad = new SquadBar(made() as unknown as HTMLElement, 0, members, new Map([[0, 'You']]), () => 'F');
    const feed = new HitFeed(made() as unknown as HTMLElement);
    feed.add({ name: 'A', team: 0 }, { name: 'B', team: 1 }, false, false, 0);
    const bar = new Scoreboard(made() as unknown as HTMLElement, [3, 3], 0);
    const characters = [0, 1, 0, 1].map((team, id) => createCharacter(id, vec3(), 0, LOADOUT, team));
    const round = createRoundState({ ...ROUNDS, roundTime: 120 }, 'elimination');
    const frame = (t: number) => {
      panel.update(armament, LOADOUT, 1 / 60);
      squad.update('hold', 1 / 60);
      feed.update(t);
      bar.update(round, characters);
    };
    frame(0);
    const before = created;
    for (let i = 1; i <= 200; i++) frame(i / 100);
    expect(created).toBe(before);
  });
});

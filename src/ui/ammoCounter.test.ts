import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BINDINGS, type Action } from '../config/controls';
import { MAG_SHARE } from '../config/magShare';
import { AMMO_COUNTER_CHOICES, DEFAULT_AMMO_COUNTER, DEFAULT_CROSSHAIR, DEFAULT_HIT_FEED_MODE, DEFAULT_WHAT_GOT_YOU_MODE } from '../config/matchInfo';
import { LOADOUT } from '../config/replicas';
import { coachText, TUTORIAL_STEPS, tutorialSteps, type TutorialStep } from '../config/tutorial';
import { MagHandoff } from '../magHandoff';
import { MemoryStorage } from '../pool/testStorage';
import { flushSettings, SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { createArmament } from '../sim/armament';
import { createCharacter } from '../sim/character';
import type { GameEvent } from '../sim/events';
import { vec3 } from '../sim/vec';
import { TutorialTracker } from '../tutorial/tutorial';
import { CoachPanel } from './coachPanel';
import { Hud } from './hud';
import { hudSettings } from './hudSettings';
import { loadAmmoCounter } from '../settings/hudPrefs';
import { REPLICA_PANEL_HTML, ReplicaPanel } from './replicaPanel';
import { FakeElement, fakeDocument, findAll } from './testSupport';

/** AC1 (Dev 6 item 46): Settings › HUD › Ammo counter, the replica panel with the counts off, the hand-off notice, the coach. */

afterEach(() => vi.unstubAllGlobals());

describe('AC1 criterion 1: the setting', () => {
  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  const noop = () => {};
  const rows = (ammoCounter?: { initial: 'on' | 'off'; onChange: (m: 'on' | 'off') => void }) =>
    hudSettings({
      hudSize: { initial: 1, onChange: noop },
      scoreboardSize: { initial: 1, onChange: noop },
      hudOpacity: { initial: 0.9, onChange: noop },
      hitFeed: { initial: DEFAULT_HIT_FEED_MODE, onChange: noop },
      whatGotYou: { initial: DEFAULT_WHAT_GOT_YOU_MODE, onChange: noop },
      ...(ammoCounter ? { ammoCounter } : {}),
    }) as unknown as FakeElement[];
  const labelOf = (r: FakeElement) => findAll(r, 'menu-row-label')[0]?.textContent;

  it('is On when nothing is saved, and the choices read Off then On', () => {
    expect(DEFAULT_AMMO_COUNTER).toBe('on');
    expect(AMMO_COUNTER_CHOICES.map((c) => c.label)).toEqual(['Off', 'On']);
    expect(loadAmmoCounter(new MemoryStorage())).toBe('on');
  });

  it('reads a saved Off, and ignores an unreadable value', () => {
    const s = new MemoryStorage();
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ammoCounter: 'off' }));
    expect(loadAmmoCounter(s)).toBe('off');
    for (const junk of ['loud', 3, null, true]) {
      s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ammoCounter: junk }));
      expect(loadAmmoCounter(s)).toBe('on');
    }
    s.setItem(SETTINGS_KEY, '{not json');
    expect(loadAmmoCounter(s)).toBe('on');
  });

  it('has the row only when the option is given', () => {
    expect(rows().map(labelOf)).not.toContain('Ammo counter');
    expect(rows({ initial: 'on', onChange: noop }).map(labelOf)).toContain('Ammo counter');
  });

  it('picks the initial choice, and a click on Off tells the game and saves under "ammoCounter"', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const seen: string[] = [];
    const row = rows({ initial: 'on', onChange: (m) => seen.push(m) }).find((r) => labelOf(r) === 'Ammo counter')!;
    const buttons = findAll(row, 'picker-button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Off', 'On']);
    expect(buttons.map((b) => b.classList.contains('active') || b.classList.contains('on') || b.classList.contains('selected') || b.getAttribute('aria-pressed') === 'true')).toEqual([false, true]);
    buttons[0]!.click();
    flushSettings(storage);
    expect(seen).toEqual(['off']);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).ammoCounter).toBe('off');
    expect(loadAmmoCounter(storage)).toBe('off');
  });

  it('opens on Off when Off was saved', () => {
    const row = rows({ initial: 'off', onChange: noop }).find((r) => labelOf(r) === 'Ammo counter')!;
    const buttons = findAll(row, 'picker-button');
    const lit = buttons.map((b) => b.classList.contains('active') || b.classList.contains('on') || b.classList.contains('selected') || b.getAttribute('aria-pressed') === 'true');
    expect(lit).toEqual([true, false]);
  });
});

/** A page element that finds its parts by selector (one fake each), counting the writes to the bars. */
let barWrites = 0;
class PanelElement extends FakeElement {
  firstElementChild: PanelElement | null = null;
  private readonly found = new Map<string, PanelElement>();
  private readonly foundAll = new Map<string, PanelElement[]>();
  constructor(tag: string) {
    super(tag);
    this.style = new Proxy(this.style, {
      set: (t, p: string, v: string) => {
        if (p === 'height') barWrites++;
        t[p] = v;
        return true;
      },
    });
  }
  replaceChildren(...nodes: PanelElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }
  querySelector(selector: string): PanelElement {
    let el = this.found.get(selector);
    if (!el) {
      el = new PanelElement('div');
      if (selector === '.hud-reload') el.firstElementChild = new PanelElement('div');
      this.found.set(selector, el);
    }
    return el;
  }
  /** One bar per `<i>` in the markup just set, the same fakes each time the same markup is asked. */
  querySelectorAll(selector: string): PanelElement[] {
    const key = `${selector}|${this.innerHTML}`;
    let list = this.foundAll.get(key);
    if (!list) {
      list = Array.from({ length: this.innerHTML.split('<i>').length - 1 }, () => {
        const i = new PanelElement('i');
        i.firstElementChild = new PanelElement('b');
        return i;
      });
      this.foundAll.set(key, list);
    }
    return list;
  }
}

describe('AC1 criteria 1 and 2: the replica panel with the counts off', () => {
  beforeEach(() => {
    barWrites = 0;
    vi.stubGlobal('document', { createElement: (tag: string) => new PanelElement(tag) });
  });
  const setup = () => {
    const root = new PanelElement('div');
    root.innerHTML = REPLICA_PANEL_HTML;
    const panel = new ReplicaPanel(root as unknown as HTMLElement);
    const bars = () => root.querySelector('.hud-mags').querySelectorAll('i');
    return {
      root,
      panel,
      box: root.querySelector('.hud-replica'),
      status: root.querySelector('.hud-status').textContent,
      statusEl: root.querySelector('.hud-status'),
      bars,
      height: (i: number) => bars()[i]!.firstElementChild!.style.height,
    };
  };
  const is = (el: FakeElement, ...names: string[]) => names.map((n) => el.classList.contains(n));
  /** An armament whose AEG has a pouch of the given spares and a given loaded count. */
  const arm = (mag: number, pouch: number[]) => {
    const a = createArmament(LOADOUT);
    a.ammo[0]!.mag = mag;
    a.ammo[0]!.pouch = pouch;
    return a;
  };
  const size = LOADOUT[0]!.magSize;

  it('puts no-count on the panel only while the counts are off', () => {
    const f = setup();
    f.panel.update(arm(10, [size]), LOADOUT, 1 / 60);
    expect(f.box.classList.contains('no-count')).toBe(false);
    f.panel.setCounts(false);
    expect(f.box.classList.contains('no-count')).toBe(true);
    f.panel.setCounts(true);
    expect(f.box.classList.contains('no-count')).toBe(false);
  });

  it('draws a bar full for any magazine with BBs, hollow and empty for none, with no low or next mark', () => {
    const f = setup();
    f.panel.setCounts(false);
    f.panel.update(arm(size, [size, 1, Math.floor(size / 4), 0]), LOADOUT, 1 / 60);
    expect([0, 1, 2, 3].map(f.height)).toEqual(['100%', '100%', '100%', '0%']);
    expect(f.bars().map((b) => is(b, 'empty'))).toEqual([[false], [false], [false], [true]]);
    for (const b of f.bars()) expect(is(b, 'low', 'next')).toEqual([false, false]);
  });

  it('puts no next mark on the fullest spare even when the loaded magazine is nearly empty', () => {
    const f = setup();
    f.panel.setCounts(false);
    f.panel.update(arm(2, [size, 5]), LOADOUT, 1 / 60);
    for (const b of f.bars()) expect(is(b, 'next')).toEqual([false]);
  });

  it('brings back the fill levels, the low stripes and the next caret when the counts return', () => {
    const f = setup();
    const a = arm(2, [size, 3, 0]);
    f.panel.setCounts(false);
    f.panel.update(a, LOADOUT, 1 / 60);
    f.panel.setCounts(true);
    f.panel.update(a, LOADOUT, 1 / 60);
    expect([0, 1, 2].map(f.height)).toEqual([`100%`, `${Math.round((3 / size) * 100)}%`, '0%']);
    expect(is(f.bars()[1]!, 'low')).toEqual([true]);
    expect(is(f.bars()[0]!, 'next')).toEqual([true]);
    expect(is(f.bars()[2]!, 'empty')).toEqual([true]);
  });

  it('turning the counts off redraws the bars at once, with no new update needed to see the old fill drop', () => {
    const f = setup();
    const a = arm(size, [size, 7]);
    f.panel.update(a, LOADOUT, 1 / 60);
    expect(f.height(1)).not.toBe('100%');
    f.panel.setCounts(false);
    f.panel.update(a, LOADOUT, 1 / 60);
    expect(f.height(1)).toBe('100%');
    expect(is(f.bars()[1]!, 'low')).toEqual([false]);
  });

  it('leaves the status lines as they were: nothing for an empty magazine (UI2), Last magazine, Out of BBs, Reloading', () => {
    const f = setup();
    f.panel.setCounts(false);
    const text = () => f.statusEl.textContent;
    f.panel.update(arm(0, [size]), LOADOUT, 1 / 60);
    expect(text()).toBe('');
    f.panel.update(arm(5, []), LOADOUT, 1 / 60);
    expect(text()).toBe('Last magazine');
    f.panel.update(arm(0, []), LOADOUT, 1 / 60);
    expect(text()).toBe('Out of BBs');
    const reloading = arm(0, [size]);
    reloading.reload = 0.5;
    f.panel.update(reloading, LOADOUT, 1 / 60);
    expect(text()).toBe('Reloading');
    // The same four with the counts on: identical words.
    const on = setup();
    on.panel.update(arm(0, [size]), LOADOUT, 1 / 60);
    expect(on.statusEl.textContent).toBe('');
    on.panel.update(arm(5, []), LOADOUT, 1 / 60);
    expect(on.statusEl.textContent).toBe('Last magazine');
  });

  it('still shows Holstered and a notice with the counts off', () => {
    const f = setup();
    f.panel.setCounts(false);
    const a = arm(10, [size]);
    f.panel.update(a, LOADOUT, 1 / 60); // the first frame switches to the replica (and drops any notice)
    f.panel.showNotice('Hello', 1);
    f.panel.update(a, LOADOUT, 1 / 60);
    expect(f.statusEl.textContent).toBe('Hello');
    a.holstered = true;
    f.panel.update(a, LOADOUT, 1 / 60);
    expect(f.statusEl.textContent).toBe('Holstered');
  });

  it('writes a bar only when what it shows changes: a partial magazine losing BBs rewrites nothing, and an empty one does', () => {
    const f = setup();
    f.panel.setCounts(false);
    const a = arm(size, [size, 20]);
    f.panel.update(a, LOADOUT, 1 / 60);
    const after = barWrites;
    a.ammo[0]!.pouch[1] = 12; // still has BBs: still a full bar
    for (let i = 0; i < 30; i++) f.panel.update(a, LOADOUT, 1 / 60);
    expect(barWrites).toBe(after);
    a.ammo[0]!.pouch[1] = 0;
    f.panel.update(a, LOADOUT, 1 / 60);
    expect(barWrites).toBe(after + 1);
    expect(f.height(1)).toBe('0%');
    expect(is(f.bars()[1]!, 'empty')).toEqual([true]);
  });

  it('setCounts with the value it already has changes nothing and forces no redraw', () => {
    const f = setup();
    const a = arm(size, [size, 20]);
    f.panel.update(a, LOADOUT, 1 / 60);
    const after = barWrites;
    f.panel.setCounts(true);
    f.panel.update(a, LOADOUT, 1 / 60);
    expect(barWrites).toBe(after);
  });

  it('is reached from the Hud: setAmmoCounter(false) puts no-count on the panel', () => {
    const parent = new PanelElement('div');
    const hud = new Hud(parent as unknown as HTMLElement, DEFAULT_CROSSHAIR);
    const box = (parent.children[0] as unknown as PanelElement).querySelector('.hud-replica');
    hud.setAmmoCounter(false);
    expect(box.classList.contains('no-count')).toBe(true);
    hud.setAmmoCounter(true);
    expect(box.classList.contains('no-count')).toBe(false);
  });
});

describe('AC1 criterion 2: the caught-magazine notice', () => {
  const stubBots = { bots: [], mags: { bringing: () => undefined }, magGiverFor: () => null };
  const make = () => {
    const you = createCharacter(0, vec3(0, 0, 0), 0, LOADOUT, 0);
    const mags = new MagHandoff(you, stubBots as never, {} as never, (id) => (id === 1 ? 'Kit' : `Bot ${id}`), () => 'H');
    return { mags };
  };
  const caught: GameEvent = { type: 'magCaught', fromId: 1, toId: 0, bbs: 60 } as GameEvent;

  it('names the BBs while the counter is on, and only the thrower with it off', () => {
    const on = make();
    on.mags.observe([caught], 1, true);
    expect(on.mags.frame(1.1, true).line).toBe('+1 mag from Kit · 60 BBs');
    const off = make();
    off.mags.setCounts(false);
    off.mags.observe([caught], 1, true);
    expect(off.mags.frame(1.1, true).line).toBe('+1 mag from Kit');
    expect(off.mags.frame(1.1, true).line).not.toMatch(/BB/);
  });

  it('applies at once when changed back on, and leaves a magazine caught by someone else unsaid', () => {
    const f = make();
    f.mags.setCounts(false);
    f.mags.setCounts(true);
    f.mags.observe([caught], 1, true);
    expect(f.mags.frame(1.1, true).line).toContain('60 BBs');
    const other = make();
    other.mags.setCounts(false);
    other.mags.observe([{ ...caught, toId: 3 } as GameEvent], 1, true);
    expect(other.mags.frame(1.1, true).line).toBe('');
  });

  it('has an uncounted line that fits the notice width and no placeholder for the count', () => {
    expect(MAG_SHARE.words.caughtUncounted).toBe('+1 mag from {name}');
    expect(MAG_SHARE.words.caughtUncounted).not.toContain('{bbs}');
  });
});

describe('AC1 criterion 4: the tutorial follows the counter', () => {
  const actions = new Set(Object.keys(DEFAULT_BINDINGS));
  const reload = () => TUTORIAL_STEPS.find((s) => s.id === 'reload')!;

  it('coachText picks countHidden only with the counter off', () => {
    const r = reload();
    expect(r.countHidden).toBeTruthy();
    expect(coachText(r, true)).toBe(r.text);
    expect(coachText(r, false)).toBe(r.countHidden);
    const plain = TUTORIAL_STEPS.find((s) => !s.countHidden)!;
    expect(coachText(plain, false)).toBe(plain.text);
    expect(coachText(plain, true)).toBe(plain.text);
  });

  it('the Reload step with the counter off keeps count yourself, names only real bindings, and never says "watch your count"', () => {
    const r = reload();
    expect(r.text).toContain('watch your count');
    expect(r.countHidden).not.toMatch(/watch your count/i);
    expect(r.countHidden).toMatch(/keep count yourself/);
    const keys = [...r.countHidden!.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
    expect(keys).toContain('reload');
    for (const k of keys) expect(actions.has(k), k).toBe(true);
  });

  it('no step with countHidden mentions a count the HUD would not show', () => {
    for (const s of TUTORIAL_STEPS) if (s.countHidden) expect(s.countHidden, s.id).not.toMatch(/\bwatch your count|BBs? left|spare mag(azine)?s? (left|count)/i);
  });

  it('tutorialSteps(true) appends the levelling line to the countHidden of a step that has both, tutorialSteps(false) leaves it out', () => {
    // No real step has both today, so graft a levelling line onto the real Reload step for the duration of the test.
    const list = TUTORIAL_STEPS as TutorialStep[];
    const at = list.findIndex((s) => s.id === 'reload');
    const original = list[at]!;
    const grafted: TutorialStep = { ...original, levelling: 'Levelling line.' };
    list[at] = grafted;
    try {
      const withLv = tutorialSteps(true).find((s) => s.id === 'reload')!;
      expect(withLv.text).toBe(`${original.text} Levelling line.`);
      expect(withLv.countHidden).toBe(`${original.countHidden} Levelling line.`);
      const without = tutorialSteps(false).find((s) => s.id === 'reload')!;
      expect(without.text).toBe(original.text);
      expect(without.countHidden).toBe(original.countHidden);
    } finally {
      list[at] = original;
    }
  });

  it('tutorialSteps leaves a step with levelling but no countHidden without a countHidden', () => {
    for (const s of tutorialSteps(true)) {
      const base = TUTORIAL_STEPS.find((b) => b.id === s.id)!;
      expect(Boolean(s.countHidden), s.id).toBe(Boolean(base.countHidden));
    }
  });
});

describe('AC1 criterion 4: the coach panel', () => {
  beforeEach(() => {
    class Node extends FakeElement {
      replaceChildren(...nodes: FakeElement[]): void {
        this.children.length = 0;
        this.append(...nodes);
      }
    }
    vi.stubGlobal('document', {
      createElement: (tag: string) => new Node(tag),
      createTextNode: (t: string) => Object.assign(new Node('#text'), { textContent: t }),
    });
  });
  const bodyText = (parent: FakeElement) => {
    const body = findAll(parent, 'coach-body')[0]!;
    return body.children.map((c) => c.textContent).join('');
  };

  it('redraws the Reload step in the new words after setAmmoCounter + show, and back', () => {
    const parent = new FakeElement('div');
    const coach = new CoachPanel(parent as unknown as HTMLElement, (a: Action) => (a === 'reload' ? 'R' : a));
    const start = TUTORIAL_STEPS.findIndex((s) => s.id === 'reload');
    const t = new TutorialTracker(TUTORIAL_STEPS, true, start);
    expect(t.step?.id).toBe('reload');
    coach.show(t);
    expect(bodyText(parent)).toContain('watch your count');
    coach.setAmmoCounter(false);
    coach.show(t);
    expect(bodyText(parent)).toContain('keep count yourself');
    expect(bodyText(parent)).not.toContain('watch your count');
    expect(bodyText(parent)).toContain('press R to swap');
    coach.setAmmoCounter(true);
    coach.show(t);
    expect(bodyText(parent)).toContain('watch your count');
  });

  it('does not redraw a step whose words do not depend on the counter', () => {
    const parent = new FakeElement('div');
    const coach = new CoachPanel(parent as unknown as HTMLElement, (a: Action) => a);
    const t = new TutorialTracker(TUTORIAL_STEPS, true, 0);
    coach.show(t);
    const body = findAll(parent, 'coach-body')[0]!;
    const before = body.children.slice();
    coach.setAmmoCounter(false);
    coach.show(t);
    expect(body.children).toEqual(before);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CROSSHAIR } from '../config/matchInfo';
import { LOADOUT } from '../config/replicas';
import { createArmament } from '../sim/armament';
import { FakeElement } from './testSupport';
import { Hud } from './hud';

/** A page element for the HUD: finds its parts by selector (one fake each) and counts every write to the fills' styles. */
class HudElement extends FakeElement {
  private readonly found = new Map<string, HudElement>();
  firstElementChild: HudElement | null = null;
  writes = 0;
  constructor(tag: string) {
    super(tag);
    const counted: Record<string, unknown> = { setProperty: () => {} };
    this.style = new Proxy(counted as Record<string, string>, {
      set: (target, property: string, value: string) => {
        if (property === 'transform' || property === 'transitionDuration' || property === 'width') this.writes++;
        target[property] = value;
        return true;
      },
    });
  }
  /** The fire-mode chips (G4) go in as the DOM's replaceChildren puts them. */
  replaceChildren(...nodes: HudElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }
  querySelector(selector: string): HudElement {
    let el = this.found.get(selector);
    if (!el) {
      el = new HudElement('div');
      if (selector === '.hud-reload') el.firstElementChild = new HudElement('div');
      this.found.set(selector, el);
    }
    return el;
  }
  /** The magazine gauges: one `<i>` for each in the markup just set. */
  querySelectorAll(): HudElement[] {
    return Array.from({ length: this.innerHTML.split('<i>').length - 1 }, () => {
      const gauge = new HudElement('i');
      gauge.firstElementChild = new HudElement('b');
      return gauge;
    });
  }
}

describe('the HUD reload bar (M64, audit UI-11)', () => {
  let hud: Hud;
  let bar: HudElement;
  let fill: HudElement;
  let clock = 0;
  const armament = createArmament(LOADOUT);
  const reloadTime = armament.handling[0]!.reloadTime;

  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new HudElement(tag) });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const parent = new HudElement('div');
    hud = new Hud(parent as unknown as HTMLElement, () => 'R', DEFAULT_CROSSHAIR);
    const root = parent.children[0] as HudElement;
    bar = root.querySelector('.hud-reload');
    fill = bar.firstElementChild!;
    armament.reload = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('is written about twice over a whole reload at 60 fps, not once per percent', () => {
    for (let frame = 0; frame < 60; frame++) {
      clock = (frame / 60) * 1000;
      armament.reload = Math.max(0.001, reloadTime - frame / 60);
      hud.update(armament, LOADOUT, true, 0, null, 1 / 60);
    }
    expect(bar.classList.contains('active')).toBe(true);
    expect(fill.writes).toBeLessThanOrEqual(4);
    expect(fill.style.transitionDuration).toBe(`${reloadTime}s`);
    expect(fill.style.transform).toBe('scaleX(1)');
  });

  it('rewinds the bar when the reload ends, ready for the next', () => {
    armament.reload = reloadTime;
    hud.update(armament, LOADOUT, true, 0, null, 1 / 60);
    armament.reload = 0;
    hud.update(armament, LOADOUT, true, 0, null, 1 / 60);
    expect(bar.classList.contains('active')).toBe(false);
    expect(fill.style.transform).toBe('scaleX(0)');
    expect(fill.style.transitionDuration).toBe('0s');
  });
});

describe('the HUD reload bar through a cancelled, chained, paused and calm reload (QA, M64 UI-11)', () => {
  let hud: Hud;
  let bar: HudElement;
  let fill: HudElement;
  let clock = 0;
  let log: string[];
  let reduced = false;
  const armament = createArmament(LOADOUT);
  const reloadTime = armament.handling[0]!.reloadTime;
  const frame = (reload: number, ms = 1000 / 60): void => {
    clock += ms;
    armament.reload = reload;
    hud.update(armament, LOADOUT, true, 0, null, ms / 1000);
  };

  beforeEach(() => {
    clock = 0;
    reduced = false;
    vi.stubGlobal('document', { createElement: (tag: string) => new HudElement(tag) });
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const parent = new HudElement('div');
    hud = new Hud(parent as unknown as HTMLElement, () => 'R', DEFAULT_CROSSHAIR);
    bar = (parent.children[0] as HudElement).querySelector('.hud-reload');
    fill = bar.firstElementChild!;
    armament.reload = 0;
    // The fill's writes in order, on top of the HudElement's own counting.
    const counted = fill.style;
    log = [];
    fill.style = new Proxy(counted, {
      set(target, property: string, value: string) {
        log.push(`${property}=${value}`);
        return Reflect.set(target, property, value);
      },
    });
    vi.stubGlobal('getComputedStyle', () => {
      log.push('flush');
      return { transitionProperty: reduced ? 'none' : 'transform' };
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('snaps back to empty when a reload is cut half way (a weapon switch, a death, the round ending), and stays there', () => {
    for (let i = 0; i < 30; i++) frame(reloadTime - i / 60);
    log.length = 0;
    frame(0); // cut
    expect(bar.classList.contains('active')).toBe(false);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)']);
    for (let i = 0; i < 120; i++) frame(0); // two seconds on: the old transition would be done by now
    expect(log.length).toBe(2);
    expect(fill.style.transform).toBe('scaleX(0)');
  });

  it('starts a reload begun right after a cancelled one from empty, not from where the first got to', () => {
    for (let i = 0; i < 30; i++) frame(reloadTime - i / 60);
    frame(0);
    log.length = 0;
    frame(reloadTime);
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)', 'flush', `transitionDuration=${reloadTime}s`, 'transform=scaleX(1)']);
    expect(bar.classList.contains('active')).toBe(true);
  });

  it('starts a second reload that follows the first within one frame (no empty frame between) from empty too', () => {
    for (let i = 0; i < 20; i++) frame(reloadTime - i / 60);
    frame(reloadTime - 0.9 * reloadTime); // the first one nearly finished ...
    log.length = 0;
    frame(reloadTime); // ... the next is seen full again
    expect(log).toEqual(['transitionDuration=0s', 'transform=scaleX(0)', 'flush', `transitionDuration=${reloadTime}s`, 'transform=scaleX(1)']);
  });

  it('stands while the match is paused mid-reload and runs again from the reload\'s own progress when it carries on', () => {
    for (let i = 0; i < 15; i++) frame(reloadTime - i / 60);
    const held = reloadTime - 14 / 60;
    log.length = 0;
    frame(held, 30_000); // paused 30 s: the sim's reload does not move
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${Math.floor((1 - held / reloadTime) * 100) / 100})`]);
    log.length = 0;
    frame(held, 1000); // still paused: nothing more is written
    expect(log).toEqual([]);
    const next = held - 1 / 60;
    frame(next); // it carries on: one run from the reload's progress
    expect(log).toEqual(['transitionDuration=0s', `transform=scaleX(${1 - next / reloadTime})`, 'flush', `transitionDuration=${next}s`, 'transform=scaleX(1)']);
    log.length = 0;
    frame(next - 1 / 60); // and the bar keeps pace after
    expect(log).toEqual([]);
  });

  it('steps the reload bar per percent and starts no transition under Reduced motion', () => {
    reduced = true;
    for (let i = 0; i * 1000 < reloadTime * 60_000; i++) frame(Math.max(0.001, reloadTime - i / 60));
    expect(log.some((entry) => entry.startsWith('transitionDuration=') && entry !== 'transitionDuration=0s')).toBe(false);
    expect(log.filter((entry) => entry.startsWith('transform=')).length).toBeGreaterThan(20); // a step per percent, not one run
    expect(log.filter((entry) => entry.startsWith('transform=')).length).toBeLessThanOrEqual(102);
  });
});

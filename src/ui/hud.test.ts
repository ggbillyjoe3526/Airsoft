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

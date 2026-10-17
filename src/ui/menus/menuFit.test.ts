import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HUD_SIZE, hudInsetX, hudScale, SCOREBOARD_SIZE, scoreboardScale } from '../../config/matchInfo';
import { MENU_SCALE, menuScale } from '../../config/menus';
import { MINIMAP, minimapScale } from '../../config/minimap';
import { ContextMenu } from './contextMenu';
import { watchScroll } from './menuParts';
import { EventNode, stubMenuPage } from './menuTestSupport';

/**
 * UX1: the menus grow with a tall window as the HUD does, a page's long part scrolls inside it while the page stays
 * put, and the minimap stays clear of the widest score bar at a large HUD size in a 1280 px window.
 */

describe('the menus\' scale (UX1 acceptance 1)', () => {
  it('leaves 1280 x 720 and 1080p as drawn, and grows a taller window up to 1.5x at 4K', () => {
    expect(menuScale(1280, 720)).toBe(1);
    expect(menuScale(1920, 1080)).toBe(1);
    expect(menuScale(2560, 1440)).toBeCloseTo(1.333, 3);
    expect(menuScale(3840, 2160)).toBe(MENU_SCALE.max);
    expect(MENU_SCALE.max).toBe(1.5);
  });

  it('grows as the HUD does on the common 16:9 screens', () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]] as const) {
      expect(menuScale(w, h), `${w} x ${h}`).toBeCloseTo(hudScale(1, h), 3);
    }
  });

  it('never shrinks them, and a window not measured yet keeps them as drawn', () => {
    for (const [w, h] of [[800, 600], [1024, 640], [0, 0], [Number.NaN, Number.NaN]] as const) expect(menuScale(w, h)).toBe(1);
  });

  it('holds back a tall, narrow window so the layout stays as wide as narrow.css\'s widest step', () => {
    expect(menuScale(1080, 1920)).toBe(1);
    const scale = menuScale(1800, 1600);
    expect(scale).toBeGreaterThan(1);
    expect(1800 / scale).toBeGreaterThanOrEqual(MENU_SCALE.minLayoutWidth - 0.5);
  });
});

describe('the minimap beside the widest score bar (UX1 acceptance 4)', () => {
  const sizes = [1.2, 1.25, 1.3, 1.4, HUD_SIZE.max];

  it('keeps the minimap SCOREBOARD_SIZE.minimapGap clear of the widest bar at HUD size 120 % or more in a 1280 x 720 window', () => {
    for (const size of sizes) {
      const hud = hudScale(size, 720);
      const minimap = minimapScale(hud, 1280, 720);
      const minimapEdge = hudInsetX(1280, 720) + MINIMAP.size * minimap;
      const bar = scoreboardScale(SCOREBOARD_SIZE.default * hud, 1280, minimapEdge);
      const barLeft = 1280 / 2 - SCOREBOARD_SIZE.halfWidth * bar;
      expect(barLeft - minimapEdge, `HUD ${size}`).toBeGreaterThanOrEqual(SCOREBOARD_SIZE.minimapGap - 1e-9);
    }
  });

  it('is the HUD\'s scale wherever there is room, and never under 1', () => {
    expect(minimapScale(1.5, 1920, 1080)).toBe(1.5);
    expect(minimapScale(1.2, 1280, 720)).toBe(1.2);
    expect(minimapScale(1, 1024, 640)).toBe(1);
    expect(minimapScale(1.5, 1024, 640)).toBe(1);
    expect(minimapScale(0.8, 1280, 720)).toBe(0.8);
  });

  it('only holds back past about 120 % at 1280 px, where the bar is already at its least', () => {
    expect(minimapScale(1.5, 1280, 720)).toBeLessThan(1.5);
    expect(minimapScale(1.5, 1280, 720)).toBeGreaterThan(1.2);
  });
});

/** A scrolling part inside a screen, with what watchScroll reads. */
function part(scrollHeight: number) {
  const toggle = vi.fn();
  return { scrollTop: 0, clientHeight: 100, scrollHeight, children: [], classList: { toggle, contains: (c: string) => c === 'menu-scroll' }, toggle };
}

describe('watchScroll\'s scrolling parts (UX1 acceptance 2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('marks a part more-below from its own scroll, and the screen from the screen\'s', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const inner = part(400);
    const listeners: ((e?: Event) => void)[] = [];
    const rootToggle = vi.fn();
    const root = {
      scrollTop: 0,
      clientHeight: 720,
      scrollHeight: 720,
      children: [],
      classList: { toggle: rootToggle },
      querySelectorAll: () => [inner],
      addEventListener: (_t: string, fn: (e?: Event) => void, opts: AddEventListenerOptions) => {
        expect(opts.capture).toBe(true);
        listeners.push(fn);
      },
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    watchScroll(root);
    listeners[0]!({ target: inner } as unknown as Event);
    expect(inner.toggle).toHaveBeenCalledWith('more-below', true);
    expect(rootToggle).not.toHaveBeenCalled();
    inner.scrollTop = 300;
    listeners[0]!({ target: inner } as unknown as Event);
    expect(inner.toggle).toHaveBeenLastCalledWith('more-below', false);
    listeners[0]!({ target: root } as unknown as Event);
    expect(rootToggle).toHaveBeenCalledWith('more-below', false);
  });

  it('finds the parts again as sizes change, so one built later (Customise) is watched too', () => {
    let resized = (): void => {};
    const observed: unknown[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(fn: () => void) {
          resized = fn;
        }
        observe = (t: unknown): number => observed.push(t);
        disconnect = vi.fn();
      },
    );
    const parts: ReturnType<typeof part>[] = [];
    const root = {
      scrollTop: 0,
      clientHeight: 720,
      scrollHeight: 720,
      children: [],
      classList: { toggle: vi.fn() },
      querySelectorAll: () => parts,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    watchScroll(root);
    const later = part(500);
    parts.push(later);
    resized();
    expect(later.toggle).toHaveBeenCalledWith('more-below', true);
    expect(observed).toContain(later);
  });
});

describe('the context menu under the menus\' zoom (UX1)', () => {
  beforeEach(() => stubMenuPage());
  afterEach(() => vi.unstubAllGlobals());

  it('writes its corner divided by the zoom, so it opens at the pointer in a grown window', () => {
    const m = new ContextMenu();
    (m.root as unknown as { currentCSSZoom: number }).currentCSSZoom = 1.5;
    m.open('x', [{ label: 'A', run: vi.fn() }], 300, 210);
    const style = (m.root as unknown as EventNode).style;
    expect([style.left, style.top]).toEqual(['200px', '140px']);
  });
});

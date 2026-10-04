import { afterEach, describe, expect, it } from 'vitest';
import { MINIMAP } from '../config/minimap';
import { Minimap } from './minimap';

/** Just enough DOM for the minimap without a browser: canvases without a 2D context, a container with inline style. */
function fakeDom() {
  const vars = new Map<string, string>();
  const canvas = {
    width: 0,
    height: 0,
    hidden: false,
    className: '',
    setAttribute: () => undefined,
    getContext: () => null,
    remove: () => undefined,
    getBoundingClientRect: () => ({ left: 16, top: 16, width: canvas.width / ratio.value, height: canvas.height / ratio.value }),
  };
  const ratio = { value: 1 };
  const parent = {
    style: { setProperty: (k: string, v: string) => void vars.set(k, v), getPropertyValue: (k: string) => vars.get(k) ?? '' },
    appendChild: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  (globalThis as { document?: unknown }).document = { createElement: () => canvas };
  return { canvas, parent: parent as unknown as HTMLElement, vars, ratio };
}

const realDocument = globalThis.document;
const realRatio = globalThis.devicePixelRatio;
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
  (globalThis as { devicePixelRatio?: number }).devicePixelRatio = realRatio;
});

describe('Minimap layout (audit UI-14, UI-04, UI-13)', () => {
  it('re-reads the pixel ratio and the HUD scale each time it shows, not once per match', () => {
    const dom = fakeDom();
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio = 1;
    const minimap = new Minimap(dom.parent, [], '#00f', '#f80');
    expect(dom.canvas.width).toBe(MINIMAP.size);
    // Moved to a 2x screen mid-match: sharp again once shown.
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio = 2;
    dom.ratio.value = 2;
    minimap.setVisible(true);
    expect(dom.canvas.width).toBe(MINIMAP.size * 2);
    // A bigger HUD (Settings → HUD) makes a bigger minimap.
    dom.vars.set('--hud-scale', '1.5');
    minimap.setVisible(true);
    expect(dom.canvas.width).toBe(MINIMAP.size * 3);
    expect(dom.vars.get('--minimap-size')).toBe(`${MINIMAP.size * 1.5}px`);
    // Its circle hides the teammate markers under it while it shows.
    const r = (MINIMAP.size * 1.5) / 2;
    expect(minimap.covers(16 + r, 16 + r)).toBe(true);
    expect(minimap.covers(16 + 2 * r + 5, 16 + r)).toBe(false);
    minimap.setVisible(false);
    expect(minimap.covers(16 + r, 16 + r)).toBe(false);
  });
});

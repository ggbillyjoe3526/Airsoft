import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MINIMAP } from '../config/minimap';
import { Minimap, type MinimapFrame } from './minimap';
import { clampToSquare, FrameCheck, type HeardPlayer, insideSquare } from './minimapView';

/**
 * G4 QA, criterion 2: the minimap's canvas is drawn again on every change that shows (a heard patch coming, moving,
 * changing kind or leaving, a resize or a new HUD size, a storey), and not on one that doesn't; the square panel keeps
 * what it draws at its edge.
 */

interface Dom {
  canvas: { width: number; height: number };
  parent: HTMLElement;
  vars: Map<string, string>;
  handlers: Map<string, () => void>;
  removed: string[];
  ratio: { value: number };
}

function fakeDom(): Dom {
  const vars = new Map<string, string>();
  const ratio = { value: 1 };
  const ctx = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true });
  const canvas = {
    width: 0,
    height: 0,
    hidden: false,
    className: '',
    setAttribute: () => undefined,
    getContext: () => ctx,
    remove: () => undefined,
    // The canvas's CSS size: its backing pixels over the pixel ratio (the stylesheet sizes it to --minimap-size).
    getBoundingClientRect: () => ({ left: 16, top: 16, width: canvas.width / ratio.value, height: canvas.height / ratio.value }),
  };
  const plain = () => ({ className: '', hidden: false, textContent: '', setAttribute: () => undefined, append: () => undefined, remove: () => undefined });
  (globalThis as { document?: unknown }).document = { createElement: (tag: string) => (tag === 'canvas' ? canvas : plain()) };
  const handlers = new Map<string, () => void>();
  const removed: string[] = [];
  vi.stubGlobal('addEventListener', (type: string, fn: () => void) => void handlers.set(type, fn));
  vi.stubGlobal('removeEventListener', (type: string) => void removed.push(type));
  const parent = {
    style: { setProperty: (k: string, v: string) => void vars.set(k, v), getPropertyValue: (k: string) => vars.get(k) ?? '' },
    classList: { toggle: () => undefined, remove: () => undefined },
    appendChild: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  return { canvas, parent: parent as unknown as HTMLElement, vars, handlers, removed, ratio };
}

const realDocument = globalThis.document;
const realRatio = globalThis.devicePixelRatio;
beforeEach(() => void ((globalThis as { devicePixelRatio?: number }).devicePixelRatio = 1));
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
  (globalThis as { devicePixelRatio?: number }).devicePixelRatio = realRatio;
  vi.unstubAllGlobals();
});

const frame = (): MinimapFrame => ({
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  mates: [{ x: 3, y: 0, z: 3, hit: false }],
  count: 1,
  hold: null,
  flag: null,
  exits: [],
  exitCount: 0,
  time: 1,
});

function shown(storeys: readonly number[] = []) {
  const dom = fakeDom();
  const minimap = new Minimap(dom.parent, [], '#00f', '#f80', null, [], storeys);
  minimap.setVisible(true);
  return { dom, minimap };
}

const patch = (over: Partial<HeardPlayer> = {}): HeardPlayer => ({ sourceId: 4, kind: 'shot', x: 5, z: -5, radius: 3, at: 1, ...over });

describe('a resize redraws the minimap (G4)', () => {
  it('draws again once the window moves to a screen of another pixel ratio, with the canvas resized', () => {
    const { dom, minimap } = shown();
    const f = frame();
    minimap.update(f, []);
    expect(minimap.draws).toBe(1);
    expect(dom.canvas.width).toBe(MINIMAP.size);
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio = 2;
    dom.ratio.value = 2;
    dom.handlers.get('resize')!();
    expect(dom.canvas.width).toBe(MINIMAP.size * 2);
    minimap.update(f, []);
    expect(minimap.draws, 'a resized canvas is blank: it must be drawn at once').toBe(2);
    minimap.update(f, []);
    expect(minimap.draws).toBe(2);
  });

  it('draws again, and bigger, when the HUD\'s size changed', () => {
    const { dom, minimap } = shown();
    const f = frame();
    minimap.update(f, []);
    dom.vars.set('--hud-scale', '1.5');
    dom.handlers.get('resize')!();
    expect(dom.canvas.width).toBe(Math.round(MINIMAP.size * 1.5));
    expect(dom.vars.get('--minimap-size')).toBe(`${MINIMAP.size * 1.5}px`);
    minimap.update(f, []);
    expect(minimap.draws).toBe(2);
  });

  it('draws nothing more for a resize that changes neither', () => {
    const { dom, minimap } = shown();
    const f = frame();
    minimap.update(f, []);
    dom.handlers.get('resize')!();
    dom.handlers.get('resize')!();
    minimap.update(f, []);
    expect(minimap.draws).toBe(1);
  });

  it('tells the markers where its square is after the resize, and stops listening when it goes', () => {
    const { dom, minimap } = shown();
    expect(minimap.covers(16 + MINIMAP.size - 1, 16 + 1)).toBe(true);
    expect(minimap.covers(16 + MINIMAP.size + 1, 16 + 1)).toBe(false);
    dom.vars.set('--hud-scale', '1.5');
    dom.handlers.get('resize')!();
    expect(minimap.covers(16 + MINIMAP.size * 1.5 - 1, 16 + 1)).toBe(true);
    minimap.dispose();
    expect(dom.removed).toContain('resize');
  });

  it('draws while it was hidden for a resize, once it shows again', () => {
    const { dom, minimap } = shown();
    const f = frame();
    minimap.update(f, []);
    minimap.setVisible(false);
    (globalThis as { devicePixelRatio?: number }).devicePixelRatio = 2;
    dom.ratio.value = 2;
    dom.handlers.get('resize')!();
    minimap.update(f, []);
    expect(minimap.draws, 'not drawn while hidden').toBe(1);
    minimap.setVisible(true);
    minimap.update(f, []);
    expect(minimap.draws).toBe(2);
    expect(dom.canvas.width).toBe(MINIMAP.size * 2);
  });
});

describe('a heard patch redraws the minimap for each change of it (G4)', () => {
  it('draws when a patch arrives, moves, changes kind or radius, and when it leaves', () => {
    const { minimap } = shown();
    const f = frame();
    const heard = [patch()];
    minimap.update(f, []);
    let draws = minimap.draws;
    const steps: [string, () => void][] = [
      ['a patch arrives', () => undefined],
      ['it moves (heard again)', () => ((heard[0]!.x = 6), (heard[0]!.at = 1.1))],
      ['it changes to a footstep', () => ((heard[0]!.kind = 'step'), (heard[0]!.at = 1.1))],
      ['its guess gets vaguer', () => (heard[0]!.radius = 4)],
    ];
    for (const [what, change] of steps) {
      change();
      f.time = 1.2;
      minimap.update(f, heard);
      expect(minimap.draws, what).toBe(++draws);
      minimap.update(f, heard);
      expect(minimap.draws, `${what}, then still`).toBe(draws);
    }
    heard.length = 0;
    minimap.update(f, heard);
    expect(minimap.draws, 'it leaves').toBe(++draws);
  });

  it('draws when an old patch fades out while a newer one stands, and not again after', () => {
    const { minimap } = shown();
    const f = frame();
    const old = patch({ sourceId: 4, at: 0, x: 4, z: 4 });
    const fresh = patch({ sourceId: 5, at: 9, x: -4, z: -4 });
    const heard = [old, fresh];
    // The old one is in its last stretch, the fresh one steady.
    f.time = 9.5;
    old.at = f.time - MINIMAP.noiseLife + 0.5;
    minimap.update(f, heard);
    const first = minimap.draws;
    f.time += 0.2;
    minimap.update(f, heard);
    expect(minimap.draws, 'it fades step by step').toBe(first + 1);
    f.time += 1;
    minimap.update(f, heard);
    expect(minimap.draws, 'and goes').toBe(first + 2);
    for (let i = 0; i < 20; i++) {
      f.time += 0.01;
      minimap.update(f, heard);
    }
    expect(minimap.draws, 'the steady one needs nothing more').toBe(first + 2);
  });

  it('draws again for the first patch after a quiet spell, and when a freed slot is taken by another source', () => {
    const { minimap } = shown();
    const f = frame();
    const slot = patch({ at: Number.NaN });
    minimap.update(f, [slot]);
    const base = minimap.draws;
    minimap.update(f, [slot]);
    expect(minimap.draws, 'a freed slot is nothing to draw').toBe(base);
    slot.sourceId = 9;
    slot.at = 1;
    minimap.update(f, [slot]);
    expect(minimap.draws).toBe(base + 1);
  });

  it('draws for the heard patches being switched off and on (a rule that shows teammates only)', () => {
    const { minimap } = shown();
    const f = frame();
    minimap.update(f, [patch()]);
    minimap.setHeardShown(false);
    minimap.update(f, [patch()]);
    expect(minimap.draws).toBe(2);
    minimap.update(f, [patch()]);
    expect(minimap.draws, 'off: a patch does not matter').toBe(2);
    minimap.setHeardShown(true);
    minimap.update(f, [patch()]);
    expect(minimap.draws).toBe(3);
  });
});

describe('the panel\'s storeys and edges', () => {
  it('draws when you climb to another storey, not for a step within one', () => {
    const { minimap } = shown([0, 3]);
    const f = frame();
    minimap.update(f, []);
    f.y = 0.4;
    minimap.update(f, []);
    expect(minimap.draws, 'a step up on the same floor shows the same field').toBe(1);
    f.y = 3;
    minimap.update(f, []);
    expect(minimap.draws).toBe(2);
    f.y = 3.2;
    minimap.update(f, []);
    expect(minimap.draws, 'another height on the same floor').toBe(2);
    f.y = 0;
    minimap.update(f, []);
    expect(minimap.draws, 'and back down').toBe(3);
  });

  it('draws when a teammate changes storey, though they have not moved over the ground', () => {
    const { minimap } = shown([0, 3]);
    const f = frame();
    minimap.update(f, []);
    f.mates[0]!.y = 3;
    minimap.update(f, []);
    expect(minimap.draws).toBe(2);
  });

  it('pins to the edge keeping the direction, from any side and corner, and moves nothing inside', () => {
    const inside = { x: 20, y: -30 };
    expect(clampToSquare(inside, 50)).toBe(false);
    expect(inside).toEqual({ x: 20, y: -30 });
    for (const [x, y] of [[200, 0], [-200, 0], [0, 150], [0, -150], [100, 100], [-300, 100], [60, -300]] as const) {
      const p = { x, y };
      expect(clampToSquare(p, 50), `${x},${y}`).toBe(true);
      expect(Math.max(Math.abs(p.x), Math.abs(p.y))).toBeCloseTo(50);
      expect(Math.atan2(p.y, p.x)).toBeCloseTo(Math.atan2(y, x));
    }
  });

  it('counts the square\'s own edges as under the minimap, and nothing for an unlaid-out one', () => {
    expect(insideSquare(10, 10, 10, 10, 200)).toBe(true);
    expect(insideSquare(210, 210, 10, 10, 200)).toBe(true);
    expect(insideSquare(210.5, 100, 10, 10, 200)).toBe(false);
    expect(insideSquare(10, 10, 10, 10, 0)).toBe(false);
  });
});

describe('FrameCheck', () => {
  it('sees a list that grew or shrank even when every number it shares is the same', () => {
    const c = new FrameCheck();
    const run = (...values: number[]): boolean => {
      c.begin();
      for (const v of values) c.add(v);
      return c.end();
    };
    expect(run(1, 2, 3)).toBe(true);
    expect(run(1, 2, 3)).toBe(false);
    expect(run(1, 2)).toBe(true);
    expect(run(1, 2)).toBe(false);
    expect(run(1, 2, 3)).toBe(true);
    expect(run()).toBe(true);
    expect(run()).toBe(false);
  });

  it('is changed on the frame after a reset, and not again', () => {
    const c = new FrameCheck();
    c.begin();
    c.add(1);
    c.end();
    c.reset();
    c.begin();
    c.add(1);
    expect(c.end()).toBe(true);
    c.begin();
    c.add(1);
    expect(c.end()).toBe(false);
  });
});

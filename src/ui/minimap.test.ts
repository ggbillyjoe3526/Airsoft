import { afterEach, describe, expect, it } from 'vitest';
import { MINIMAP } from '../config/minimap';
import { Minimap } from './minimap';
import type { Bush } from '../map/foliage';
import { terrainMaxX, terrainMaxZ } from '../map/terrain';
import { planeTerrain, SLOPE_YARD, SLOPE_YARD_TERRAIN } from '../map/testSupport';

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

/**
 * A fake DOM whose canvases draw into a recording context: every fillRect with the fillStyle it was drawn in, and every
 * arc (M33e's bushes) with the fillStyle then in force.
 */
function recordingDom() {
  const canvases: { width: number; height: number; fills: { style: string; x: number; y: number; w: number; h: number }[]; arcs: { style: string; x: number; y: number; r: number; after: number }[] }[] = [];
  const parent = {
    style: { setProperty: () => undefined, getPropertyValue: () => '' },
    appendChild: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      const fills: { style: string; x: number; y: number; w: number; h: number }[] = [];
      const arcs: { style: string; x: number; y: number; r: number; after: number }[] = [];
      let fillStyle = '';
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_t, key) =>
          key === 'fillStyle'
            ? fillStyle
            : key === 'fillRect'
              ? (x: number, y: number, w: number, h: number) => fills.push({ style: fillStyle, x, y, w, h })
              : key === 'arc'
                ? (x: number, y: number, r: number) => arcs.push({ style: fillStyle, x, y, r, after: fills.length })
                : () => undefined,
        set: (_t, key, value) => {
          if (key === 'fillStyle') fillStyle = String(value);
          return true;
        },
      });
      const canvas = { width: 0, height: 0, fills, arcs, hidden: false, className: '', setAttribute: () => undefined, getContext: () => ctx, remove: () => undefined, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
      canvases.push(canvas);
      return canvas;
    },
  };
  return { canvases, parent: parent as unknown as HTMLElement };
}

describe('the minimap on sloping ground (M33c)', () => {
  const alphaOf = (style: string): number => Number(/rgba\(255, 255, 255, ([\d.]+)\)/.exec(style)?.[1] ?? Number.NaN);

  it('draws the terrain\'s whole footprint in the ground colour, lighter cell by cell where it is higher', () => {
    const dom = recordingDom();
    new Minimap(dom.parent, [], '#00f', '#f80', SLOPE_YARD_TERRAIN);
    const field = dom.canvases[1]!; // the first canvas is the minimap itself
    const t = SLOPE_YARD_TERRAIN;
    const s = MINIMAP.layerScale;
    expect(field.width).toBe(Math.ceil((terrainMaxX(t) - t.minX) * s));
    expect(field.height).toBe(Math.ceil((terrainMaxZ(t) - t.minZ) * s));
    const ground = field.fills[0]!;
    expect(ground.style).toBe(MINIMAP.colours.ground);
    expect([ground.x, ground.y, ground.w, ground.h]).toEqual([0, 0, t.cols * t.cell * s, t.rows * t.cell * s]);
    const shades = field.fills.slice(1).filter((f) => Number.isFinite(alphaOf(f.style)));
    expect(shades.length).toBeGreaterThan(100);
    // Lighter where higher: the slope rises along +x, so the right side's cells carry more white than the left's.
    const meanAlpha = (pick: (f: (typeof shades)[number]) => boolean): number => {
      const sel = shades.filter(pick);
      return sel.reduce((a, f) => a + alphaOf(f.style), 0) / Math.max(1, sel.length);
    };
    expect(meanAlpha((f) => f.x > field.width * 0.75)).toBeGreaterThan(meanAlpha((f) => f.x < field.width * 0.25) + 0.05);
    // Never lighter than the configured shade.
    expect(Math.max(...shades.map((f) => alphaOf(f.style)))).toBeLessThanOrEqual(MINIMAP.terrainShade + 1e-3);
    expect(Math.max(...shades.map((f) => alphaOf(f.style)))).toBeGreaterThan(MINIMAP.terrainShade * 0.8);
  });

  it('draws level ground flat, a map\'s blocks over the terrain, and still nothing for a map with neither', () => {
    const flat = recordingDom();
    new Minimap(flat.parent, [], '#00f', '#f80', planeTerrain(0));
    expect(flat.canvases[1]!.fills).toHaveLength(1); // just the ground colour: no height to shade by
    const withBlocks = recordingDom();
    new Minimap(withBlocks.parent, SLOPE_YARD.blocks, '#00f', '#f80', SLOPE_YARD_TERRAIN);
    const fills = withBlocks.canvases[1]!.fills;
    expect(fills[0]!.style).toBe(MINIMAP.colours.ground);
    // The blocks come after all of the ground's cells.
    const lastShade = fills.map((f) => Number.isFinite(alphaOf(f.style))).lastIndexOf(true);
    expect(fills.slice(lastShade + 1).length).toBe(SLOPE_YARD.blocks.length);
    const none = recordingDom();
    new Minimap(none.parent, [], '#00f', '#f80');
    expect(none.canvases).toHaveLength(1); // no field layer at all, as before
  });
});

describe('bushes on the minimap (M33e)', () => {
  it('draws each bush as a round of its footprint in the bush colour, over the ground and under the cover', () => {
    const bushes: Bush[] = [
      { x: 2, y: 0, z: 3, radius: 1, height: 1.5 },
      { x: -4, y: 0, z: -1, radius: 1.4, height: 1.5 },
    ];
    const dom = recordingDom();
    new Minimap(dom.parent, SLOPE_YARD.blocks, '#00f', '#f80', SLOPE_YARD_TERRAIN, bushes);
    const field = dom.canvases[1]!;
    expect(field.arcs).toHaveLength(2);
    const s = MINIMAP.layerScale;
    for (const [i, b] of bushes.entries()) {
      expect(field.arcs[i]!.style).toBe(MINIMAP.colours.bush);
      expect(field.arcs[i]!.r).toBeCloseTo(b.radius * s, 6);
    }
    // Placed to scale: the second bush sits where the first one's position says it should.
    expect(field.arcs[1]!.x - field.arcs[0]!.x).toBeCloseTo((bushes[1]!.x - bushes[0]!.x) * s, 6);
    expect(field.arcs[1]!.y - field.arcs[0]!.y).toBeCloseTo((bushes[1]!.z - bushes[0]!.z) * s, 6);
    // Drawn after the ground's cells and before the first block that is cover.
    const walkable = SLOPE_YARD.blocks.filter((b) => b.kind === 'floor' || b.kind === 'ramp').length;
    expect(field.arcs[0]!.after).toBe(field.fills.length - (SLOPE_YARD.blocks.length - walkable));
  });

  it('draws no bush on a map without them', () => {
    const dom = recordingDom();
    new Minimap(dom.parent, SLOPE_YARD.blocks, '#00f', '#f80', SLOPE_YARD_TERRAIN);
    expect(dom.canvases[1]!.arcs).toHaveLength(0);
  });
});

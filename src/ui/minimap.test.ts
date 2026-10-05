import { afterEach, describe, expect, it } from 'vitest';
import { MINIMAP } from '../config/minimap';
import { EXIT_VISUALS } from '../config/render';
import { cssColor, TEAM_COLOUR_SETS } from '../config/teams';
import { Minimap, storeyOf } from './minimap';
import type { Bush } from '../map/foliage';
import type { MapBlock } from '../map/mapTypes';
import { vec3 } from '../sim/vec';
import { terrainMaxX, terrainMaxZ } from '../map/terrain';
import { planeTerrain, SLOPE_YARD, SLOPE_YARD_TERRAIN } from '../map/testSupport';

/** Just enough DOM for the minimap without a browser: canvases without a 2D context, a container with inline style. */
function fakeDom() {
  const vars = new Map<string, string>();
  const classes = new Set<string>();
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
    classList: {
      toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)),
      remove: (c: string) => void classes.delete(c),
    },
    appendChild: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  (globalThis as { document?: unknown }).document = { createElement: () => canvas };
  return { canvas, parent: parent as unknown as HTMLElement, vars, ratio, classes };
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

  it('marks its container while it shows, for the debug panel to sit below it (audit UI-06, no :has())', () => {
    const dom = fakeDom();
    const minimap = new Minimap(dom.parent, [], '#00f', '#f80');
    expect(dom.classes.has('minimap-on')).toBe(false);
    minimap.setVisible(true);
    expect(dom.classes.has('minimap-on')).toBe(true);
    minimap.setVisible(false);
    expect(dom.classes.has('minimap-on')).toBe(false);
    minimap.setVisible(true);
    minimap.dispose();
    expect(dom.classes.has('minimap-on')).toBe(false);
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
    classList: { toggle: () => undefined, remove: () => undefined },
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

describe('the minimap on a map with storeys (M34c)', () => {
  const box = (kind: MapBlock['kind'], x0: number, x1: number, y0: number, y1: number): MapBlock => ({
    kind,
    center: vec3((x0 + x1) / 2, (y0 + y1) / 2, 0),
    size: vec3(x1 - x0, y1 - y0, 2),
  });
  // A street, a wall on it, an upper floor over half of it with a wall and a crate on top, a window's sill up there.
  const street = box('floor', 0, 10, -0.5, 0);
  const lowerWall = box('wall', 4, 4.3, 0, 3);
  const upper = box('floor', 5, 10, 2.7, 3);
  const upperWall = box('wall', 9.7, 10, 3, 6);
  const crate = box('crate', 6, 7, 3, 4.2);
  const sill = box('wall', 5, 5.3, 3, 4.2);
  const blocks = [upperWall, crate, sill, upper, lowerWall, street];
  const at = (b: MapBlock) => (b.center.x - b.size.x / 2) * MINIMAP.layerScale;

  it('picks the storey of feet at a height: the highest floor at most storeyPick above them', () => {
    expect(storeyOf([0, 3, 6], 0)).toBe(0);
    expect(storeyOf([0, 3, 6], 3 - MINIMAP.storeyPick - 0.1)).toBe(0);
    expect(storeyOf([0, 3, 6], 3 - MINIMAP.storeyPick)).toBe(1);
    expect(storeyOf([0, 3, 6], 6.2)).toBe(2);
    expect(storeyOf([], 6)).toBe(0);
  });

  it('draws one field per storey: the street without the floor over it, the upper floor over the street shaded darker', () => {
    const dom = recordingDom();
    new Minimap(dom.parent, blocks, '#00f', '#f80', null, [], [0, 3]);
    expect(dom.canvases).toHaveLength(3); // the minimap, then a field per storey
    const [streetLayer, upperLayer] = [dom.canvases[1]!.fills, dom.canvases[2]!.fills];
    // The street: its ground and wall only (everything upstairs starts over a body's height up).
    expect(streetLayer.map((f) => f.x)).toEqual([at(street), at(lowerWall)]);
    expect(streetLayer.map((f) => f.style)).toEqual([MINIMAP.colours.ground, MINIMAP.colours.tall]);
    // Upstairs: the street and its wall, the shade over them, then the upper floor, its crate and sill (low cover over
    // that floor, not 4.2 m walls) and its wall.
    expect(upperLayer.map((f) => f.style)).toEqual([
      MINIMAP.colours.ground,
      MINIMAP.colours.tall,
      MINIMAP.colours.belowStorey,
      MINIMAP.colours.ground,
      MINIMAP.colours.low,
      MINIMAP.colours.low,
      MINIMAP.colours.tall,
    ]);
    expect(upperLayer.map((f) => f.x)).toEqual([at(street), at(lowerWall), 0, at(upper), at(crate), at(sill), at(upperWall)]);
  });

  it('keeps one field on a map with one storey', () => {
    const dom = recordingDom();
    new Minimap(dom.parent, blocks, '#00f', '#f80', null, [], [0]);
    expect(dom.canvases).toHaveLength(2);
    expect(dom.canvases[1]!.fills).toHaveLength(blocks.length);
  });
});

/** A fake DOM whose main canvas records its path calls and the field canvases it draws (M34c), to read the markers. */
function pathDom() {
  type Op = { op: string; args: unknown[] };
  const canvases: object[] = [];
  const ops: Op[] = [];
  const parent = {
    style: { setProperty: () => undefined, getPropertyValue: () => '' },
    classList: { toggle: () => undefined, remove: () => undefined },
    appendChild: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => {
      const mine = canvases.length === 0;
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (_t, key) => (mine ? (...args: unknown[]) => void ops.push({ op: String(key), args }) : () => undefined),
        set: () => true,
      });
      const canvas = { width: 0, height: 0, hidden: false, className: '', setAttribute: () => undefined, getContext: () => ctx, remove: () => undefined, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
      canvases.push(canvas);
      return canvas;
    },
  };
  /** Each marker triangle drawn since `from`: beginPath, moveTo, two lineTo, closePath. */
  const triangles = (): { tip: { x: number; y: number }; base: number; dot: { x: number; y: number } | null }[] => {
    const out: { tip: { x: number; y: number }; base: number; dot: { x: number; y: number } | null }[] = [];
    let dot: { x: number; y: number } | null = null;
    for (let i = 0; i < ops.length; i++) {
      if (ops[i]!.op === 'arc' && ops[i]!.args[2] === 4.5) dot = { x: ops[i]!.args[0] as number, y: ops[i]!.args[1] as number };
      if (ops[i]!.op !== 'moveTo' || ops[i + 1]?.op !== 'lineTo' || ops[i + 2]?.op !== 'lineTo' || ops[i + 3]?.op !== 'closePath') continue;
      const [tx, ty] = ops[i]!.args as [number, number];
      out.push({ tip: { x: tx, y: ty }, base: (ops[i + 1]!.args as [number, number])[1], dot });
    }
    return out;
  };
  const images = (): unknown[] => ops.filter((o) => o.op === 'drawImage').map((o) => o.args[0]);
  return { parent: parent as unknown as HTMLElement, canvases, ops, triangles, images };
}

describe('the minimap on other storeys (M34c)', () => {
  const frame = (y: number, mates: { y: number; hit?: boolean }[]) => ({
    x: 5,
    y,
    z: 5,
    yaw: 0,
    mates: mates.map((m) => ({ x: 7, y: m.y, z: 5, hit: m.hit ?? false })),
    count: mates.length,
    hold: null,
    flag: null,
    exits: [],
    exitCount: 0,
    time: 0,
  });
  const floor = (y: number): MapBlock => ({ kind: 'floor', center: vec3(0, y - 0.15, 0), size: vec3(10, 0.3, 10) });
  const blocks = [floor(0), floor(3), floor(6)];
  const show = (storeys: number[] | undefined, f: ReturnType<typeof frame>) => {
    const dom = pathDom();
    const minimap = new Minimap(dom.parent, blocks, '#00f', '#f80', null, [], storeys);
    minimap.setVisible(true);
    minimap.update(f, []);
    return dom;
  };

  it('draws the field of the storey you stand on, by your feet: the street, then Level 1 from 0.5 m under it', () => {
    // canvases: [minimap, street field, level 1 field, level 2 field]; the same drawing object, not just one that looks alike.
    const drawn = (y: number, field: number): void => {
      const dom = show([0, 3, 6], frame(y, []));
      expect(dom.canvases).toHaveLength(4);
      expect(dom.images()).toHaveLength(1);
      expect(dom.images()[0], `feet at ${y} m draw field ${field}`).toBe(dom.canvases[field]);
    };
    drawn(0, 1);
    drawn(2.4, 1); // halfway up a stair you are still on the street
    drawn(2.5, 2);
    drawn(3, 2);
    drawn(5.4, 2);
    drawn(6, 3);
  });

  it('marks a teammate on a higher storey with an arrow up over their dot, and one on a lower storey with an arrow down', () => {
    const up = show([0, 3, 6], frame(0, [{ y: 3 }])).triangles();
    expect(up).toHaveLength(1);
    expect(up[0]!.tip.y, 'tip above its base: pointing up').toBeLessThan(up[0]!.base);
    expect(up[0]!.base, 'sits over the dot').toBeLessThan(up[0]!.dot!.y);
    expect(up[0]!.tip.x).toBeCloseTo(up[0]!.dot!.x, 6);
    const down = show([0, 3, 6], frame(6, [{ y: 3 }])).triangles();
    expect(down).toHaveLength(1);
    expect(down[0]!.tip.y, 'tip below its base: pointing down').toBeGreaterThan(down[0]!.base);
    // Two storeys away is an arrow too, and each other teammate gets their own.
    const several = show([0, 3, 6], frame(3, [{ y: 6 }, { y: 0 }, { y: 3 }, { y: 0, hit: true }])).triangles();
    expect(several.map((t) => Math.sign(t.base - t.tip.y))).toEqual([1, -1, -1]);
  });

  it('draws no arrow for a teammate on your storey, nor for one near its floor (a stair top)', () => {
    expect(show([0, 3, 6], frame(3, [{ y: 3 }, { y: 3.4 }, { y: 2.6 }, { y: 6.2 }])).triangles().map((t) => Math.sign(t.base - t.tip.y))).toEqual([1]);
    expect(show([0, 3, 6], frame(0, [{ y: 0 }, { y: 2.4 }, { y: 0.3 }])).triangles()).toHaveLength(0);
  });

  it('draws no arrows on a map with one storey, whatever the heights', () => {
    for (const storeys of [undefined, [], [0]]) expect(show(storeys, frame(0, [{ y: 3 }, { y: -2 }])).triangles(), String(storeys)).toHaveLength(0);
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

describe('the exit icons (M43, M68 audit UI-15)', () => {
  /** The stroke colours drawn (the exit icons' among them) by a minimap made with `open` as its open-exit colour (or the default). */
  function strokes(open?: string): string[] {
    const colours: string[] = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: () => () => undefined,
      set: (_t, key, value) => {
        if (key === 'strokeStyle') colours.push(String(value));
        return true;
      },
    });
    const parent = {
      style: { setProperty: () => undefined, getPropertyValue: () => '' },
      classList: { toggle: () => undefined, remove: () => undefined },
      appendChild: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    };
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ width: 0, height: 0, hidden: false, className: '', setAttribute: () => undefined, getContext: () => ctx, remove: () => undefined, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) }),
    };
    const minimap = new Minimap(parent as unknown as HTMLElement, [], '#00f', '#f80', null, [], [], open);
    minimap.setVisible(true);
    minimap.update(
      { x: 0, y: 0, z: 0, yaw: 0, mates: [], count: 0, hold: null, flag: null, exits: [{ x: 3, z: 0, open: true }, { x: -3, z: 0, open: false }], exitCount: 2, time: 0 },
      [],
    );
    return colours;
  }

  it('draws an open exit in the colour it is given (the team colour set’s) and a shut one grey', () => {
    const picked = strokes('#112233');
    expect(picked).toContain('#112233');
    expect(picked).toContain(cssColor(EXIT_VISUALS.shutColor));
    expect(strokes()).toContain(cssColor(TEAM_COLOUR_SETS.standard.exit));
    expect(strokes()).not.toContain('#112233');
  });
});

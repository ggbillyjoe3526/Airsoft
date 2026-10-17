import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_MINIMAP_TURN, MINIMAP, MINIMAP_TURN_CHOICES } from '../config/minimap';
import { MemoryStorage } from '../pool/testStorage';
import { SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { loadMinimapTurn } from '../settings/hudPrefs';
import { Minimap, type MinimapFrame } from './minimap';
import { toMinimap } from './minimapView';

/** A canvas whose 2D context records every rotate and every arc's middle (where a teammate's dot is drawn). */
function recordingDom() {
  const rotations: number[] = [];
  const arcs: { x: number; y: number }[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, key) => {
      if (key === 'rotate') return (a: number) => void rotations.push(a);
      if (key === 'arc') return (x: number, y: number) => void arcs.push({ x, y });
      return () => undefined;
    },
    set: () => true,
  });
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({
      width: 0,
      height: 0,
      hidden: false,
      className: '',
      textContent: '',
      setAttribute: () => undefined,
      append: () => undefined,
      remove: () => undefined,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 16, top: 16, width: MINIMAP.size, height: MINIMAP.size }),
    }),
  };
  const parent = {
    style: { setProperty: () => undefined, getPropertyValue: () => '' },
    classList: { toggle: () => undefined, remove: () => undefined },
    appendChild: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  } as unknown as HTMLElement;
  // A field layer needs a block to be drawn at all; the turn tested here is the field's and the arrow's.
  const minimap = new Minimap(parent, [{ kind: 'wall', center: { x: 0, y: 1, z: 0 }, size: { x: 10, y: 2, z: 1 } }], '#00f', '#f80');
  minimap.setVisible(true);
  return { minimap, rotations, arcs };
}

const realDocument = globalThis.document;
afterEach(() => void ((globalThis as { document?: unknown }).document = realDocument));

const frame = (yaw: number): MinimapFrame => ({
  x: 0,
  y: 0,
  z: 0,
  yaw,
  mates: [{ x: 0, y: 0, z: -4, hit: false }],
  count: 1,
  hold: null,
  flag: null,
  exits: [],
  exitCount: 0,
  time: 1,
});

describe('Settings › HUD › Minimap (M83)', () => {
  it('offers Rotating (the default: the minimap as it always was) and Fixed, saved as minimapTurn', () => {
    expect(MINIMAP_TURN_CHOICES.map((c) => c.id)).toEqual(['rotating', 'fixed']);
    expect(DEFAULT_MINIMAP_TURN).toBe('rotating');
    expect(loadMinimapTurn(new MemoryStorage())).toBe('rotating');
    const saved = new MemoryStorage();
    saved.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, minimapTurn: 'fixed' }));
    expect(loadMinimapTurn(saved)).toBe('fixed');
    saved.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, minimapTurn: 'north' }));
    expect(loadMinimapTurn(saved)).toBe('rotating');
  });

  it('rotating: the field turns by the view yaw and the arrow stays up (as before M83)', () => {
    const { minimap, rotations } = recordingDom();
    minimap.update(frame(0.7), []);
    expect(rotations).toEqual([0.7]);
  });

  it('fixed: the field never turns, the arrow turns the way you look, and a mate ahead of you (-z) sits straight up', () => {
    const { minimap, rotations, arcs } = recordingDom();
    minimap.setRotating(false);
    minimap.update(frame(0.7), []);
    expect(rotations).toEqual([0, -0.7]);
    // The mate 4 m down -z: straight above the middle whatever way you look.
    const mate = arcs[0]!;
    expect(mate.x).toBeCloseTo(0);
    expect(mate.y).toBeLessThan(0);
  });

  it('fixed: the arrow points where the view looks on the map (-sin yaw, -cos yaw), as the field would put it', () => {
    for (const yaw of [0, 0.5, Math.PI / 2, -2]) {
      // The arrow's tip (0, -1) turned by -yaw on the canvas, against where a point straight ahead lands on a fixed map.
      const tip = { x: Math.sin(-yaw), y: -Math.cos(-yaw) };
      const ahead = toMinimap(0, 0, 0, -Math.sin(yaw), -Math.cos(yaw), 1, { x: 0, y: 0 });
      expect(tip.x, String(yaw)).toBeCloseTo(ahead.x);
      expect(tip.y, String(yaw)).toBeCloseTo(ahead.y);
    }
  });

  it('draws again when switched, even with nothing else changed', () => {
    const { minimap } = recordingDom();
    const f = frame(0.3);
    minimap.update(f, []);
    const draws = minimap.draws;
    minimap.update(f, []);
    expect(minimap.draws).toBe(draws);
    minimap.setRotating(false);
    minimap.update(f, []);
    expect(minimap.draws).toBe(draws + 1);
  });
});

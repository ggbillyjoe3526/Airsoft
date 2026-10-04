import { describe, expect, it } from 'vitest';
import { CROSSHAIR_COLORS, CROSSHAIR_RANGES, CROSSHAIR_SHAPES, DEFAULT_CROSSHAIR } from '../config/matchInfo';
import { SETTINGS_KEY } from '../settings/storage';
import { crosshairCss, crosshairGap, hexColour, loadCrosshair } from './crosshair';

function storage(saved: Record<string, unknown>): Storage {
  const data = new Map([[SETTINGS_KEY, JSON.stringify({ version: 1, ...saved })]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined } as unknown as Storage;
}

describe('crosshair settings (M19)', () => {
  it('starts as the crosshair the game always had, made of options that exist', () => {
    expect(loadCrosshair(null)).toEqual(DEFAULT_CROSSHAIR);
    expect(DEFAULT_CROSSHAIR).toMatchObject({ shape: 'crossDot', color: 'white', outline: 'on' });
    expect(CROSSHAIR_SHAPES.some((s) => s.id === DEFAULT_CROSSHAIR.shape)).toBe(true);
    for (const key of ['size', 'thickness', 'gap'] as const) {
      expect(DEFAULT_CROSSHAIR[key]).toBeGreaterThanOrEqual(CROSSHAIR_RANGES[key].min);
      expect(DEFAULT_CROSSHAIR[key]).toBeLessThanOrEqual(CROSSHAIR_RANGES[key].max);
    }
  });

  it('loads what was saved, each part falling back to the default on its own', () => {
    const saved = loadCrosshair(storage({ 'crosshair.shape': 'circle', 'crosshair.size': 12, 'crosshair.gap': 99, 'crosshair.color': 'blue', 'crosshair.thickness': 3 }));
    expect(saved).toEqual({ ...DEFAULT_CROSSHAIR, shape: 'circle', size: 12, thickness: 3 });
  });

  it('never offers the team colours', () => {
    expect(CROSSHAIR_COLORS.map((c) => c.id)).not.toContain('blue');
    expect(CROSSHAIR_COLORS.map((c) => c.id)).not.toContain('orange');
  });
});

describe('crosshair colour, opacity and static mode (audit UI-21)', () => {
  it('takes a custom #rrggbb colour and nothing else', () => {
    expect(hexColour('#1A2b3C')).toBe('#1a2b3c');
    for (const bad of ['javascript:alert(1)', 'red', '#12345', '#1234567', 'url(x)', 12, null]) expect(hexColour(bad)).toBeUndefined();
    const saved = loadCrosshair(storage({ 'crosshair.color': 'custom', 'crosshair.customColor': '#123abc', 'crosshair.opacity': 0.5, 'crosshair.dynamic': 'off' }));
    expect(saved).toMatchObject({ color: 'custom', customColor: '#123abc', opacity: 0.5, dynamic: 'off' });
    expect(crosshairCss(saved)).toBe('#123abc');
    expect(loadCrosshair(storage({ 'crosshair.customColor': 'expression(x)', 'crosshair.opacity': 3 }))).toMatchObject({
      customColor: DEFAULT_CROSSHAIR.customColor,
      opacity: DEFAULT_CROSSHAIR.opacity,
    });
  });

  it('opens with the spread when dynamic, and keeps its gap when static', () => {
    expect(crosshairGap(4, 10, true)).toBeGreaterThan(4);
    expect(crosshairGap(4, 0, true)).toBe(4);
    expect(crosshairGap(4, 10, false)).toBe(4);
  });
});

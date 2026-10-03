import { describe, expect, it } from 'vitest';
import { CROSSHAIR_COLORS, CROSSHAIR_RANGES, CROSSHAIR_SHAPES, DEFAULT_CROSSHAIR } from '../config/matchInfo';
import { SETTINGS_KEY } from '../settings/storage';
import { loadCrosshair } from './crosshair';

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

import { describe, expect, it } from 'vitest';
import { FRAME_RATE_CAP_CHOICES, GRAPHICS_ROWS, graphicsKey, graphicsRow, parseStored, storedValue, TONE_MAPPING_CHOICES } from './graphics';
import { FRAME_RATE_CAPS, QUALITY, QUALITY_FIELDS, QUALITY_PRESETS, TONE_MAPPING } from './render';

describe('the Custom graphics rows (final alpha audit section 4, UI-06)', () => {
  it('has one row for every quality setting, each with help and a cost', () => {
    expect(GRAPHICS_ROWS.map((r) => r.field).sort()).toEqual([...QUALITY_FIELDS].sort());
    for (const row of GRAPHICS_ROWS) {
      expect(row.help.length, row.field).toBeGreaterThan(10);
      expect(row.cost.length, row.field).toBeGreaterThan(0);
    }
    expect(graphicsKey('renderScale')).toBe('graphics.renderScale');
  });

  it('can show and save every preset value, and reads each back as it was', () => {
    for (const p of QUALITY_PRESETS) {
      for (const f of QUALITY_FIELDS) {
        const row = graphicsRow(f)!;
        const stored = storedValue(row, QUALITY[p][f]);
        expect(stored, `${p}.${f}`).toBeDefined();
        expect(parseStored(row, stored), `${p}.${f}`).toBe(QUALITY[p][f]);
      }
    }
  });

  it('turns away a stale or hand-edited value, so it falls back to High', () => {
    const scale = graphicsRow('renderScale')!;
    expect(parseStored(scale, 80)).toBe(0.8);
    expect(parseStored(scale, 82)).toBeUndefined(); // off the slider's steps
    expect(parseStored(scale, 40)).toBeUndefined();
    expect(parseStored(scale, '80')).toBeUndefined();
    const shadows = graphicsRow('shadowMapSize')!;
    expect(parseStored(shadows, '4096')).toBe(4096);
    expect(parseStored(shadows, '8192')).toBeUndefined();
    expect(parseStored(graphicsRow('antialias')!, true)).toBeUndefined(); // saved as 'on' / 'off'
  });

  it('offers no cap first, then each frame-rate cap', () => {
    expect(FRAME_RATE_CAP_CHOICES.map((c) => c.value)).toEqual([...FRAME_RATE_CAPS]);
    expect(FRAME_RATE_CAP_CHOICES[0]).toMatchObject({ id: 'off', value: 0 });
  });
});

describe('the visual overhaul’s rows (FA7)', () => {
  it('adds its rows after the existing ones, in one block', () => {
    const fields = GRAPHICS_ROWS.map((r) => r.field);
    expect(fields.slice(-5)).toEqual(['environment', 'normalMaps', 'mapDetail', 'trees', 'clouds']);
  });

  it('stores trees and relief maps by name and reads them back', () => {
    const trees = graphicsRow('trees')!;
    expect([0, 1, 2].map((v) => storedValue(trees, v))).toEqual(['none', 'simple', 'detailed']);
    expect(parseStored(trees, 'detailed')).toBe(2);
    const relief = graphicsRow('normalMaps')!;
    expect(storedValue(relief, false)).toBe('bump');
    expect(parseStored(relief, 'normal')).toBe(true);
    expect(parseStored(relief, 'off')).toBeUndefined();
  });

  it('offers Neutral first (the default), then AgX and ACES', () => {
    expect(TONE_MAPPING_CHOICES.map((c) => c.id)).toEqual(['neutral', 'agx', 'aces']);
    expect(TONE_MAPPING_CHOICES[0]!.id).toBe(TONE_MAPPING.default);
  });
});

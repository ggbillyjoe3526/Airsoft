import { describe, expect, it } from 'vitest';
import { FRAME_RATE_CAP_CHOICES, GRAPHICS_ROWS, graphicsKey, graphicsRow, parseStored, storedValue } from './graphics';
import { FRAME_RATE_CAPS, QUALITY, QUALITY_FIELDS, QUALITY_PRESETS } from './render';

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

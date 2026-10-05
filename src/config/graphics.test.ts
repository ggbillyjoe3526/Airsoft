import { describe, expect, it } from 'vitest';
import { FRAME_RATE_CAP_CHOICES, frameRateCapFromSaved, GRAPHICS_ROWS, graphicsKey, graphicsRow, parseStored, rowEnabled, storedValue, TONE_MAPPING_CHOICES } from './graphics';
import { FRAME_RATE_CAPS, QUALITY, QUALITY_CHOICES, QUALITY_FIELDS, QUALITY_PRESETS, resolveQuality, TONE_MAPPING } from './render';

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
  it('adds its rows after the replica sheen, in one block', () => {
    const fields = GRAPHICS_ROWS.map((r) => r.field);
    const at = fields.indexOf('replicaSheen') + 1;
    expect(fields.slice(at, at + 5)).toEqual(['environment', 'normalMaps', 'mapDetail', 'trees', 'clouds']);
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

describe('the shadow rows', () => {
  it('names Shadow detail’s options after the presets that use them', () => {
    const row = graphicsRow('shadowMapSize')!;
    if (row.kind !== 'choice') throw new Error('Shadow detail is a choice row');
    for (const p of QUALITY_PRESETS) {
      if (!QUALITY[p].shadows) continue;
      const label = QUALITY_CHOICES.find((c) => c.id === p)!.label;
      expect(row.options.find((o) => o.value === QUALITY[p].shadowMapSize)?.label, p).toBe(label);
    }
  });

  it('greys out the four shadow rows while Shadows is off, and only those', () => {
    expect(GRAPHICS_ROWS.filter((r) => r.needs === 'shadows').map((r) => r.field)).toEqual(['shadowMapSize', 'shadowRadius', 'shadowFollowsView', 'figureShadows']);
    expect(GRAPHICS_ROWS.filter((r) => !rowEnabled(r, QUALITY.low)).map((r) => r.field)).toEqual(['shadowMapSize', 'shadowRadius', 'shadowFollowsView', 'figureShadows']);
    for (const r of GRAPHICS_ROWS) expect(rowEnabled(r, QUALITY.medium), r.field).toBe(true);
  });
});

describe('the Night lights row (M33f)', () => {
  it('comes after Clouds and offers off, the nearest 2, 4 and (G5, Ultra) 8, saved by name', () => {
    const fields = GRAPHICS_ROWS.map((r) => r.field);
    expect(fields[fields.indexOf('clouds') + 1]).toBe('poolLights');
    const row = graphicsRow('poolLights')!;
    if (row.kind !== 'choice') throw new Error('Night lights is a choice row');
    expect(row.label).toBe('Night lights');
    expect(row.options.map((o) => [o.label, o.value])).toEqual([['Off', 0], ['Nearest 2', 2], ['Nearest 4', 4], ['Nearest 8', 8]]);
    expect(parseStored(row, storedValue(row, 2))).toBe(2);
    expect(parseStored(row, '3')).toBeUndefined();
  });

  it('is no real lights on Low, two on Medium and four on High; Custom is High’s unless saved otherwise', () => {
    expect([QUALITY.low.poolLights, QUALITY.medium.poolLights, QUALITY.high.poolLights, QUALITY.ultra.poolLights]).toEqual([0, 2, 4, 8]);
    expect(resolveQuality('custom', {}).poolLights).toBe(4);
    expect(resolveQuality('custom', { poolLights: 0 })).toEqual({ ...QUALITY.high, poolLights: 0 });
  });
});

describe('the post stack’s rows and the frame-rate row (G5)', () => {
  const POST_FIELDS = ['ambientOcclusion', 'bloom', 'temporalAA', 'lightShafts', 'reflections', 'lensFinish'] as const;

  it('adds one row per post effect at the end, each with a sentence-case note and a cost, saved as graphics.<field>', () => {
    expect(GRAPHICS_ROWS.slice(-POST_FIELDS.length).map((r) => r.field)).toEqual([...POST_FIELDS]);
    for (const f of POST_FIELDS) {
      const row = graphicsRow(f)!;
      expect(row.help[0], f).toMatch(/[A-Z]/);
      expect(row.help.endsWith('.'), f).toBe(true);
      expect(row.cost, f).toMatch(/^(GPU|Free|Small)/);
      expect(graphicsKey(f)).toBe(`graphics.${f}`);
    }
  });

  it('saves ambient occlusion by name: off, half or full resolution', () => {
    const row = graphicsRow('ambientOcclusion')!;
    expect([0, 0.5, 1].map((v) => storedValue(row, v))).toEqual(['off', 'half', 'full']);
    expect(parseStored(row, 'half')).toBe(0.5);
    expect(parseStored(row, 'quarter')).toBeUndefined();
  });

  it('offers 30, 60, 120, 144, 240 and Unlimited, Unlimited first under the id Off had', () => {
    expect(FRAME_RATE_CAP_CHOICES.map((c) => c.label)).toEqual(['Unlimited', '30', '60', '120', '144', '240']);
    expect(FRAME_RATE_CAP_CHOICES.map((c) => c.id)).toEqual(['off', '30', '60', '120', '144', '240']);
  });

  it('reads a saved frame-rate id as itself and any other number as the nearest choice, the higher on a tie', () => {
    for (const c of FRAME_RATE_CAP_CHOICES) expect(frameRateCapFromSaved(c.id)).toBe(c.value);
    expect(frameRateCapFromSaved(50)).toBe(60);
    expect(frameRateCapFromSaved('90')).toBe(120); // 30 from 60 and from 120: the higher
    expect(frameRateCapFromSaved(200)).toBe(240);
    expect(frameRateCapFromSaved(1000)).toBe(240);
    expect(frameRateCapFromSaved(10)).toBe(30);
    expect(frameRateCapFromSaved(-1)).toBe(0);
    expect(frameRateCapFromSaved('')).toBeUndefined();
    expect(frameRateCapFromSaved('unlimited')).toBeUndefined();
    expect(frameRateCapFromSaved(null)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  BAKED_LIGHT_MODES,
  type BakedLightMode,
  DETAIL_LEVELS,
  type DetailLevel,
  DUST_MOTES,
  effectivePixelRatio,
  parseQuality,
  QUALITY,
  QUALITY_CHOICES,
  QUALITY_FIELDS,
  QUALITY_PRESETS,
  qualityChoiceOf,
  type QualitySettings,
  resolveQuality,
  startingQuality,
  SURFACES,
  TIER_QUALITY,
  TONE_MAPPING,
} from './render';

/** A field's value on a cheapest-first scale: numbers and switches as numbers, a detail level by its place (FA8). */
const rank = (v: QualitySettings[keyof QualitySettings]): number =>
  typeof v === 'string' ? (BAKED_LIGHT_MODES.includes(v as BakedLightMode) ? BAKED_LIGHT_MODES.indexOf(v as BakedLightMode) : DETAIL_LEVELS.indexOf(v as DetailLevel)) : Number(v);

/** Fields whose change shows on a screen at 100 % scaling (devicePixelRatio 1): all but the high-DPI cap. */
const VISIBLE_AT_DPR_1: readonly (keyof QualitySettings)[] = QUALITY_FIELDS.filter((f) => f !== 'maxPixelRatio');

/** The woods' surfaces (config NatureSurfaceId, M33i): bark, planks, stone, groundDetail. */
const NATURE_SURFACES = 4;
/** The city's surfaces (M34f): five finishes and glass. */
const CITY_SURFACES = 6;
/** The texture library's own surfaces (G6, render/textureLibrary.ts) no map draws yet: painted steel, for G8 and G9. */
const LIBRARY_SURFACES = 1;

describe('render quality presets (final alpha audit section 4)', () => {
  it('sets every field on every preset', () => {
    for (const p of QUALITY_PRESETS) {
      expect(Object.keys(QUALITY[p]).sort(), p).toEqual([...QUALITY_FIELDS].sort());
      for (const f of QUALITY_FIELDS) expect(QUALITY[p][f], `${p}.${f}`).toBeDefined();
    }
  });

  it('gives Low a resolution lever and High smoothing at a capped pixel ratio (REN-01, REN-23)', () => {
    expect(QUALITY.low).toMatchObject({ renderScale: 0.8, maxPixelRatio: 1, antialias: false });
    expect(QUALITY.medium).toMatchObject({ renderScale: 1, maxPixelRatio: 1.25, antialias: true });
    expect(QUALITY.high).toMatchObject({ renderScale: 1, maxPixelRatio: 1.5, antialias: true });
  });

  it('gets cheaper at every step from High to Low, in every field', () => {
    for (let i = 1; i < QUALITY_PRESETS.length; i++) {
      const cheaper = QUALITY[QUALITY_PRESETS[i - 1]!];
      const dearer = QUALITY[QUALITY_PRESETS[i]!];
      for (const f of QUALITY_FIELDS) {
        expect(rank(cheaper[f]), f).toBeGreaterThanOrEqual(0);
        expect(rank(cheaper[f]), f).toBeLessThanOrEqual(rank(dearer[f]));
      }
    }
  });

  it('makes every step up buy at least three things a 100 %-scaling screen shows (REN-02)', () => {
    for (let i = 1; i < QUALITY_PRESETS.length; i++) {
      const [a, b] = [QUALITY[QUALITY_PRESETS[i - 1]!], QUALITY[QUALITY_PRESETS[i]!]];
      const differ = VISIBLE_AT_DPR_1.filter((f) => a[f] !== b[f]);
      expect(differ.length, `${QUALITY_PRESETS[i - 1]} → ${QUALITY_PRESETS[i]}: ${differ.join(', ')}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('never makes Low dearer than it was before the audit (its 60 fps target on an integrated GPU)', () => {
    const low = QUALITY.low;
    expect(low.renderScale).toBeLessThanOrEqual(1);
    expect(low.maxPixelRatio).toBe(1);
    expect([low.antialias, low.shadows, low.figureShadows, low.surfaceRelief, low.replicaSheen]).toEqual([false, false, false, false, false]);
    expect(low.textureSize).toBeLessThanOrEqual(512);
    expect(low.anisotropy).toBeLessThanOrEqual(4);
    expect(low.dustMotes).toBe(0);
    // No real lights on Low (M33f): its light pools light the ground with one mesh.
    expect(low.poolLights).toBe(0);
  });

  it('keeps every visual-overhaul feature off or at today’s value on Low, and turns them on for Medium and High (FA7)', () => {
    expect(QUALITY.low).toMatchObject({ environment: false, normalMaps: false, mapDetail: false, trees: 1, clouds: false, replicaSheen: false });
    for (const p of ['medium', 'high'] as const) {
      expect(QUALITY[p], p).toMatchObject({ environment: true, normalMaps: true, mapDetail: true, trees: 2, clouds: true, replicaSheen: true });
    }
  });

  it('maps tones with Neutral by default at exposure 1 (audit F2)', () => {
    expect(TONE_MAPPING.default).toBe('neutral');
    expect(TONE_MAPPING.exposure.neutral).toBe(1);
  });

  it('keeps every FA8 overhaul item off Low (today\'s meshes, no glow, grit or beam), and the laser beam off every preset', () => {
    expect(QUALITY.low).toMatchObject({ figureDetail: 'low', replicaDetail: 'low', handDetail: 'low', bbGlow: false, impactGrit: false, laserBeam: false });
    for (const p of ['medium', 'high'] as const) {
      expect(QUALITY[p]).toMatchObject({ figureDetail: 'high', replicaDetail: 'high', handDetail: 'high', bbGlow: true, impactGrit: true, laserBeam: false });
    }
  });

  it('resolves a choice: a preset is its row whatever the custom fields; Custom is High overlaid with them (REN-20)', () => {
    expect(resolveQuality('medium', { shadows: false, renderScale: 0.5 })).toEqual(QUALITY.medium);
    expect(resolveQuality('custom', {})).toEqual(QUALITY.high);
    expect(resolveQuality('custom', { shadows: false, renderScale: 0.65 })).toEqual({ ...QUALITY.high, shadows: false, renderScale: 0.65 });
    // A stored object can hold an explicit undefined even though the type can't (exactOptionalPropertyTypes).
    expect(resolveQuality('custom', { shadows: undefined } as unknown as Parameters<typeof resolveQuality>[1])).toEqual(QUALITY.high);
    // Not the preset's own object: changing the result can't change the table.
    expect(resolveQuality('custom', {})).not.toBe(QUALITY.high);
  });

  it('names the preset a settings object equals, or Custom', () => {
    for (const p of QUALITY_PRESETS) expect(qualityChoiceOf({ ...QUALITY[p] })).toBe(p);
    expect(qualityChoiceOf({ ...QUALITY.low, shadows: true })).toBe('custom');
    expect(qualityChoiceOf({ ...QUALITY.high, renderScale: 0.95 })).toBe('custom');
  });

  it('renders at the DPI cap times the render scale (REN-01)', () => {
    expect(effectivePixelRatio(1, QUALITY.low)).toBeLessThan(1);
    expect(effectivePixelRatio(1.25, QUALITY.low)).toBeCloseTo(0.8, 12);
    expect(effectivePixelRatio(2, QUALITY.high)).toBe(1.5);
    expect(effectivePixelRatio(1, QUALITY.high)).toBe(1);
    expect(effectivePixelRatio(2, QUALITY.medium)).toBe(1.25);
  });

  it('keeps the surface textures within each preset\'s GPU budget (REN-13)', () => {
    // Every map draws the core set; a map with the woods' surfaces (M33i) draws those four too, only then.
    const core = Object.keys(SURFACES.worldSize).length - NATURE_SURFACES - CITY_SURFACES - LIBRARY_SURFACES;
    // RGBA with mipmaps (a third more).
    const mb = (textures: number, size: number): number => (textures * size * size * 4 * 4) / 3 / 2 ** 20;
    for (const p of QUALITY_PRESETS) expect(Math.log2(QUALITY[p].textureSize) % 1, p).toBe(0); // a power of two, for mipmaps
    expect(core).toBe(8);
    expect(mb(core, QUALITY.low.textureSize)).toBeLessThan(3);
    expect(mb(core, QUALITY.medium.textureSize)).toBeLessThan(12);
    expect(mb(core, QUALITY.high.textureSize)).toBeLessThan(48);
    const all = core + NATURE_SURFACES;
    expect(mb(all, QUALITY.low.textureSize)).toBeLessThan(4.5);
    expect(mb(all, QUALITY.medium.textureSize)).toBeLessThan(17);
    expect(mb(all, QUALITY.high.textureSize)).toBeLessThan(68);
    // Neon Heights (M34f): the core set, the city's six and the woods' boards (its planters and stalls).
    const city = core + CITY_SURFACES + 1;
    expect(mb(city, QUALITY.low.textureSize)).toBeLessThan(5.5);
    expect(mb(city, QUALITY.medium.textureSize)).toBeLessThan(21);
    expect(mb(city, QUALITY.high.textureSize)).toBeLessThan(82);
  });

  it('never draws more dust motes than the buffer holds', () => {
    expect(Math.max(...Object.values(QUALITY).map((q) => q.dustMotes))).toBeLessThanOrEqual(DUST_MOTES.max);
    expect(DUST_MOTES.max).toBeLessThanOrEqual(300);
    expect(DUST_MOTES.box).toBeGreaterThan(0);
  });

  it('reads ?quality= values and rejects anything else', () => {
    expect(parseQuality('custom')).toBe('custom');
    expect(parseQuality('low')).toBe('low');
    expect(parseQuality('medium')).toBe('medium');
    expect(parseQuality('high')).toBe('high');
    expect(parseQuality(null)).toBeNull();
    expect(parseQuality('')).toBeNull();
    expect(parseQuality('ultra')).toBeNull();
    expect(parseQuality('toString')).toBeNull(); // not fooled by inherited object keys
  });

  it('starts a first visit on the GPU\'s preset, unsaved; a saved or asked-for choice wins (REN-03, audit M-02)', () => {
    expect(TIER_QUALITY).toEqual({ software: 'low', integrated: 'medium', unknown: 'medium', discrete: 'high' });
    expect(startingQuality(null, null, {}, 'discrete')).toEqual({ choice: 'high', settings: QUALITY.high, automatic: true });
    expect(startingQuality(null, null, {}, 'integrated')).toEqual({ choice: 'medium', settings: QUALITY.medium, automatic: true });
    expect(startingQuality(null, null, {}, 'unknown')).toEqual({ choice: 'medium', settings: QUALITY.medium, automatic: true });
    expect(startingQuality(null, null, {}, 'software')).toEqual({ choice: 'low', settings: QUALITY.low, automatic: true });
    // A saved pick is the player's: kept even in software.
    expect(startingQuality(null, 'high', {}, 'software')).toEqual({ choice: 'high', settings: QUALITY.high, automatic: false });
    // ?quality= wins over both, Custom included (the saved rows over High's).
    expect(startingQuality('medium', 'low', {}, 'discrete')).toEqual({ choice: 'medium', settings: QUALITY.medium, automatic: false });
    expect(startingQuality('custom', null, { dustMotes: 0 }, 'integrated')).toEqual({ choice: 'custom', settings: { ...QUALITY.high, dustMotes: 0 }, automatic: false });
  });

  it('offers the three presets and Custom on the picker, cheapest first', () => {
    expect(QUALITY_CHOICES.map((c) => c.id)).toEqual([...QUALITY_PRESETS, 'custom']);
  });
});

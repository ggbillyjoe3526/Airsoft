import { describe, expect, it } from 'vitest';
import { sightConditionsOf } from '../ai/perception';
import { LIGHTING_PRESETS } from '../config/render';
import { MemoryStorage } from '../pool/testStorage';
import { resolveLighting } from '../render/lightingPreset';
import { saveSetting, SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { loadLightingPicks } from '../ui/menus/savedChoices';
import { DEPOT } from './depot';
import { lightingChoices, lightingPicked, mapUnderLighting, parseLightingPick } from './lightingChoice';
import { MAPS } from './maps';
import { NEON_HEIGHTS } from './neonHeights';
import { WOODLAND } from './woodland';

describe('Day or Night on a map (M34d)', () => {
  it('offers Neon Heights Night first, then Day; Woodland Night only; Depot Day only', () => {
    expect(lightingChoices(NEON_HEIGHTS)).toEqual(['night', 'day']);
    expect(lightingChoices(WOODLAND)).toEqual(['night']);
    expect(lightingChoices(DEPOT)).toEqual(['day']);
    // The first preset is the default, and `night` goes with it.
    for (const m of MAPS) expect(m.data.night ?? false, m.id).toBe(LIGHTING_PRESETS[lightingChoices(m.data)[0]!].night);
  });

  it('picks a preset the map offers, else its first', () => {
    expect(lightingPicked(NEON_HEIGHTS, 'day')).toBe('day');
    expect(lightingPicked(NEON_HEIGHTS, 'night')).toBe('night');
    expect(lightingPicked(NEON_HEIGHTS, undefined)).toBe('night');
    expect(lightingPicked(NEON_HEIGHTS, null)).toBe('night');
    expect(lightingPicked(WOODLAND, 'day')).toBe('night');
    expect(lightingPicked(DEPOT, 'night')).toBe('day');
  });

  it('plays Neon Heights by Day through the one lighting path: day light, no night sight, no night flag', () => {
    const day = mapUnderLighting(NEON_HEIGHTS, 'day');
    expect(day.night).toBe(false);
    expect(day.lighting!.presets).toEqual(['day', 'night']);
    expect(resolveLighting(day)).toEqual(LIGHTING_PRESETS.day);
    expect(sightConditionsOf(day).night).toBeNull();
    // The rest of the map is the same data.
    expect(day.blocks).toBe(NEON_HEIGHTS.blocks);
    expect(day.spawns).toBe(NEON_HEIGHTS.spawns);
  });

  it('plays Neon Heights by Night: night light, the bots night sight, the night flag for glowing BBs', () => {
    for (const night of [mapUnderLighting(NEON_HEIGHTS, 'night'), mapUnderLighting(NEON_HEIGHTS)]) {
      expect(night.night).toBe(true);
      expect(night.lighting!.presets[0]).toBe('night');
      expect(resolveLighting(night).night).toBe(true);
      expect(resolveLighting(night).sky).toEqual(LIGHTING_PRESETS.night.sky);
      expect(sightConditionsOf(night).night).not.toBeNull();
    }
  });

  it('leaves a map with one preset or none as it is, whatever is asked', () => {
    expect(mapUnderLighting(WOODLAND, 'day')).toBe(WOODLAND);
    expect(mapUnderLighting(DEPOT, 'night')).toBe(DEPOT);
  });

  it('reads a saved pick only as a preset id', () => {
    expect(parseLightingPick('day')).toBe('day');
    expect(parseLightingPick('night')).toBe('night');
    for (const raw of ['dusk', '', 3, null, undefined, {}, 'toString']) expect(parseLightingPick(raw), String(raw)).toBeUndefined();
  });
});

describe('the saved Day or Night pick (M34d)', () => {
  const stored = (fields: Record<string, unknown>): Storage => {
    const s = new MemoryStorage();
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...fields }));
    return s;
  };

  it('reads each map\'s pick as `lighting.<map id>`, only on a map that offers it', () => {
    expect(loadLightingPicks(stored({ 'lighting.neonHeights': 'day' }))).toEqual({ neonHeights: 'day' });
    expect(loadLightingPicks(stored({ 'lighting.neonHeights': 'night' }))).toEqual({ neonHeights: 'night' });
    // Woodland and Depot offer one light each: a pick saved for them plays no part.
    expect(loadLightingPicks(stored({ 'lighting.woodland': 'day', 'lighting.depot': 'night' }))).toEqual({});
    // Garbage, nothing saved, or no storage: no pick, so each map plays its first preset.
    expect(loadLightingPicks(stored({ 'lighting.neonHeights': 'dusk' }))).toEqual({});
    expect(loadLightingPicks(new MemoryStorage())).toEqual({});
    expect(loadLightingPicks(null)).toEqual({});
  });

  it('keeps a pick saved by saveSetting for the next visit', () => {
    const s = new MemoryStorage();
    saveSetting('lighting.neonHeights', 'day', s);
    expect(loadLightingPicks(s)).toEqual({ neonHeights: 'day' });
  });
});

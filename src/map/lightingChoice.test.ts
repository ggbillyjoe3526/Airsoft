import { describe, expect, it } from 'vitest';
import { sightConditionsOf } from '../ai/perception';
import { LIGHTING_PRESETS } from '../config/render';
import { MemoryStorage } from '../pool/testStorage';
import { resolveLighting } from '../render/lightingPreset';
import { saveSetting, SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { loadLightingPicks } from '../ui/menus/savedChoices';
import type { MapData } from './mapTypes';
import { DEPOT } from './depot';
import { lightingChoices, lightingPicked, mapUnderLighting, parseLightingPick, playsAtNight } from './lightingChoice';
import { MAPS, mapData } from './maps';
import { NEON_HEIGHTS } from './neonHeights';
import { WOODLAND } from './woodland';

describe('Day or Night on a map (M34d)', () => {
  it('offers Neon Heights Night first, then Day; Woodland Night only; Depot Day only', () => {
    expect(lightingChoices(NEON_HEIGHTS)).toEqual(['night', 'day']);
    expect(lightingChoices(WOODLAND)).toEqual(['night']);
    expect(lightingChoices(DEPOT)).toEqual(['day']);
    // The first preset is the default, and `night` goes with it.
    for (const m of MAPS) expect(mapData(m.id).night ?? false, m.id).toBe(LIGHTING_PRESETS[lightingChoices(mapData(m.id))[0]!].night);
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
      // The night preset under the city's own sky glow (M34f).
      expect(resolveLighting(night).sky).toEqual({ ...LIGHTING_PRESETS.night.sky, ...NEON_HEIGHTS.lighting!.overrides!.night!.sky });
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

describe('Day or Night on any map that lists both (M34d)', () => {
  // A map the helper has never heard of, listing Day first and an override: it knows no map by name.
  const OTHER: MapData = { ...DEPOT, lighting: { presets: ['day', 'night'], overrides: { night: { fog: { density: 0.01 } } as never } } };

  it('offers the choice to any map that lists two presets, its first preset the default', () => {
    expect(lightingChoices(OTHER)).toEqual(['day', 'night']);
    expect(lightingPicked(OTHER, undefined)).toBe('day');
    expect(mapUnderLighting(OTHER).night).toBe(false);
    const night = mapUnderLighting(OTHER, 'night');
    expect(night.night).toBe(true);
    expect(night.lighting!.presets).toEqual(['night', 'day']);
    expect(night.lighting!.overrides).toBe(OTHER.lighting!.overrides);
    expect(sightConditionsOf(night).night).not.toBeNull();
    expect(resolveLighting(night).sky).toEqual(LIGHTING_PRESETS.night.sky);
  });

  it('does not change the map it is given, and picking again picks the same', () => {
    const before = JSON.stringify(NEON_HEIGHTS.lighting);
    const day = mapUnderLighting(NEON_HEIGHTS, 'day');
    expect(day).not.toBe(NEON_HEIGHTS);
    expect(JSON.stringify(NEON_HEIGHTS.lighting)).toBe(before);
    expect(NEON_HEIGHTS.night).toBe(true);
    expect(mapUnderLighting(day, 'day')).toEqual(day);
    // Night after Day on the already-picked map flips it back, whatever the order listed.
    expect(mapUnderLighting(day, 'night')).toEqual(mapUnderLighting(NEON_HEIGHTS, 'night'));
  });

  it('gives the same map back for the same pick, and another for the other pick (M63, audit REN-01)', () => {
    // The kept map meshes compare maps by identity: Play again on the same map and light must find the same object.
    for (const pick of ['day', 'night'] as const) expect(mapUnderLighting(NEON_HEIGHTS, pick)).toBe(mapUnderLighting(NEON_HEIGHTS, pick));
    expect(mapUnderLighting(NEON_HEIGHTS)).toBe(mapUnderLighting(NEON_HEIGHTS, 'night'));
    expect(mapUnderLighting(NEON_HEIGHTS, null)).toBe(mapUnderLighting(NEON_HEIGHTS, 'night'));
    expect(mapUnderLighting(NEON_HEIGHTS, 'day')).not.toBe(mapUnderLighting(NEON_HEIGHTS, 'night'));
  });

  it('keeps Neon Heights\' default Night: the bare map is what plays when nothing is picked', () => {
    expect(NEON_HEIGHTS.night).toBe(true);
    expect(mapUnderLighting(NEON_HEIGHTS)).toEqual(NEON_HEIGHTS);
    expect(resolveLighting(NEON_HEIGHTS).night).toBe(true);
  });

  it('lists exactly one map in the game as offering both today: Neon Heights', () => {
    expect(MAPS.filter((m) => lightingChoices(mapData(m.id)).length > 1).map((m) => m.id)).toEqual(['neonHeights']);
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

describe('the one night flag (M33h)', () => {
  it('equals the resolved preset night for every map and pick, and the map played under that pick', () => {
    for (const { id } of MAPS) {
      const data = mapData(id);
      for (const pick of [undefined, 'day', 'night'] as const) {
        expect(playsAtNight(data, pick)).toBe(resolveLighting(data, pick).night);
        expect(playsAtNight(mapUnderLighting(data, pick))).toBe(playsAtNight(data, pick));
      }
    }
  });

  it('reads a map override of night', () => {
    const map: MapData = { ...DEPOT, lighting: { presets: ['day'], overrides: { day: { night: true } } } };
    expect(playsAtNight(map)).toBe(true);
    expect(resolveLighting(map).night).toBe(true);
  });
});

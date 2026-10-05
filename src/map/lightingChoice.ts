import { LIGHTING_PRESETS, type LightingPresetId } from '../config/render';
import type { MapData } from './mapTypes';

/**
 * Day or Night (M34d): the lighting presets a map offers (MapData.lighting, M33f) and the map as it plays under the one
 * picked. Pure, and it knows no map by name: any map that lists two presets offers the choice.
 */

/** The presets a map offers, its default first: day for a map that says nothing about its lighting. */
export function lightingChoices(map: MapData): readonly LightingPresetId[] {
  return map.lighting?.presets ?? ['day'];
}

/** The preset a map plays under: `choice` if the map offers it, else its first. */
export function lightingPicked(map: MapData, choice?: LightingPresetId | null): LightingPresetId {
  const offered = lightingChoices(map);
  return choice != null && offered.includes(choice) ? choice : offered[0]!;
}

/**
 * Whether `map` is played at night under `choice` (M33h): the picked preset's `night`, with the map's override of it if
 * any. The one flag the night systems read (dev counting, the bots' torches and night sight, the torch light), so the
 * Day/Night pick drives them all.
 */
export function playsAtNight(map: MapData, choice?: LightingPresetId | null): boolean {
  const id = lightingPicked(map, choice);
  return map.lighting?.overrides?.[id]?.night ?? LIGHTING_PRESETS[id].night;
}

/**
 * The map as it plays under `choice`: the picked preset listed first, so the one lighting path (resolveLighting,
 * addLighting) draws it, and `night` set by that preset, so glowing BBs and the bots' night sight go with it. A map
 * with no lighting block, or with one preset, plays as it is.
 */
export function mapUnderLighting(map: MapData, choice?: LightingPresetId | null): MapData {
  const lighting = map.lighting;
  if (!lighting || lighting.presets.length < 2) return map;
  const id = lightingPicked(map, choice);
  const rest = lighting.presets.filter((p) => p !== id);
  return { ...map, night: LIGHTING_PRESETS[id].night, lighting: { ...lighting, presets: [id, ...rest] } };
}

/** What New game calls each preset. */
export const LIGHTING_LABELS: Readonly<Record<LightingPresetId, string>> = { day: 'Day', night: 'Night' };

/** Reads a saved lighting pick: a preset's id, else undefined. */
export function parseLightingPick(raw: unknown): LightingPresetId | undefined {
  return typeof raw === 'string' && Object.hasOwn(LIGHTING_PRESETS, raw) ? (raw as LightingPresetId) : undefined;
}

import * as THREE from 'three';
import { type LightingPreset, type LightingPresetId, LIGHTING_PRESETS } from '../config/render';
import type { LightingOverride, MapData } from '../map/mapTypes';
import { lightingChoices, lightingPicked, playsAtNight } from '../map/lightingChoice';
import { mapBoundingBox } from './lighting';
import type { EnvironmentLook } from './replicaSheen';

/**
 * A map's light from its data (M33f): which lighting preset it is played under, with its own tweaks and its key light
 * turned towards its `moonOver` point. Pure: the renderer (Renderer.setLighting) and the match's lights (addLighting)
 * take what this resolves. Every map can use every preset: nothing here knows any map by name.
 */

// The presets a map offers, the pick among them and whether it plays at night live with the map data (M34d, M33h,
// map/lightingChoice.ts).
export { lightingChoices, playsAtNight };

/**
 * The lighting preset a map is played under: `choice` if the map offers it (M34's match-start pick), else the map's
 * first; with the map's overrides laid over it, group by group, and its key light turned towards `moonOver`.
 */
export function resolveLighting(map: MapData, choice?: LightingPresetId): LightingPreset {
  const id = lightingPicked(map, choice);
  const preset = withOverride(LIGHTING_PRESETS[id], map.lighting?.overrides?.[id]);
  const over = map.lighting?.moonOver;
  if (!over) return preset;
  const centre = mapBoundingBox(map).getCenter(new THREE.Vector3());
  return { ...preset, key: { ...preset.key, offset: aimOffset(preset.key.offset, over.x - centre.x, over.z - centre.z) } };
}

/** A preset with an override's values laid over it, one group at a time (a group not named keeps all its values). */
export function withOverride(preset: LightingPreset, override: LightingOverride | undefined): LightingPreset {
  if (!override) return preset;
  const out = { ...preset } as Record<string, unknown>;
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    const base = (preset as unknown as Record<string, unknown>)[k];
    out[k] = typeof v === 'object' && typeof base === 'object' ? { ...base, ...v } : v;
  }
  return out as unknown as LightingPreset;
}

/**
 * `offset` turned about the vertical towards the horizontal direction (dx, dz), keeping its height and its length:
 * the key light's height above the horizon stays the preset's. Unchanged for a zero direction.
 */
export function aimOffset(offset: LightingPreset['key']['offset'], dx: number, dz: number): LightingPreset['key']['offset'] {
  const along = Math.hypot(dx, dz);
  if (along < 1e-9) return offset;
  const flat = Math.hypot(offset.x, offset.z);
  return { x: (dx / along) * flat, y: offset.y, z: (dz / along) * flat };
}

/** The unit direction towards the key light (the sun or the moon), into `out`. */
export function keyDirection(preset: LightingPreset, out = new THREE.Vector3()): THREE.Vector3 {
  const o = preset.key.offset;
  return out.set(o.x, o.y, o.z).normalize();
}

/** What the environment map is made from under a preset: its sky and ground, with the key light's direction. */
export function environmentLookOf(preset: LightingPreset): EnvironmentLook {
  const d = keyDirection(preset);
  return { sky: preset.sky, sun: { x: d.x, y: d.y, z: d.z }, ground: preset.environment.ground };
}

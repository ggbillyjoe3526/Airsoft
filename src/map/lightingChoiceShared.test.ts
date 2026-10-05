import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { playMatch } from '../ai/depotMatchSupport';
import { setUpRun } from '../ai/extractionRunSupport';
import { lowCoverBlocks, tallCoverBlocks } from '../ai/cover';
import { sightConditionsOf } from '../ai/perception';
import { soundscapeOf } from '../audio/soundscape';
import { BOTS } from '../config/bots';
import { ROUNDS } from '../config/hits';
import { BODY } from '../config/movement';
import { NAV } from '../config/nav';
import { LIGHTING_PRESETS, QUALITY, SURFACES, type SurfaceTextureId } from '../config/render';
import { buildNavGrid } from '../nav/navGrid';
import { initPhysics, PhysicsWorld } from '../physics/physicsWorld';
import { addLighting } from '../render/lighting';
import { resolveLighting } from '../render/lightingPreset';
import { MapMeshCache } from '../render/mapMeshCache';
import { type MapLook, mapLookOf, texturesFor } from '../render/mapMeshes';
import type { SurfaceTextures } from '../render/proceduralTextures';
import { DEPOT } from './depot';
import { lightingChoices, mapUnderLighting } from './lightingChoice';
import type { MapData } from './mapTypes';
import { NEON_HEIGHTS } from './neonHeights';
import { RANGE_MAP } from './range';
import { WOODLAND } from './woodland';

/**
 * M63 (audit REN-01): mapUnderLighting now hands the same object to every match on a map and pick, so a match that
 * wrote into the map it was given would carry its change into the next. These pin that nothing a match build or a
 * match in play reads the map through writes into it: the map and both derived picks are deep-frozen (a write throws
 * in this strict-mode module graph), and any typed array (which cannot be frozen) is compared before and after.
 *
 * Freezing the real NEON_HEIGHTS is safe: vitest gives every test file its own module graph.
 */

/** Freezes `o` and everything it reaches; returns the typed arrays it found (they can't be frozen) with copies. */
function deepFreeze(o: unknown, views: { view: ArrayLike<number>; copy: number[] }[] = [], seen = new Set<unknown>()) {
  if (o === null || typeof o !== 'object' || seen.has(o)) return views;
  seen.add(o);
  if (ArrayBuffer.isView(o)) {
    const view = o as unknown as ArrayLike<number>;
    views.push({ view, copy: Array.from(view) });
    return views;
  }
  for (const v of Object.values(o)) deepFreeze(v, views, seen);
  Object.freeze(o);
  return views;
}

function textures(): SurfaceTextures {
  return Object.fromEntries(
    (Object.keys(SURFACES.worldSize) as SurfaceTextureId[]).map((id) => [id, { texture: Object.assign(new THREE.Texture(), { name: id }) as THREE.CanvasTexture, worldSize: SURFACES.worldSize[id] }]),
  ) as SurfaceTextures;
}

const PICKS = ['night', 'day'] as const;

describe('the map a match is given is never written into (M63, audit REN-01)', () => {
  const snapshot = structuredClone(NEON_HEIGHTS);
  const views = deepFreeze(NEON_HEIGHTS);
  const played = PICKS.map((pick) => mapUnderLighting(NEON_HEIGHTS, pick));
  for (const map of played) deepFreeze(map, views);
  const playedSnapshots = played.map((m) => structuredClone(m));

  beforeAll(async () => {
    await initPhysics();
  });

  /** The kept map is still the one handed out, and still what it was before anything ran. */
  const expectUntouched = () => {
    PICKS.forEach((pick, i) => expect(mapUnderLighting(NEON_HEIGHTS, pick), pick).toBe(played[i]));
    expect(NEON_HEIGHTS).toEqual(snapshot);
    played.forEach((m, i) => expect(m, PICKS[i]).toEqual(playedSnapshots[i]));
    for (const { view, copy } of views) expect(Array.from(view)).toEqual(copy);
  };

  it('freezes the maps the game would hand out (so a write by any test below throws)', () => {
    expect(Object.isFrozen(played[0])).toBe(true);
    expect(Object.isFrozen(played[0]!.lighting!.presets)).toBe(true);
    expect(Object.isFrozen(NEON_HEIGHTS.blocks[0])).toBe(true);
    expect(() => {
      (played[1] as { night?: boolean }).night = true;
    }).toThrow(TypeError);
  });

  it('builds the map meshes, the lighting and the soundscape on every look and pick without writing into the map', () => {
    const looks: MapLook[] = [mapLookOf(QUALITY.low), { ...mapLookOf(QUALITY.medium), relief: false }, { ...mapLookOf(QUALITY.medium), relief: true, normalMaps: false }];
    for (const map of played) {
      const cache = new MapMeshCache(() => new THREE.Texture());
      for (const look of looks) {
        cache.take(map, textures(), look);
        cache.release();
      }
      cache.clear();
      texturesFor(map);
      for (const quality of [QUALITY.low, QUALITY.medium, QUALITY.high]) addLighting(new THREE.Scene(), map, quality, resolveLighting(map));
      soundscapeOf(map, resolveLighting(map).night);
      sightConditionsOf(map, map.night);
    }
    expectUntouched();
  });

  it('builds the physics, the bots navigation and cover, and plays Elimination and Attack / Defend under each pick, writing nothing', () => {
    for (const map of played) {
      const physics = new PhysicsWorld(map, BODY, 1 / 60);
      const nav = buildNavGrid(map, NAV);
      lowCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap);
      tallCoverBlocks(map.blocks, nav, BODY, BOTS.lowCoverFloorGap);
      physics.dispose();
      for (const mode of ['elimination', 'attackDefend'] as const) playMatch(15, 7, undefined, BOTS, mode, ROUNDS, map);
    }
    expectUntouched();
  });

  it('sets up and plays an Extraction run under each pick, writing nothing', () => {
    for (const map of played) {
      const r = setUpRun({ seed: 3, map, runnerBot: true });
      r.play(20);
      r.dispose();
    }
    expectUntouched();
  });

  it('plays the same pick twice in a row on the one kept object, the second as the first (no state carried in it)', () => {
    const night = mapUnderLighting(NEON_HEIGHTS, 'night');
    const a = playMatch(10, 11, undefined, BOTS, 'elimination', ROUNDS, night);
    const b = playMatch(10, 11, undefined, BOTS, 'elimination', ROUNDS, mapUnderLighting(NEON_HEIGHTS, 'night'));
    expect(b).toEqual(a);
    expectUntouched();
  });
});

describe('the base map and the two picks stay apart (M63, audit REN-01)', () => {
  it('hands a map with no choice back as itself for any pick, so its meshes are kept as before', () => {
    for (const map of [DEPOT, WOODLAND, RANGE_MAP]) {
      expect(lightingChoices(map).length, map.name).toBeLessThan(2);
      for (const pick of [undefined, null, 'day', 'night'] as const) expect(mapUnderLighting(map, pick), `${map.name} ${pick}`).toBe(map);
    }
  });

  it('keeps Day and Night distinct whichever is asked first, each with its own light and night flag', () => {
    const day = mapUnderLighting(NEON_HEIGHTS, 'day');
    const night = mapUnderLighting(NEON_HEIGHTS, 'night');
    // Back and forth: each pick is still its own object with its own light, the other's untouched.
    for (let i = 0; i < 3; i++) {
      expect(mapUnderLighting(NEON_HEIGHTS, 'night')).toBe(night);
      expect(mapUnderLighting(NEON_HEIGHTS, 'day')).toBe(day);
    }
    expect(day).not.toBe(night);
    expect(day.night).toBe(false);
    expect(night.night).toBe(true);
    expect(day.lighting!.presets).toEqual(['day', 'night']);
    expect(night.lighting!.presets).toEqual(['night', 'day']);
    expect(day.lighting).not.toBe(night.lighting);
    expect(day.lighting!.presets).not.toBe(night.lighting!.presets);
    expect(resolveLighting(day).night).toBe(LIGHTING_PRESETS.day.night);
    expect(resolveLighting(night).night).toBe(true);
    // Neither is the bare map, whose own light block is as written.
    expect(day).not.toBe(NEON_HEIGHTS);
    expect(night).not.toBe(NEON_HEIGHTS);
    expect(NEON_HEIGHTS.lighting!.presets).toEqual(['night', 'day']);
  });

  it('keys the kept picks on the map object: another map with the same data gets its own', () => {
    const copy: MapData = { ...NEON_HEIGHTS };
    const night = mapUnderLighting(copy, 'night');
    expect(night).not.toBe(mapUnderLighting(NEON_HEIGHTS, 'night'));
    expect(night).toEqual(mapUnderLighting(NEON_HEIGHTS, 'night'));
    expect(mapUnderLighting(copy, 'night')).toBe(night);
  });
});

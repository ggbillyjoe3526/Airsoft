import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, ENVIRONMENT, LIGHTING, LIGHTING_PRESETS } from '../config/render';
import { DEPOT } from '../map/depot';
import type { MapData } from '../map/mapTypes';
import { MAPS, mapData } from '../map/maps';
import { RANGE_MAP } from '../map/range';
import { terrainHeightAt } from '../map/terrain';
import { RAMP_YARD, TEST_YARD } from '../map/testYard';
import { WOODLAND, WOODLAND_LAYOUT } from '../map/woodland';
import { DEFAULT_SKY } from './atmosphere';
import { keyLightOffset, mapBoundingBox } from './lighting';
import { aimOffset, environmentLookOf, keyDirection, lightingChoices, resolveLighting, withOverride } from './lightingPreset';
import { defaultEnvironmentLook, environmentKey } from './replicaSheen';

describe('the day preset is today’s look, field by field (M33f, acceptance 1)', () => {
  it('builds the day from the constants every map was lit with before', () => {
    const day = LIGHTING_PRESETS.day;
    expect(day.night).toBe(false);
    expect(day.sky).toEqual({ zenith: ATMOSPHERE.zenith, horizon: ATMOSPHERE.horizon, below: ATMOSPHERE.below, sunGlow: ATMOSPHERE.sunGlow, sunGlowPower: ATMOSPHERE.sunGlowPower, horizonFalloff: ATMOSPHERE.horizonFalloff });
    expect(DEFAULT_SKY).toBe(day.sky);
    expect(day.fog).toEqual({ colour: ATMOSPHERE.horizon, near: ATMOSPHERE.fogNear, far: ATMOSPHERE.fogFar });
    expect(day.hemi).toEqual({ sky: LIGHTING.hemiSky, ground: LIGHTING.hemiGround, intensity: LIGHTING.hemiIntensity });
    expect(day.key).toEqual({ colour: LIGHTING.sunColor, intensity: LIGHTING.sunIntensity, offset: LIGHTING.sunOffset, disc: { colour: ATMOSPHERE.clouds.sunColour, size: ATMOSPHERE.clouds.sunSize } });
    expect(day.clouds).toEqual({ shade: ATMOSPHERE.clouds.shade, top: 0xffffff, opacity: ATMOSPHERE.clouds.opacity });
    expect(day.environment).toEqual({ ground: ENVIRONMENT.ground, intensity: ENVIRONMENT.intensity });
    expect(day.exposureScale).toBe(1);
  });

  it('makes the same environment map by day as before (no new prefilter on Depot)', () => {
    expect(environmentKey(environmentLookOf(LIGHTING_PRESETS.day))).toBe(environmentKey(defaultEnvironmentLook()));
  });

  it('resolves Depot, the range and the test maps to the day preset itself, with the sun where it was', () => {
    for (const map of [DEPOT, RANGE_MAP, TEST_YARD, RAMP_YARD]) {
      expect(lightingChoices(map), map.name).toEqual(['day']);
      expect(resolveLighting(map), map.name).toBe(LIGHTING_PRESETS.day);
      const offset = keyLightOffset(LIGHTING_PRESETS.day.key.offset, mapBoundingBox(map), LIGHTING.shadowMargin);
      expect(offset.toArray(), map.name).toEqual([LIGHTING.sunOffset.x, LIGHTING.sunOffset.y, LIGHTING.sunOffset.z]);
    }
  });
});

describe('a map picks its light in its data (M33f)', () => {
  const both: MapData = { ...TEST_YARD, lighting: { presets: ['night', 'day'] } };

  it('takes the first preset by default and a choice it offers, and falls back to the first for one it does not', () => {
    expect(resolveLighting(both)).toBe(LIGHTING_PRESETS.night);
    expect(resolveLighting(both, 'day')).toBe(LIGHTING_PRESETS.day);
    expect(resolveLighting(TEST_YARD, 'night')).toBe(LIGHTING_PRESETS.day);
    expect(resolveLighting(WOODLAND, 'day')).toMatchObject({ night: true });
  });

  it('lays a map’s overrides over the preset group by group, leaving the preset table alone', () => {
    const tweaked: MapData = { ...TEST_YARD, lighting: { presets: ['night'], overrides: { night: { fog: { near: 30 }, exposureScale: 1.3 } } } };
    const p = resolveLighting(tweaked);
    expect(p.fog).toEqual({ ...LIGHTING_PRESETS.night.fog, near: 30 });
    expect(p.exposureScale).toBe(1.3);
    expect(p.sky).toBe(LIGHTING_PRESETS.night.sky);
    expect(LIGHTING_PRESETS.night.fog.near).toBe(20);
    expect(withOverride(LIGHTING_PRESETS.day, undefined)).toBe(LIGHTING_PRESETS.day);
  });

  it('turns the key light towards a point, keeping its height and length', () => {
    const o = { x: 3, y: 4, z: 4 };
    const a = aimOffset(o, 0, -10);
    expect(a.x).toBeCloseTo(0);
    expect(a.z).toBeCloseTo(-5);
    expect(a.y).toBe(4);
    expect(aimOffset(o, 0, 0)).toBe(o);
  });

  it('keeps the play cues’ night flag and the look in step on every map until M34 drops the flag', () => {
    for (const map of MAPS.map((m) => mapData(m.id))) expect(map.night ?? false, map.name).toBe(resolveLighting(map).night);
    expect(resolveLighting(WOODLAND).night).toBe(true);
  });
});

/** The ground's upward normal at (x, z) on a map's terrain, from its heights either side. */
function groundNormal(map: MapData, x: number, z: number): THREE.Vector3 {
  const t = map.terrain!;
  const h = (px: number, pz: number): number => terrainHeightAt(t, px, pz)!;
  const e = 0.5;
  return new THREE.Vector3(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize();
}

describe('Woodland at night (M33f, acceptance 2)', () => {
  const night = resolveLighting(WOODLAND);
  const moon = keyDirection(night);
  const { knoll } = WOODLAND_LAYOUT;

  it('has a dark sky, haze that closes in, a dim cool fill and a dimmer environment than by day', () => {
    const day = LIGHTING_PRESETS.day;
    const lum = (hex: number): number => new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }).l;
    expect(lum(night.sky.zenith)).toBeLessThan(lum(day.sky.zenith) / 3);
    expect(lum(night.fog.colour)).toBeLessThan(lum(day.fog.colour) / 3);
    // Linear fog at 40 m: still mostly see-through, but far trees and the fence line go into the dark.
    expect((40 - night.fog.near) / (night.fog.far - night.fog.near)).toBeLessThanOrEqual(0.3);
    expect(night.fog.far).toBeLessThan(day.fog.far);
    // The fill as light (linear luminance × intensity, sky and ground sides): M52 raised the night's intensity to 1 on
    // darker colours (audit REN-02), so what it lights is still a small share of the day's.
    const fill = (h: { sky: number; ground: number; intensity: number }, side: 'sky' | 'ground'): number => {
      const c = new THREE.Color(h[side]);
      return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) * h.intensity;
    };
    for (const side of ['sky', 'ground'] as const) expect(fill(night.hemi, side), side).toBeLessThan(fill(day.hemi, side) / 5);
    expect(night.key.intensity).toBeLessThan(day.key.intensity / 2);
    expect(night.environment.intensity).toBeLessThan(day.environment.intensity);
  });

  it('puts a low moon towards the Knoll from the field’s centre', () => {
    const centre = mapBoundingBox(WOODLAND).getCenter(new THREE.Vector3());
    const towards = new THREE.Vector2(knoll.x - centre.x, knoll.z - centre.z).normalize();
    expect(new THREE.Vector2(moon.x, moon.z).normalize().dot(towards)).toBeCloseTo(1, 6);
    const elevation = (Math.asin(moon.y) * 180) / Math.PI;
    expect(elevation).toBeGreaterThan(12);
    expect(elevation).toBeLessThan(25);
  });

  it('rims the Knoll’s top while its west face, towards end 0, stays dark', () => {
    const top = groundNormal(WOODLAND, knoll.x, knoll.z).dot(moon);
    // Halfway down the west fall, the steepest part of the face.
    const westX = knoll.x - knoll.topRadius - 13.5 / 2;
    const west = groundNormal(WOODLAND, westX, knoll.z).dot(moon);
    expect(top).toBeGreaterThan(0.2);
    expect(west).toBeLessThanOrEqual(0);
    const east = groundNormal(WOODLAND, knoll.x + knoll.topRadius + 13.5 / 2, knoll.z).dot(moon);
    expect(east).toBeGreaterThan(top);
  });

  it('stands the moon outside the field, so the whole field is in front of its shadow camera', () => {
    const box = mapBoundingBox(WOODLAND);
    const offset = keyLightOffset(night.key.offset, box, LIGHTING.shadowMargin);
    const centre = box.getCenter(new THREE.Vector3());
    const at = new THREE.Vector3(centre.x + offset.x, offset.y, centre.z + offset.z);
    const target = new THREE.Vector3(centre.x, 0, centre.z);
    const ahead = target.clone().sub(at).normalize();
    for (let i = 0; i < 8; i++) {
      const corner = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      expect(corner.sub(at).dot(ahead), `corner ${i}`).toBeGreaterThan(0);
    }
    // Still the preset's direction.
    expect(offset.clone().normalize().dot(moon)).toBeCloseTo(1, 9);
  });
});

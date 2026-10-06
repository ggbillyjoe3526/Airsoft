import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, LIGHTING, LIGHTING_PRESETS } from '../config/render';
import { environmentLookOf, keyDirection } from './lightingPreset';

/**
 * The day's light (G6, the approved v3 look): a lower, warmer sun, a bluer sky fill and a deeper sky, which the
 * environment map follows; the night untouched.
 */

const rgb = (hex: number): THREE.Color => new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
/** The values before G6, for comparison. */
const BEFORE = { sunColor: 0xffe4bd, hemiSky: 0xcfe2ff, zenith: 0x5f9fd8, sunOffset: { x: 20, y: 42, z: 14 } };

describe('the day lighting (G6)', () => {
  it('sets the sun about 35° up (60° before), as far from the map as before', () => {
    const o = LIGHTING.sunOffset;
    const elevation = (Math.atan2(o.y, Math.hypot(o.x, o.z)) * 180) / Math.PI;
    expect(elevation).toBeGreaterThan(33);
    expect(elevation).toBeLessThan(37);
    const b = BEFORE.sunOffset;
    expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(Math.hypot(b.x, b.y, b.z), 0);
    // Its direction is what the day preset (and so the shadows, the sky's sun and the bake) uses.
    expect(keyDirection(LIGHTING_PRESETS.day).y).toBeCloseTo(Math.sin((elevation * Math.PI) / 180), 6);
  });

  it('warms the sun and blues the sky fill, a little stronger both', () => {
    const sun = rgb(LIGHTING.sunColor);
    const was = rgb(BEFORE.sunColor);
    expect(sun.b / sun.r).toBeLessThan(was.b / was.r);
    expect(sun.r).toBeGreaterThan(sun.g);
    expect(sun.g).toBeGreaterThan(sun.b);
    const fill = rgb(LIGHTING.hemiSky);
    const fillWas = rgb(BEFORE.hemiSky);
    expect(fill.b - fill.r).toBeGreaterThan(fillWas.b - fillWas.r);
    expect(LIGHTING.sunIntensity).toBeGreaterThan(2.7);
    expect(LIGHTING.hemiIntensity).toBeGreaterThan(1.45);
  });

  it('deepens the sky overhead, and the environment map is made from that sky and sun', () => {
    const z = rgb(ATMOSPHERE.zenith);
    const zWas = rgb(BEFORE.zenith);
    expect(z.r + z.g).toBeLessThan(zWas.r + zWas.g);
    expect(z.b).toBeGreaterThan(z.r * 3);
    const env = environmentLookOf(LIGHTING_PRESETS.day);
    expect(env.sky.zenith).toBe(ATMOSPHERE.zenith);
    const d = keyDirection(LIGHTING_PRESETS.day);
    expect([env.sun.x, env.sun.y, env.sun.z]).toEqual([d.x, d.y, d.z]);
  });

  it('leaves the night as it was', () => {
    const n = LIGHTING_PRESETS.night;
    expect(n.hemi).toEqual({ sky: 0x3a4c78, ground: 0x2a2620, intensity: 1 });
    expect([n.key.colour, n.key.intensity]).toEqual([0xc8d4ff, 1]);
    expect(n.sky.zenith).toBe(0x0a1224);
    expect(n.exposureScale).toBe(1.3);
    expect(n.environment).toEqual({ ground: 0x1c1f26, intensity: 0.2 });
  });
});

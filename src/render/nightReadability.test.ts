import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GRAPHICS_ROWS } from '../config/graphics';
import { GROUND_LOOK, LIGHTING, LIGHTING_PRESETS, QUALITY, type LightingPreset, type QualitySettings, TONE_MAPPING } from '../config/render';
import { TEAM_COLORS } from '../config/teams';
import { DEPOT } from '../map/depot';
import { mapUnderLighting } from '../map/lightingChoice';
import { NEON_HEIGHTS } from '../map/neonHeights';
import { WOODLAND } from '../map/woodland';
import { addLighting, shadowTexel } from './lighting';
import { resolveLighting } from './lightingPreset';

/**
 * QA for M52 (night readability): what the worker's own tests leave unpinned. The preset's numbers and shape (criterion
 * 1); the audit's swatch numbers through a second, independent port (criterion 2: Three's own colour conversion and a
 * check that the tone mapper's constants are the installed Three's); Medium's night shadow fit in absolute texels, on
 * more maps and through `setQuality` (criterion 3).
 */

describe('the night preset is candidate B and keeps its shape (M52 criterion 1)', () => {
  const night = LIGHTING_PRESETS.night;
  const day = LIGHTING_PRESETS.day;

  it('has the owner’s numbers: hemi 0x3a4c78 / 0x2a2620 × 1, key 0xc8d4ff × 1, exposure 1.3', () => {
    expect(night.hemi).toEqual({ sky: 0x3a4c78, ground: 0x2a2620, intensity: 1 });
    expect(night.key.colour).toBe(0xc8d4ff);
    expect(night.key.intensity).toBe(1);
    expect(night.exposureScale).toBe(1.3);
  });

  it('leaves the rest of the night as it was: the moon’s height and disc, the fog, the sky, the held replica’s light', () => {
    expect(night.night).toBe(true);
    expect(night.key.disc).toEqual({ colour: 0xe8eeff, size: 0 });
    expect(night.key.offset.y / Math.hypot(night.key.offset.x, night.key.offset.y, night.key.offset.z)).toBeCloseTo(Math.sin((18 * Math.PI) / 180), 3);
    expect(night.fog).toEqual({ colour: 0x1d2b46, near: 20, far: 140 });
    expect(night.sky.zenith).toBe(0x0a1224);
    expect(night.environment).toEqual({ ground: 0x1c1f26, intensity: 0.2 });
    expect(night.viewmodel.key).toEqual({ colour: 0xb8c8ff, intensity: 0.7 });
    expect(night.viewmodel.hemi.intensity).toBe(0.55);
  });

  it('has the day preset’s shape, group by group, and nothing the day lacks', () => {
    const shape = (v: unknown): unknown => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]).sort(([a], [b]) => String(a).localeCompare(String(b)))) : typeof v);
    const { nightSky: _n, ...nightRest } = night as LightingPreset & { nightSky?: unknown };
    expect(Object.keys(nightRest).sort()).toEqual(Object.keys(day).filter((k) => k !== 'nightSky').sort());
    for (const k of Object.keys(nightRest)) expect(shape((nightRest as Record<string, unknown>)[k]), k).toEqual(shape((day as unknown as Record<string, unknown>)[k]));
    // The day is untouched by M52.
    expect(day.exposureScale).toBe(1);
    expect(day.key.intensity).toBeGreaterThan(night.key.intensity);
  });
});

describe('the audit’s swatch numbers, through a second port (M52 criterion 2)', () => {
  type Rgb = [number, number, number];

  /** Three's own sRGB → linear (what `Color.setHex` does under ColorManagement). */
  const lin = (hex: number): Rgb => {
    const c = new THREE.Color(hex);
    return [c.r, c.g, c.b];
  };
  const encode = (v: number): number => {
    const x = Math.min(1, Math.max(0, v));
    return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
  };
  /** NeutralToneMapping as the installed GLSL has it, written again from that source. */
  function neutral(c: Rgb, exposure: number): Rgb {
    const start = 0.8 - 0.04;
    const [r, g, b] = c.map((v) => v * exposure) as Rgb;
    const x = Math.min(r, g, b);
    const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    const o = [r - offset, g - offset, b - offset] as Rgb;
    const peak = Math.max(...o);
    if (peak < start) return o;
    const d = 1 - start;
    const newPeak = 1 - (d * d) / (peak + d - start);
    const k = newPeak / peak;
    const gg = 1 - 1 / (0.15 * (peak - newPeak) + 1);
    return o.map((v) => v * k * (1 - gg) + newPeak * gg) as Rgb;
  }
  /** An upward Lambert face (hemisphere sky side in full, plus the key at the moon's height), on screen. */
  function floor(albedo: number, p: LightingPreset): Rgb {
    const a = lin(albedo);
    const sky = lin(p.hemi.sky);
    const key = lin(p.key.colour);
    const s = p.key.offset.y / Math.hypot(p.key.offset.x, p.key.offset.y, p.key.offset.z);
    const irr = a.map((v, i) => (v * (sky[i]! * p.hemi.intensity + key[i]! * p.key.intensity * s)) / Math.PI) as Rgb;
    return neutral(irr, TONE_MAPPING.exposure.neutral * p.exposureScale).map(encode) as Rgb;
  }
  const near = (got: Rgb, want: Rgb, tol = 1): void => {
    for (let i = 0; i < 3; i++) expect(Math.abs(got[i]! - want[i]!), `${got.join(',')} vs ${want.join(',')}`).toBeLessThanOrEqual(tol);
  };

  /** The night preset as it was before M52 (the audit's numbers for it). */
  const before: LightingPreset = {
    ...LIGHTING_PRESETS.night,
    hemi: { sky: 0x3a4c78, ground: 0x1a1c22, intensity: 0.4 },
    key: { ...LIGHTING_PRESETS.night.key, colour: 0xb8c8ff, intensity: 0.6 },
    exposureScale: 1.15,
  };

  it('reproduces the audit’s “before” numbers with the old preset: earth (5,2,5), wood (8,4,0)', () => {
    near(floor(GROUND_LOOK.colours.earth, before), [5, 2, 5]);
    near(floor(GROUND_LOOK.colours.wood, before), [8, 4, 0]);
  });

  it('gives the audit’s candidate B numbers with the shipped preset: earth (19,11,13), wood (20,12,2), leaves (9,6,1)', () => {
    const night = LIGHTING_PRESETS.night;
    near(floor(GROUND_LOOK.colours.earth, night), [19, 11, 13]);
    near(floor(GROUND_LOOK.colours.wood, night), [20, 12, 2]);
    near(floor(GROUND_LOOK.colours.leaves, night), [9, 6, 1]);
    // Earth keeps its brown: red above green above nothing blue-ish, and red strictly above blue.
    const [r, g, b] = floor(GROUND_LOOK.colours.earth, night);
    expect(r).toBeGreaterThan(b);
    expect(g).toBeLessThan(b); // the audit's (19,11,13): green is its weakest channel at this brightness
  });

  it('lights the team colours at night by the audit’s numbers: orange (83,43,0), blue (0,44,124)', () => {
    const night = LIGHTING_PRESETS.night;
    const seen = TEAM_COLORS.map((c) => floor(c, night));
    expect(seen.some((c) => Math.abs(c[0] - 83) <= 2 && Math.abs(c[1] - 43) <= 2 && c[2] <= 2)).toBe(true);
    expect(seen.some((c) => c[0] <= 2 && Math.abs(c[1] - 44) <= 2 && Math.abs(c[2] - 124) <= 2)).toBe(true);
  });

  it('is tied to the installed Three: its Neutral tone mapper has the constants both ports use (a Three upgrade must re-check)', () => {
    const src = THREE.ShaderChunk.tonemapping_pars_fragment;
    const neutralSrc = src.slice(src.indexOf('vec3 NeutralToneMapping'), src.indexOf('vec3 CustomToneMapping'));
    expect(neutralSrc).toContain('StartCompression = 0.8 - 0.04');
    expect(neutralSrc).toContain('Desaturation = 0.15');
    expect(neutralSrc).toContain('color *= toneMappingExposure');
    expect(neutralSrc).toContain('x < 0.08 ? x - 6.25 * x * x : 0.04');
    expect(neutralSrc).toContain('newPeak = 1. - d * d / ( peak + d - StartCompression )');
    expect(THREE.REVISION).toBe('186');
  });
});

describe('Medium follows the view under any night preset, and only then (M52 criterion 3)', () => {
  function lit(map: Parameters<typeof addLighting>[1], quality: QualitySettings, preset: LightingPreset) {
    const scene = new THREE.Scene();
    const daylight = addLighting(scene, map, quality, preset);
    const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight)!;
    return { daylight, sun, cam: sun.shadow.camera };
  }
  const width = (cam: THREE.OrthographicCamera): number => Math.max(cam.right - cam.left, cam.top - cam.bottom);
  function eye(x: number, z: number): THREE.PerspectiveCamera {
    const c = new THREE.PerspectiveCamera();
    c.rotation.order = 'YXZ';
    c.position.set(x, 1.6, z);
    return c;
  }

  /** The whole-field width of a map under a preset: Low draws no map and keeps the field fit. */
  const fieldOf = (map: Parameters<typeof addLighting>[1], preset: LightingPreset): { width: number; texel: number } => {
    const low = lit(map, QUALITY.low, preset);
    low.daylight.follow(eye(0, 0), 0);
    const out = { width: width(low.cam), texel: shadowTexel(low.cam, QUALITY.medium.shadowMapSize) };
    low.daylight.dispose();
    return out;
  };

  it('on Woodland: 10.2 cm a texel for the whole field at night, 3.9 cm on Medium’s fit', () => {
    const night = resolveLighting(WOODLAND);
    expect(fieldOf(WOODLAND, night).texel * 100).toBeGreaterThan(9.7);
    expect(fieldOf(WOODLAND, night).texel * 100).toBeLessThan(10.7);
    const medium = lit(WOODLAND, QUALITY.medium, night);
    medium.daylight.follow(eye(0, 0), 0);
    expect(shadowTexel(medium.cam, QUALITY.medium.shadowMapSize) * 100).toBeGreaterThan(3.6);
    expect(shadowTexel(medium.cam, QUALITY.medium.shadowMapSize) * 100).toBeLessThan(4.2);
    medium.daylight.dispose();
  });

  it('on Woodland’s night Medium moves its map with the view; by day (Neon Heights’ Day pick, Depot) it stays on the whole field', () => {
    // Followed or not shows in whether the map's window moves when the eye does (the whole field never moves).
    const moves = (map: Parameters<typeof addLighting>[1], preset: LightingPreset, quality: QualitySettings): boolean => {
      const m = lit(map, quality, preset);
      m.daylight.follow(eye(-9, 4), 0);
      const first = [m.cam.left, m.cam.right, m.cam.top, m.cam.bottom];
      m.daylight.follow(eye(11, -5), 0);
      const moved = [m.cam.left, m.cam.right, m.cam.top, m.cam.bottom].some((v, i) => v !== first[i]);
      m.daylight.dispose();
      return moved;
    };
    const neonNight = resolveLighting(mapUnderLighting(NEON_HEIGHTS, 'night'));
    const neonDay = resolveLighting(mapUnderLighting(NEON_HEIGHTS, 'day'));
    expect(neonNight.night).toBe(true);
    expect(neonDay.night).toBe(false);
    expect(moves(WOODLAND, resolveLighting(WOODLAND), QUALITY.medium)).toBe(true);
    expect(moves(NEON_HEIGHTS, neonDay, QUALITY.medium)).toBe(false);
    expect(moves(DEPOT, LIGHTING_PRESETS.day, QUALITY.medium)).toBe(false);
    // Low never moves a map (it draws none), by night either.
    expect(moves(WOODLAND, resolveLighting(WOODLAND), QUALITY.low)).toBe(false);
  });

  it('on the small maps (Neon Heights’ Night pick, Depot under the moon) Medium keeps the whole field: its texel is already finer than the view square’s', () => {
    // The view fit is a fixed square kept inside the level; a level no wider than it would only lose texels (M52).
    const square = (2 * (LIGHTING.shadowView.radius + LIGHTING.shadowMargin)) / QUALITY.medium.shadowMapSize;
    const neonNight = resolveLighting(mapUnderLighting(NEON_HEIGHTS, 'night'));
    for (const [map, preset] of [[NEON_HEIGHTS, neonNight], [DEPOT, LIGHTING_PRESETS.night]] as const) {
      const field = fieldOf(map, preset);
      const m = lit(map, QUALITY.medium, preset);
      m.daylight.follow(eye(-9, 4), 0);
      expect(width(m.cam), map.name).toBeCloseTo(field.width, 6);
      expect(shadowTexel(m.cam, QUALITY.medium.shadowMapSize), map.name).toBeLessThan(square);
      m.daylight.dispose();
    }
  });

  it('High at night follows exactly as High by day does: the same disc, so the same texel', () => {
    const night = lit(DEPOT, QUALITY.high, LIGHTING_PRESETS.night);
    const day = lit(DEPOT, QUALITY.high, LIGHTING_PRESETS.day);
    night.daylight.follow(eye(2, 3), 0);
    day.daylight.follow(eye(2, 3), 0);
    expect(shadowTexel(night.cam, 2048)).toBeLessThan(0.025);
    expect(shadowTexel(day.cam, 2048)).toBeLessThan(0.025);
    night.daylight.dispose();
    day.daylight.dispose();
  });

  it('is decided again on every setQuality: Low → Medium starts following, Medium → Low returns to the whole field and no map', () => {
    const night = resolveLighting(WOODLAND);
    const { daylight, sun, cam } = lit(WOODLAND, QUALITY.low, night);
    const whole = width(cam);
    daylight.follow(eye(0, 0), 0);
    expect(width(cam)).toBe(whole);
    expect(sun.castShadow).toBe(false);

    daylight.setQuality(QUALITY.medium);
    expect(sun.castShadow).toBe(true);
    daylight.follow(eye(0, 0), 0);
    expect(width(cam)).toBeLessThan(whole / 2);
    expect(sun.shadow.normalBias).toBeCloseTo(LIGHTING.shadowNormalBiasTexels * shadowTexel(cam, QUALITY.medium.shadowMapSize), 9);

    daylight.setQuality(QUALITY.low);
    expect(sun.castShadow).toBe(false);
    expect(width(cam)).toBe(whole);
    daylight.follow(eye(7, 7), 0);
    expect(width(cam)).toBe(whole);
    daylight.dispose();
  });

  it('needs shadows on: a night preset with shadows off draws no map, whatever “Shadow range” says; with shadows on, “Whole field” is overridden', () => {
    const night = resolveLighting(WOODLAND);
    const off = lit(WOODLAND, { ...QUALITY.medium, shadows: false, shadowFollowsView: true }, night);
    const whole = width(off.cam);
    off.daylight.follow(eye(0, 0), 0);
    expect(off.sun.castShadow).toBe(false);
    expect(width(off.cam)).toBe(whole);
    off.daylight.dispose();

    const on = lit(WOODLAND, { ...QUALITY.medium, shadows: true, shadowFollowsView: false }, night);
    on.daylight.follow(eye(0, 0), 0);
    expect(width(on.cam)).toBeLessThan(whole / 2);
    on.daylight.dispose();
  });

  it('tells the player in the “Shadow range” help that it is always near you at night', () => {
    const row = GRAPHICS_ROWS.find((r) => r.field === 'shadowFollowsView')!;
    expect(row.help).toMatch(/night/i);
    expect(row.help).toMatch(/near you/i);
  });
});

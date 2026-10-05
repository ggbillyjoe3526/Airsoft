import { describe, expect, it } from 'vitest';
import { FIGURE } from '../config/characters';
import { GROUND_LOOK, LIGHTING_PRESETS, type LightingPreset, SIGNS, TERRAIN_LOOK, TONE_MAPPING } from '../config/render';
import { TEAM_COLORS } from '../config/teams';

/**
 * Tone-mapping swatches without WebGL (M52, audit REN-02; KNOWN_ISSUES row 34): a surface's colour on screen under a
 * lighting preset, worked out the way Three.js r186's shaders do it. A Lambert face (albedo × irradiance / π) under the
 * preset's hemisphere fill (ground to sky by the face's tilt) and its key light (× the cosine to it), then
 * NeutralToneMapping (Khronos PBR Neutral, its exposure inside) and the sRGB encoding to 8 bits. The environment map's
 * share is left out: it only adds light, so these are the darkest a face can read. Textures and bump are left out too.
 */
type Rgb = [number, number, number];

/** An sRGB hex colour in linear light (Three's ColorManagement on a `setHex`). */
function linear(hex: number): Rgb {
  return [16, 8, 0].map((s) => {
    const c = ((hex >> s) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
}

/** A linear colour as the 8-bit sRGB the canvas shows. */
function srgb8(c: Rgb): Rgb {
  return c.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
  }) as Rgb;
}

/** Three r186 `NeutralToneMapping`, ported line by line (tonemapping_pars_fragment). */
function neutral(colour: Rgb, exposure: number): Rgb {
  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;
  let c = colour.map((v) => v * exposure) as Rgb;
  const x = Math.min(...c);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c = c.map((v) => v - offset) as Rgb;
  const peak = Math.max(...c);
  if (peak < startCompression) return c;
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  c = c.map((v) => (v * newPeak) / peak) as Rgb;
  const g = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return c.map((v) => v * (1 - g) + newPeak * g) as Rgb;
}

/** How high the preset's key light stands: the sine of its height above the horizon. */
function keySine(preset: LightingPreset): number {
  const o = preset.key.offset;
  return o.y / Math.hypot(o.x, o.y, o.z);
}

/**
 * A Lambert face of `albedo` on screen under `preset`: `up` is its normal's height (1 a floor, 0 a wall, -1 a ceiling),
 * `toKey` the cosine between its normal and the key light (negative: turned away).
 */
function swatch(albedo: number, preset: LightingPreset, up: number, toKey: number): Rgb {
  const a = linear(albedo);
  const sky = linear(preset.hemi.sky);
  const ground = linear(preset.hemi.ground);
  const key = linear(preset.key.colour);
  const w = 0.5 * up + 0.5;
  const out = a.map((v, i) => {
    const hemi = (ground[i]! * (1 - w) + sky[i]! * w) * preset.hemi.intensity;
    const direct = key[i]! * preset.key.intensity * Math.max(0, toKey);
    return (v * (hemi + direct)) / Math.PI;
  }) as Rgb;
  return srgb8(neutral(out, TONE_MAPPING.exposure.neutral * preset.exposureScale));
}

/** An unlit, self-lit colour (a neon sign by night, render/mapSigns.ts) on screen under `preset`. */
function glow(colour: number, strength: number, preset: LightingPreset): Rgb {
  return srgb8(neutral(linear(colour).map((v) => v * strength) as Rgb, TONE_MAPPING.exposure.neutral * preset.exposureScale));
}

/** The channels from strongest to weakest, ties kept in order: a colour's hue, coarsely. */
const order = (c: Rgb): number[] => [0, 1, 2].sort((i, j) => c[j]! - c[i]!);

describe('night swatches: moonlit ground reads, browns stay brown (M52, audit REN-02, KNOWN_ISSUES rows 167 and 34)', () => {
  const night = LIGHTING_PRESETS.night;
  const up = (albedo: number): Rgb => swatch(albedo, night, 1, keySine(night));

  it('lights earth, wood and leaf litter on the ground above black (before M52: earth (5,2,5), wood (8,4,0))', () => {
    // The strongest channel's floor for each ground surface: earth and the cabin's boards dim but readable, the
    // darker leaf litter a little under them.
    const floors = { earth: 12, wood: 12, leaves: 8, gravel: 12 } as const;
    for (const [surface, floor] of Object.entries(floors)) {
      const c = up(GROUND_LOOK.colours[surface as keyof typeof floors]);
      expect(Math.max(...c), `${surface} ${c.join(',')}`).toBeGreaterThanOrEqual(floor);
    }
    expect(Math.max(...up(TERRAIN_LOOK.low)), 'grass').toBeGreaterThanOrEqual(12);
  });

  it('keeps earth and wood brown: more red than blue (the blue moon used to strip it to grey-violet)', () => {
    for (const surface of ['earth', 'wood', 'leaves'] as const) {
      const [r, , b] = up(GROUND_LOOK.colours[surface]);
      expect(r, surface).toBeGreaterThan(b);
    }
  });

  it('lights every figure’s face above its dark kit (before M52: 17 to 25 in its strongest channel)', () => {
    for (const look of FIGURE.looks) {
      const c = up(look.skin);
      expect(Math.max(...c), `skin ${look.skin.toString(16)} ${c.join(',')}`).toBeGreaterThanOrEqual(30);
    }
  });

  it('leaves the neon signs as they glowed: bright, still their own colour, not blown to white', () => {
    const before = 1.15; // the night preset's exposure before M52
    for (const colour of [0xff3fa0, 0x3fd7ff, 0xffd23f, 0xffffff]) {
      const now = glow(colour, SIGNS.neon, night);
      const then = srgb8(neutral(linear(colour).map((v) => v * SIGNS.neon) as Rgb, before));
      expect(Math.max(...now), colour.toString(16)).toBeGreaterThanOrEqual(240);
      expect(order(now), colour.toString(16)).toEqual(order(then));
      for (let i = 0; i < 3; i++) expect(Math.abs(now[i]! - then[i]!), `${colour.toString(16)} channel ${i}`).toBeLessThanOrEqual(12);
    }
  });
});

describe('the team colours keep their hue through Neutral tone mapping (KNOWN_ISSUES row 34, audit F2)', () => {
  for (const id of ['day', 'night'] as const) {
    it(`by ${id === 'day' ? 'day' : 'night'}: on a floor, a wall facing the key and a wall turned away`, () => {
      const preset = LIGHTING_PRESETS[id];
      for (const colour of TEAM_COLORS) {
        const want = order(linear(colour));
        for (const [upness, toKey, face] of [[1, keySine(preset), 'floor'], [0, Math.sqrt(1 - keySine(preset) ** 2), 'wall to the key'], [0, 0, 'wall away']] as const) {
          const c = swatch(colour, preset, upness, toKey);
          expect(order(c).slice(0, 2), `${colour.toString(16)} ${face} ${c.join(',')}`).toEqual(want.slice(0, 2));
        }
      }
    });
  }
});

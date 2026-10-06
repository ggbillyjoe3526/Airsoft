import { describe, expect, it } from 'vitest';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from './replicas';
import { botScheme, CYBER_COLOURS, DEFAULT_SCHEMES, defaultScheme, FAMILIES, hasFixedColours, isSchemeId, SCHEME_IDS, SCHEMES, schemeColours } from './schemes';

describe('Replica colour schemes (G1)', () => {
  it('has the eight bold schemes William approved, in Customise order, each mapped to its plain family', () => {
    expect(SCHEME_IDS).toEqual(['cobalt', 'signal', 'acid', 'teal', 'hazard', 'coral', 'onyx', 'ghost']);
    expect(Object.fromEntries(SCHEME_IDS.map((id) => [id, SCHEMES[id].family]))).toEqual({
      cobalt: 'black',
      onyx: 'black',
      signal: 'tan',
      hazard: 'tan',
      coral: 'tan',
      acid: 'ranger',
      teal: 'ranger',
      ghost: 'grey',
    });
  });

  it('gives each scheme a distinct look and keeps every family plain (no bold colour in it)', () => {
    const looks = new Set(SCHEME_IDS.map((id) => `${SCHEMES[id].body}/${SCHEMES[id].furniture}`));
    expect(looks.size).toBe(SCHEME_IDS.length);
    const saturation = (hex: number): number => {
      const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
      return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    };
    for (const family of Object.values(FAMILIES)) {
      for (const part of [family.body, family.furniture, family.detail, family.accent, family.steel]) expect(saturation(part)).toBeLessThan(0.35);
      expect(FAMILIES[family.family]).toBe(family);
    }
  });

  it('swaps a scheme for its family only under Realistic colours', () => {
    expect(schemeColours('signal', false)).toBe(SCHEMES.signal);
    expect(schemeColours('signal', true)).toBe(FAMILIES.tan);
    expect(schemeColours('ghost', true).name).toBe('Wolf grey');
  });

  it('starts the player with a Cobalt rifle and a Ghost pistol, and dresses bots in their team colours', () => {
    expect(DEFAULT_SCHEMES).toEqual({ rifle: 'cobalt', pistol: 'ghost' });
    expect([defaultScheme(AEG), defaultScheme(GAS_PISTOL)]).toEqual(['cobalt', 'ghost']);
    expect([botScheme(AEG, 0), botScheme(GAS_PISTOL, 0)]).toEqual(['cobalt', 'onyx']);
    expect([botScheme(AEG, 1), botScheme(GAS_PISTOL, 1)]).toEqual(['signal', 'coral']);
  });

  it('leaves the Cyber Pistol in its own colours, plain and unlit under Realistic colours', () => {
    expect(hasFixedColours(CYBER_PISTOL)).toBe(true);
    expect(hasFixedColours(AEG) || hasFixedColours(GAS_PISTOL)).toBe(false);
    expect(CYBER_COLOURS.bold.glow).toBe(true);
    expect(CYBER_COLOURS.realistic.glow).toBe(false);
  });

  it('accepts only the eight scheme ids from a save', () => {
    for (const id of SCHEME_IDS) expect(isSchemeId(id)).toBe(true);
    for (const raw of ['black', 'Cobalt', '', 3, null, undefined]) expect(isSchemeId(raw)).toBe(false);
  });
});

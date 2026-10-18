import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CYBER_COLOURS, SCHEMES } from '../config/schemes';
import { createMaterials, flatColour, paintedMaterials } from '../render/replicas/replicaBuilder';
import { schemeNamesIn } from './report/playImports';
import { mapPalette } from './skinMaps';

/** CT4 QA: edges the skin checks' own tests leave open. */

describe('schemeNamesIn edges', () => {
  it('reads a multi-line import with aliases, a mixed type clause and a double-quoted path', () => {
    const src = 'import {\n  type Scheme,\n  SCHEMES as S,\n  botScheme as b,\n  isSchemeId,\n} from "../config/schemes";';
    expect(schemeNamesIn(src)).toEqual(['SCHEMES', 'botScheme', 'isSchemeId']);
  });
  it('reads several imports and ignores other modules, comments and a lookalike path', () => {
    const src = "import { a } from './schemes';\nimport { b } from './myschemes';\n// import { c } from './schemes';\nimport { d } from '../config/schemes';";
    expect(schemeNamesIn(src)).toEqual(['a', 'd']);
  });
  it('finds nothing in a file with no import from schemes', () => {
    expect(schemeNamesIn("import * as s from './schemes';\nexport * from './schemes';")).toEqual([]);
  });
});

describe('mapPalette edges', () => {
  it('is empty for no buckets, and for buckets all under the minimum share', () => {
    expect(mapPalette([], 0.05)).toEqual([]);
    expect(mapPalette([{ colour: 0x808080, share: 0.01 }, { colour: 0x2f6fd6, share: 0.02 }], 0.05)).toEqual([]);
  });
  it('lets small buckets add up past the minimum, and lists the largest colour first without changing its input', () => {
    const input = [{ colour: 0x2f6fd6, share: 0.04 }, { colour: 0x808080, share: 0.5 }, { colour: 0x2f70d6, share: 0.04 }];
    const copy = JSON.parse(JSON.stringify(input));
    const p = mapPalette(input, 0.05);
    expect(p.map((c) => c.colour)).toEqual([0x808080, 0x2f6fd6]);
    expect(p[1]!.share).toBeCloseTo(0.08);
    expect(input).toEqual(copy);
  });
  it('keeps two colours that are far apart as two', () => {
    expect(mapPalette([{ colour: 0xff0000, share: 0.5 }, { colour: 0x0000ff, share: 0.5 }], 0.05)).toHaveLength(2);
  });
});

describe('replicaBuilder: material names and flat colour', () => {
  const colours = { ...SCHEMES.signal, glow: false };
  for (const level of ['low', 'high'] as const) {
    it(`names every material after its key and gives back a scheme's own colour at ${level}`, () => {
      const detail = { replica: level, hands: level } as const;
      const base = createMaterials(0x3366cc, detail, null, colours, CYBER_COLOURS.bold);
      for (const [key, mat] of Object.entries(base)) expect(mat.name, key).toBe(key);
      const painted = paintedMaterials(base, detail, colours, CYBER_COLOURS.bold);
      for (const [key, mat] of Object.entries(painted)) expect(mat.name, key).toBe(key);
      const flat = (k: string): number => flatColour(painted[k as keyof typeof painted] as THREE.MeshStandardMaterial);
      expect(flat('polymer')).toBe(colours.body);
      expect(flat('furniture')).toBe(colours.furniture);
      expect(flat('detail')).toBe(colours.detail);
      expect(flat('metal')).toBe(colours.steel);
      expect(flat('accent')).toBe(colours.accent);
    });
  }
});

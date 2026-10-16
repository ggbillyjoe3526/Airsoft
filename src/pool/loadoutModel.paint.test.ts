import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAMILIES, FAMILY_IDS, isFamilyId, paintColours, paintName, SCHEMES } from '../config/schemes';
import { GAME_POOL } from './gamePool';
import { LoadoutModel } from './loadoutModel';
import { MemoryStorage } from './testStorage';

/** MR1 QA: a replica's paint is a bold scheme or a plain family (Customise's Realistic group), saved, played and exported as picked. */
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));

const rifle = GAME_POOL.assets.find((a) => a.name === 'AEG Rifle')!.id;
const model = (): LoadoutModel => new LoadoutModel(GAME_POOL, { owns: () => true });

describe('paintColours and paintName (MR1)', () => {
  it('draws a family as it is, even under Realistic colours, and names it', () => {
    for (const id of FAMILY_IDS) {
      expect(isFamilyId(id)).toBe(true);
      expect(paintColours(id, false)).toBe(FAMILIES[id]);
      expect(paintColours(id, true)).toBe(FAMILIES[id]);
      expect(paintName(id, true)).toBe(FAMILIES[id].name);
    }
    expect(isFamilyId('cobalt')).toBe(false);
    expect(isFamilyId(7)).toBe(false);
  });

  it('draws a bold scheme as itself, or as its family under Realistic colours', () => {
    expect(paintName('cobalt', false)).toBe('Cobalt');
    expect(paintColours('cobalt', false)).toBe(SCHEMES.cobalt);
    expect(paintName('cobalt', true)).toBe(FAMILIES.black.name);
    expect(paintColours('signal', true)).toBe(FAMILIES.tan);
  });
});

describe('a plain family as a replica paint (MR1)', () => {
  it('saves a family, reads it back on a new model and plays it in the kit', () => {
    const a = model();
    expect(a.scheme(rifle)).toBe('cobalt');
    a.setScheme(rifle, 'ranger');
    expect(a.scheme(rifle)).toBe('ranger');
    expect(model().scheme(rifle)).toBe('ranger');
    expect(a.kit().schemes[0]).toBe('ranger');
  });

  it('falls back to the default for a saved id that is neither a scheme nor a family', () => {
    const m = model();
    (m as unknown as { setScheme(id: string, s: string): void }).setScheme(rifle, 'mauve');
    expect(m.scheme(rifle)).toBe('cobalt');
    expect(m.picks()[`scheme.${rifle}`]).toBe('cobalt');
  });

  it('exports a family pick and imports it on a fresh model', () => {
    const a = model();
    a.setScheme(rifle, 'tan');
    const picks = a.picks();
    expect(picks[`scheme.${rifle}`]).toBe('tan');
    localStorage.clear();
    const b = model();
    expect(b.scheme(rifle)).toBe('cobalt');
    b.usePicks(picks);
    expect(b.scheme(rifle)).toBe('tan');
  });

  it('imports a scheme id too, and ignores an unknown one or a number', () => {
    const b = model();
    b.usePicks({ [`scheme.${rifle}`]: 'signal' });
    expect(b.scheme(rifle)).toBe('signal');
    b.usePicks({ [`scheme.${rifle}`]: 'mauve' });
    b.usePicks({ [`scheme.${rifle}`]: 3 });
    expect(b.scheme(rifle)).toBe('signal');
  });
});

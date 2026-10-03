import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIC, OPTIC_CHOICES, opticOf } from '../config/optics';
import { AEG, BB_WEIGHT, BB_WEIGHT_CHOICES, GAS_PISTOL, HOP_UP, LOADOUT, LOADOUT_SLOTS, muzzleEnergy, muzzleVelocity } from '../config/replicas';
import { bbWeightField, bbWeightReadout, hopUpField, hopUpLabel, hopUpReadout, loadBbWeight, loadHopUp, loadoutSummary, loadSlotPick, slotField } from './loadoutChoice';

describe('optic choice', () => {
  it('is off by default (iron sights) and offers the red dot', () => {
    expect(DEFAULT_OPTIC).toBe('none');
    expect(opticOf('none')).toBeNull();
    expect(OPTIC_CHOICES.map((o) => o.id)).toEqual(['none', 'redDot']);
    expect(opticOf('redDot')).toBe('redDot');
  });
});

describe('loadout choice', () => {
  it('sums up the optic, BB weights and hop-up dials for the New game screen', () => {
    expect(loadoutSummary(LOADOUT, 'none', [0.65, 0.55], [0.25, 0.2])).toBe('Iron sights · 0.25 g / 0.20 g BBs · hop-up 65% / 55%');
    expect(loadoutSummary(LOADOUT, 'redDot', [1, 0], [0.28, 0.25])).toBe('Red dot · 0.28 g / 0.25 g BBs · hop-up 100% / 0%');
    // No replica with a rail: no optic to mention. A missing dial or weight shows the factory setting.
    expect(loadoutSummary([GAS_PISTOL], 'redDot', [], [])).toBe(`0.20 g BBs · hop-up ${hopUpLabel(GAS_PISTOL.hopUpDial)}`);
  });

  it('has a primary and a secondary slot, each starting on its first replica (nothing saved in the tests)', () => {
    expect(LOADOUT_SLOTS.map((s) => s.id)).toEqual(['primary', 'secondary']);
    expect(LOADOUT_SLOTS.map(loadSlotPick)).toEqual([...LOADOUT]);
    expect(slotField(LOADOUT_SLOTS[0]!)).toBe('slot.primary');
    expect(LOADOUT_SLOTS.every((s) => s.fits.length > 0)).toBe(true);
  });
});

describe('hop-up choice', () => {
  it('starts each replica at its factory dial and saves it per replica', () => {
    // No browser storage in the tests: nothing saved, so the factory settings.
    expect(LOADOUT.map(loadHopUp)).toEqual(LOADOUT.map((r) => r.hopUpDial));
    expect(hopUpField(AEG)).toBe('hopUp.aeg');
    expect(hopUpField(GAS_PISTOL)).not.toBe(hopUpField(AEG));
    expect(hopUpLabel(0.65)).toBe('65%');
  });

  it("says how far the factory rifle setting reaches: Depot's longest sightlines (~34 m)", () => {
    const text = hopUpReadout(AEG, AEG.hopUpDial);
    expect(text).toMatch(/^On target to about \d+ m, then the BB drops \(factory setting\)\.$/);
    const metres = Number(/about (\d+) m/.exec(text)![1]);
    expect(metres).toBeGreaterThanOrEqual(34);
    expect(metres).toBeLessThan(42);
  });

  it('warns when the hop is turned too far up: the BB rises and floats', () => {
    expect(hopUpReadout(AEG, HOP_UP.maxDial)).toMatch(/^Too much: the BB rises \d+ cm over your aim and floats\./);
    expect(hopUpReadout(AEG, 0)).toMatch(/^On target to about \d+ m, then the BB drops\.$/);
  });
});

describe('BB weight choice', () => {
  it('offers the weights sites sell, each replica starting on its own (AEG 0.25 g, pistol 0.20 g)', () => {
    expect(BB_WEIGHT_CHOICES.map((c) => Number(c.id))).toEqual([...BB_WEIGHT.choices]);
    expect(LOADOUT.map(loadBbWeight)).toEqual([0.25, 0.2]);
    expect(bbWeightField(AEG)).toBe('bbWeight.aeg');
  });

  it('keeps the rated energy at the factory weight, and a heavier BB leaves slower with a little more energy', () => {
    expect(muzzleEnergy(AEG)).toBe(AEG.muzzleEnergy);
    expect(muzzleVelocity(AEG)).toBeCloseTo(88, 0);
    for (let i = 1; i < BB_WEIGHT.choices.length; i++) {
      const lighter = BB_WEIGHT.choices[i - 1]!;
      const heavier = BB_WEIGHT.choices[i]!;
      expect(muzzleVelocity(AEG, heavier)).toBeLessThan(muzzleVelocity(AEG, lighter));
      expect(muzzleEnergy(AEG, heavier)).toBeGreaterThan(muzzleEnergy(AEG, lighter));
    }
    // A few per cent, as at a chrono: never a big jump.
    expect(muzzleEnergy(AEG, 0.28) / muzzleEnergy(AEG, 0.2)).toBeLessThan(1.1);
  });

  it('says both sides of the weight: how fast the BB gets there, and how far it carries with the hop set for it', () => {
    expect(bbWeightReadout(AEG, 0.25)).toMatch(
      new RegExp(`^Leaves the barrel at 88 m/s \\(${AEG.muzzleEnergy.toFixed(2)} J\\) and reaches 20 m in 0\\.\\d\\d s \\(as it comes\\)\\. Longest reach at about 65% hop-up: on target to about 3\\d m\\.$`),
    );
    expect(bbWeightReadout(AEG, 0.28)).toMatch(/^Leaves the barrel at \d+ m\/s \(\d\.\d\d J\) and reaches 20 m in 0\.\d\d s\. Longest reach at about \d+% hop-up: on target to about \d+ m\.$/);
  });

  it('calls the dial the factory setting only with the factory BB', () => {
    expect(hopUpReadout(AEG, AEG.hopUpDial, AEG.bbWeight)).toMatch(/\(factory setting\)\.$/);
    expect(hopUpReadout(AEG, AEG.hopUpDial, 0.28)).not.toMatch(/factory/);
  });

  it('changes how far the same hop-up keeps the BB on target: a light BB rises more on the factory dial', () => {
    expect(hopUpReadout(AEG, AEG.hopUpDial, 0.2)).toMatch(/^Too much/);
    expect(hopUpReadout(AEG, AEG.hopUpDial, 0.28)).not.toBe(hopUpReadout(AEG, AEG.hopUpDial, 0.25));
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIC, OPTIC_CHOICES, opticOf } from '../config/optics';
import { AEG, GAS_PISTOL, HOP_UP, LOADOUT } from '../config/replicas';
import { hopUpField, hopUpLabel, hopUpReadout, loadHopUps, loadoutSummary, loadoutTakesEffect, opticNote } from './loadoutChoice';

describe('optic choice', () => {
  it('is off by default (iron sights) and offers the red dot', () => {
    expect(DEFAULT_OPTIC).toBe('none');
    expect(opticOf('none')).toBeNull();
    expect(OPTIC_CHOICES.map((o) => o.id)).toEqual(['none', 'redDot']);
    expect(opticOf('redDot')).toBe('redDot');
  });

  it('notes a change only while it waits for the next round', () => {
    expect(opticNote('redDot', 'none', false)).toBe('Fitted from the next round.');
    expect(opticNote('none', 'none', false)).toBe('');
    expect(opticNote('redDot', 'none', true)).toBe('');
  });
});

describe('loadout choice', () => {
  it('sums up the optic and the hop-up dials for the New game screen', () => {
    expect(loadoutSummary(LOADOUT, 'none', [0.65, 0.55])).toBe('Iron sights · hop-up 65% / 55%');
    expect(loadoutSummary(LOADOUT, 'redDot', [1, 0])).toBe('Red dot · hop-up 100% / 0%');
    // No replica with a rail: no optic to mention. A missing dial shows the factory setting.
    expect(loadoutSummary([GAS_PISTOL], 'redDot', [])).toBe(`hop-up ${hopUpLabel(GAS_PISTOL.hopUpDial)}`);
  });

  it('is fitted at once before the first match and on the result screen, else from the next round', () => {
    expect(loadoutTakesEffect(false, false)).toBe('now');
    expect(loadoutTakesEffect(true, true)).toBe('now');
    expect(loadoutTakesEffect(true, false)).toBe('nextRound');
  });
});

describe('hop-up choice', () => {
  it('starts each replica at its factory dial and saves it per replica', () => {
    // No browser storage in the tests: nothing saved, so the factory settings.
    expect(loadHopUps(LOADOUT)).toEqual(LOADOUT.map((r) => r.hopUpDial));
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

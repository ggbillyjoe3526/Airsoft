import { describe, expect, it } from 'vitest';
import { HUD } from '../config/render';
import { AEG, GAS_PISTOL } from '../config/replicas';
import { emptyMagHint, isLowAmmo } from './ammoStatus';

describe('low ammo', () => {
  it('is at most the configured fraction of a full magazine, rounded up', () => {
    const edge = Math.ceil(AEG.magSize * HUD.lowAmmoFraction);
    expect(isLowAmmo(edge, AEG.magSize)).toBe(true);
    expect(isLowAmmo(edge + 1, AEG.magSize)).toBe(false);
    expect(isLowAmmo(0, AEG.magSize)).toBe(true);
    expect(isLowAmmo(AEG.magSize, AEG.magSize)).toBe(false);
  });

  it('depends on the replica: the same count can be low for one and fine for the other', () => {
    // A count between the pistol's threshold and the AEG's (the HUD must recheck it on a switch).
    const count = Math.ceil(GAS_PISTOL.magSize * HUD.lowAmmoFraction) + 1;
    expect(count).toBeLessThanOrEqual(Math.ceil(AEG.magSize * HUD.lowAmmoFraction));
    expect(isLowAmmo(count, AEG.magSize)).toBe(true);
    expect(isLowAmmo(count, GAS_PISTOL.magSize)).toBe(false);
  });
});

describe('empty magazine hint', () => {
  it('names the reload key the player has bound', () => {
    expect(emptyMagHint('R')).toBe('Empty: pull the trigger or press R to reload');
    expect(emptyMagHint('X')).toContain('press X to reload');
  });

  it('names no key when reload is unbound', () => {
    expect(emptyMagHint('')).toBe('Empty: pull the trigger to reload');
  });
});

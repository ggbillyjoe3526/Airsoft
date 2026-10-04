import { describe, expect, it } from 'vitest';
import { NO_TUNE } from '../config/attachments';
import { LASERS } from '../config/lasers';
import { AEG, GAS_PISTOL } from '../config/replicas';
import type { ItemRef } from './collection';
import { GAME_POOL } from './gamePool';
import { bonusOf, EMPTY_FIT, kitReplica, kitSlot, partTune, type ReplicaFit } from './kit';

const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string, tier = 'common'): ItemRef => ({ asset: id(name), tier });
const fit = (parts: Partial<ReplicaFit>): ReplicaFit => ({ ...EMPTY_FIT, ...parts });
const STARTER_AEG = fit({ power: item('Standard Battery') });
const STARTER_PISTOL = fit({ power: item('Green Gas') });

describe('kit (M26b)', () => {
  it('leaves a Common replica on its starter power source exactly as it comes, under its pool name', () => {
    const r = kitReplica(pool, item('AEG Rifle'), STARTER_AEG);
    expect({ ...r, name: AEG.name }).toEqual(AEG);
    expect(r.name).toBe('AEG Rifle');
    const slot = kitSlot(pool, item('Gas Pistol'), STARTER_PISTOL);
    expect(slot.optic).toBeNull();
    expect(slot.parts).toEqual({ grip: 'none', magazine: GAS_PISTOL.magazines[0], laser: null, tune: NO_TUNE });
  });

  it("gives a rarer replica its tier's Bonus % off spread, reload and draw, and nothing more", () => {
    const r = kitReplica(pool, item('AEG Rifle', 'legendary'), STARTER_AEG);
    expect(bonusOf(pool, item('AEG Rifle', 'legendary'))).toBeCloseTo(0.15);
    expect(r.spreadDeg).toBeCloseTo(AEG.spreadDeg * 0.85);
    expect(r.reloadTime).toBeCloseTo(AEG.reloadTime * 0.85);
    expect(r.drawTime).toBeCloseTo(AEG.drawTime * 0.85);
    expect(r.muzzleEnergy).toBe(AEG.muzzleEnergy);
    expect(r.fireRate).toBe(AEG.fireRate);
  });

  it('makes a stronger gas shoot harder at the same rate, and a rarer battery raise the rate of fire too', () => {
    const black = kitReplica(pool, item('Gas Pistol'), fit({ power: item('Black Gas') }));
    expect(black.muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.2);
    expect(black.fireRate).toBe(GAS_PISTOL.fireRate);
    // A power source takes half its tier's bonus: 7.5% at Legendary.
    const battery = kitReplica(pool, item('AEG Rifle'), fit({ power: item('Standard Battery', 'legendary') }));
    expect(battery.muzzleEnergy).toBeCloseTo(AEG.muzzleEnergy * 1.075);
    expect(battery.fireRate).toBeCloseTo(AEG.fireRate * 1.075);
  });

  it("tightens the pistol's spread with the laser, more with a rarer one", () => {
    const laser = kitReplica(pool, item('Gas Pistol'), fit({ power: item('Green Gas'), laser: item('Red Laser') }));
    expect(laser.spreadDeg).toBeCloseTo(GAS_PISTOL.spreadDeg * LASERS.redLaser.spreadScale);
    const rare = kitReplica(pool, item('Gas Pistol'), fit({ power: item('Green Gas'), laser: item('Red Laser', 'legendary') }));
    expect(rare.spreadDeg).toBeCloseTo(GAS_PISTOL.spreadDeg * LASERS.redLaser.spreadScale * 0.925);
    expect(kitSlot(pool, item('Gas Pistol'), fit({ laser: item('Red Laser') })).parts.laser).toBe('redLaser');
  });

  it("turns a rarer optic, grip and magazine into handling: quicker raise, steadier grip, quicker reload", () => {
    expect(partTune(pool, fit({ optic: item('Red Dot'), grip: item('Vertical Grip'), magazine: item('Hi-Cap Magazine') }))).toBe(NO_TUNE);
    const tune = partTune(pool, fit({ optic: item('Red Dot', 'epic'), grip: item('Vertical Grip', 'legendary'), magazine: item('Hi-Cap Magazine', 'rare') }));
    expect(tune.raiseScale).toBeCloseTo(0.88 * 0.925);
    expect(tune.shakeScale).toBeCloseTo(0.925);
    expect(tune.drawScale).toBeCloseTo(0.925);
    expect(tune.reloadScale).toBeCloseTo(0.94);
    const slot = kitSlot(pool, item('AEG Rifle'), fit({ power: item('Standard Battery'), optic: item('2x Scope'), grip: item('Angled Grip'), magazine: item('Low-Cap Magazine') }));
    expect([slot.optic, slot.parts.grip, slot.parts.magazine]).toEqual(['scope2x', 'angled', 'lowCap']);
  });

  it('ignores an item put in the wrong slot (a gas in the optic slot): as it comes', () => {
    const slot = kitSlot(pool, item('AEG Rifle'), fit({ optic: item('Green Gas'), power: item('Red Dot') }));
    expect(slot.optic).toBeNull();
    expect(slot.replica.muzzleEnergy).toBe(AEG.muzzleEnergy);
  });
});

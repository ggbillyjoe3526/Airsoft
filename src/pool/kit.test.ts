import { describe, expect, it } from 'vitest';
import { NO_TUNE } from '../config/attachments';
import { LASERS } from '../config/lasers';
import { GAME_STATS } from '../config/gameStats';
import { AEG, GAS_PISTOL } from '../config/replicas';
import type { ItemRef } from './collection';
import { GAME_POOL } from './gamePool';
import { bonusOf, EMPTY_FIT, energyCapped, kitReplica, kitSlot, partTune, type ReplicaFit } from './kit';

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

  it("gives a rarer replica its tier's Bonus % off spread, reload and draw, and half of it on energy and rate of fire (M29)", () => {
    const r = kitReplica(pool, item('AEG Rifle', 'legendary'), STARTER_AEG);
    expect(bonusOf(pool, item('AEG Rifle', 'legendary'), 'spread')).toBeCloseTo(0.15);
    expect(bonusOf(pool, item('AEG Rifle', 'legendary'), 'energy')).toBeCloseTo(0.075);
    expect(r.spreadDeg).toBeCloseTo(AEG.spreadDeg * 0.85);
    expect(r.reloadTime).toBeCloseTo(AEG.reloadTime * 0.85);
    expect(r.drawTime).toBeCloseTo(AEG.drawTime * 0.85);
    expect(r.muzzleEnergy).toBeCloseTo(AEG.muzzleEnergy * 1.075);
    expect(r.fireRate).toBeCloseTo(AEG.fireRate * 1.075);
    expect(r.recoilDeg).toBe(AEG.recoilDeg);
  });

  it('makes a stronger gas shoot harder and kick harder at the same rate, and a battery set the rate of fire only (M29)', () => {
    const black = kitReplica(pool, item('Gas Pistol'), fit({ power: item('Black Gas') }));
    expect(black.muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.2);
    expect(black.recoilDeg).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.2);
    expect(black.fireRate).toBe(GAS_PISTOL.fireRate);
    // A battery's tier improves its rate of fire by half its bonus (7.5% at Legendary), never the energy.
    const battery = kitReplica(pool, item('AEG Rifle'), fit({ power: item('Standard Battery', 'legendary') }));
    expect(battery.muzzleEnergy).toBe(AEG.muzzleEnergy);
    expect(battery.fireRate).toBeCloseTo(AEG.fireRate * 1.075);
    const lipo = kitReplica(pool, item('AEG Rifle'), fit({ power: item('11.1 V LiPo Battery') }));
    expect(lipo.fireRate).toBeCloseTo(AEG.fireRate * 1.15);
    expect(lipo.muzzleEnergy).toBe(AEG.muzzleEnergy);
    // A gas's tier improves its energy: a Legendary Red Gas is 10% + 7.5%.
    const red = kitReplica(pool, item('Gas Pistol'), fit({ power: item('Red Gas', 'legendary') }));
    expect(red.muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.175);
  });

  it('stops stacked energy at the site limit, and says so (M29)', () => {
    const pistol = item('Gas Pistol', 'legendary');
    const black = fit({ power: item('Black Gas', 'legendary') });
    expect(kitReplica(pool, pistol, black).muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.075 * 1.275);
    expect(energyCapped(pool, pistol, black)).toBe(false);
    // A site that allows less: the same kit stops at its limit.
    const strict = { ...GAME_STATS, power: { ...GAME_STATS.power, [id('Black Gas')]: { energy: 1, fireRate: 0, recoil: 0 } } };
    const capped = kitReplica(pool, pistol, black, strict);
    expect(capped.muzzleEnergy).toBe(GAS_PISTOL.energyLimit);
    expect(energyCapped(pool, pistol, black, strict)).toBe(true);
  });

  it('reads the tier shares from stats.md: a share of 0 leaves the stat as it comes', () => {
    const flat = { ...GAME_STATS, tierShares: { ...GAME_STATS.tierShares, replica: { spread: 1 } } };
    const r = kitReplica(pool, item('AEG Rifle', 'legendary'), STARTER_AEG, flat);
    expect(r.spreadDeg).toBeCloseTo(AEG.spreadDeg * 0.85);
    expect(r.reloadTime).toBe(AEG.reloadTime);
    expect(r.muzzleEnergy).toBe(AEG.muzzleEnergy);
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

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

describe('kit, acceptance 4: the site limit', () => {
  const hugeGas = (energy: number) => ({ ...GAME_STATS, power: { ...GAME_STATS.power, [id('Black Gas')]: { energy, fireRate: 0, recoil: 0.2 } } });
  const BLACK_PISTOL = fit({ power: item('Black Gas', 'legendary') });

  it('never lets the pistol leave the barrel above 1.00 J through kitReplica, however big the gas', () => {
    for (const energy of [1, 5, 100]) {
      const r = kitReplica(pool, item('Gas Pistol', 'legendary'), BLACK_PISTOL, hugeGas(energy));
      expect(r.muzzleEnergy).toBe(1.0);
      expect(energyCapped(pool, item('Gas Pistol', 'legendary'), BLACK_PISTOL, hugeGas(energy))).toBe(true);
    }
    // Through kitSlot too (what the match and the Performance sheet read).
    expect(kitSlot(pool, item('Gas Pistol'), BLACK_PISTOL, hugeGas(100)).replica.muzzleEnergy).toBe(1.0);
  });

  it("stops the rifle at its own class's 1.20 J, from a battery that is given energy too", () => {
    const boosted = { ...GAME_STATS, power: { ...GAME_STATS.power, [id('Standard Battery')]: { energy: 3, fireRate: 0, recoil: 0 } } };
    const r = kitReplica(pool, item('AEG Rifle', 'legendary'), STARTER_AEG, boosted);
    expect(r.muzzleEnergy).toBe(1.2);
    expect(r.muzzleEnergy).not.toBe(1.0);
    expect(energyCapped(pool, item('AEG Rifle', 'legendary'), STARTER_AEG, boosted)).toBe(true);
  });

  it('is not capped as it comes, nor at the best of everything the pool holds, with the numbers as shipped', () => {
    expect(energyCapped(pool, item('AEG Rifle'), STARTER_AEG)).toBe(false);
    expect(energyCapped(pool, item('Gas Pistol'), STARTER_PISTOL)).toBe(false);
    expect(energyCapped(pool, item('Gas Pistol', 'legendary'), BLACK_PISTOL)).toBe(false);
    expect(energyCapped(pool, item('AEG Rifle', 'legendary'), fit({ power: item('11.1 V LiPo Battery', 'legendary') }))).toBe(false);
  });

  it('is not capped when the energy lands exactly on the limit, and is a hair past it', () => {
    // 0.52 J pistol on a gas whose Energy % brings it to exactly 1.00 J.
    const exact = hugeGas(1.0 / 0.52 - 1);
    const kit = fit({ power: item('Black Gas') });
    expect(kitReplica(pool, item('Gas Pistol'), kit, exact).muzzleEnergy).toBeCloseTo(1.0, 10);
    expect(energyCapped(pool, item('Gas Pistol'), kit, hugeGas(1.0 / 0.52 - 1 + 0.01))).toBe(true);
    expect(energyCapped(pool, item('Gas Pistol'), kit, hugeGas(1.0 / 0.52 - 1 - 0.01))).toBe(false);
  });

  it('applies the site limit as stats.md lists it for the replica (the limit is on the replica, from its class)', () => {
    expect(kitReplica(pool, item('Gas Pistol'), STARTER_PISTOL).energyLimit).toBe(GAME_STATS.siteLimits.pistol);
    expect(kitReplica(pool, item('AEG Rifle'), STARTER_AEG).energyLimit).toBe(GAME_STATS.siteLimits.rifle);
  });

  it('caps only the energy: the gas keeps its rate of fire and its extra kick when the site stops it', () => {
    const r = kitReplica(pool, item('Gas Pistol', 'legendary'), BLACK_PISTOL, hugeGas(100));
    expect(r.recoilDeg).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.2);
    expect(r.fireRate).toBeCloseTo(GAS_PISTOL.fireRate * 1.075);
  });
});

describe('kit, acceptance 3: a power source and the recoil', () => {
  const recoilOf = (name: string, tierName = 'common') => kitReplica(pool, item('Gas Pistol'), fit({ power: item(name, tierName) })).recoilDeg;

  it("follows the power source's Recoil %: Green none, Red +10 %, Black +20 %", () => {
    expect(recoilOf('Green Gas')).toBe(GAS_PISTOL.recoilDeg);
    expect(recoilOf('Red Gas')).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.1);
    expect(recoilOf('Black Gas')).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.2);
  });

  it("follows another Recoil % from the file, a negative one included, and a tier doesn't change it", () => {
    const calmer = { ...GAME_STATS, power: { ...GAME_STATS.power, [id('Black Gas')]: { energy: 0.2, fireRate: 0, recoil: -0.5 } } };
    expect(kitReplica(pool, item('Gas Pistol'), fit({ power: item('Black Gas') }), calmer).recoilDeg).toBeCloseTo(GAS_PISTOL.recoilDeg * 0.5);
    expect(recoilOf('Black Gas', 'legendary')).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.2);
    expect(kitReplica(pool, item('Gas Pistol', 'legendary'), STARTER_PISTOL).recoilDeg).toBe(GAS_PISTOL.recoilDeg);
  });

  it('keeps a battery off the energy and a gas off the rate of fire, and the LiPo off both the kick and the energy', () => {
    const lipo = kitReplica(pool, item('AEG Rifle'), fit({ power: item('11.1 V LiPo Battery') }));
    expect([lipo.recoilDeg, lipo.muzzleEnergy]).toEqual([AEG.recoilDeg, AEG.muzzleEnergy]);
    expect(lipo.fireRate).toBeCloseTo(AEG.fireRate * 1.15);
    const red = kitReplica(pool, item('Gas Pistol'), fit({ power: item('Red Gas') }));
    expect(red.fireRate).toBe(GAS_PISTOL.fireRate);
  });

  it("adds a battery's tier to its Fire rate % (a Legendary LiPo is 15 % + 7.5 %) and a replica tier on top", () => {
    const r = kitReplica(pool, item('AEG Rifle', 'legendary'), fit({ power: item('11.1 V LiPo Battery', 'legendary') }));
    expect(r.fireRate).toBeCloseTo(AEG.fireRate * 1.075 * (1 + 0.15 + 0.075));
  });

  it('reads an unpooled power source as no change (the stats file has no row for it)', () => {
    const none = { ...GAME_STATS, power: {} };
    const r = kitReplica(pool, item('Gas Pistol'), fit({ power: item('Black Gas') }), none);
    expect([r.muzzleEnergy, r.recoilDeg, r.fireRate]).toEqual([GAS_PISTOL.muzzleEnergy, GAS_PISTOL.recoilDeg, GAS_PISTOL.fireRate]);
  });
});

describe('kit, acceptance 2: what a tier improves, from the Tier scaling', () => {
  it("gives each category only the stats listed for it, at its tier's Bonus times the share", () => {
    const legendary = (name: string) => item(name, 'legendary');
    expect(bonusOf(pool, legendary('AEG Rifle'), 'reload')).toBeCloseTo(0.15);
    expect(bonusOf(pool, legendary('AEG Rifle'), 'draw')).toBeCloseTo(0.15);
    expect(bonusOf(pool, legendary('AEG Rifle'), 'fireRate')).toBeCloseTo(0.075);
    expect(bonusOf(pool, legendary('Standard Battery'), 'fireRate')).toBeCloseTo(0.075);
    expect(bonusOf(pool, legendary('Standard Battery'), 'energy')).toBe(0);
    expect(bonusOf(pool, legendary('Green Gas'), 'energy')).toBeCloseTo(0.075);
    expect(bonusOf(pool, legendary('Green Gas'), 'fireRate')).toBe(0);
    expect(bonusOf(pool, legendary('Red Dot'), 'raise')).toBeCloseTo(0.15);
    expect(bonusOf(pool, legendary('Red Dot'), 'spread')).toBe(0);
    expect(bonusOf(pool, legendary('Vertical Grip'), 'shake')).toBeCloseTo(0.075);
    expect(bonusOf(pool, legendary('Red Laser'), 'spread')).toBeCloseTo(0.075);
    expect(bonusOf(pool, legendary('Hi-Cap Magazine'), 'reload')).toBeCloseTo(0.15);
    // Nothing at Common, and nothing for an empty slot.
    expect(bonusOf(pool, item('AEG Rifle'), 'spread')).toBe(0);
    expect(bonusOf(pool, null, 'spread')).toBe(0);
  });

  it('scales across every tier the pool lists, in proportion to its Bonus', () => {
    for (const t of pool.tiers) {
      const r = kitReplica(pool, item('AEG Rifle', t.id), STARTER_AEG);
      expect(r.spreadDeg, t.id).toBeCloseTo(AEG.spreadDeg * (1 - t.bonus));
      expect(r.muzzleEnergy, t.id).toBeCloseTo(AEG.muzzleEnergy * (1 + t.bonus / 2));
      expect(r.fireRate, t.id).toBeCloseTo(AEG.fireRate * (1 + t.bonus / 2));
    }
  });

  it('keeps a Legendary pistol on its starter gas under the site limit, as shipped', () => {
    const r = kitReplica(pool, item('Gas Pistol', 'legendary'), STARTER_PISTOL);
    expect(r.muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.075);
    expect(r.muzzleEnergy).toBeLessThanOrEqual(r.energyLimit);
  });
});

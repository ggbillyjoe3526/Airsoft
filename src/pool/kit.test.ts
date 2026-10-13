import { describe, expect, it } from 'vitest';
import { BARRELS, factoryParts, handlingOf, MAGAZINES, MUZZLES } from '../config/attachments';
import { LASERS } from '../config/lasers';
import { GAME_STATS } from '../config/gameStats';
import { BALLISTICS } from '../config/ballistics';
import { AEG, CYBER_PISTOL, GAS_PISTOL, HOP_UP } from '../config/replicas';
import { bestHopUp, hopUpReach } from '../sim/hopUp';
import type { ItemRef } from './item';
import { GAME_POOL } from './gamePool';
import { EMPTY_FIT, energyCapped, kitReplica, kitSlot, type ReplicaFit } from './kit';
import { fits } from './pool';

const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string): ItemRef => ({ asset: id(name) });
const fit = (parts: Partial<ReplicaFit>): ReplicaFit => ({ ...EMPTY_FIT, ...parts });
const STARTER_AEG = fit({ power: item('Standard Battery') });
const STARTER_PISTOL = fit({ power: item('Green Gas') });

describe('kit (M26b)', () => {
  it('leaves a replica on its starter power source exactly as it comes, under its pool name', () => {
    const r = kitReplica(pool, item('AEG Rifle'), STARTER_AEG);
    expect({ ...r, name: AEG.name }).toEqual(AEG);
    expect(r.name).toBe('AEG Rifle');
    const slot = kitSlot(pool, item('GBB Pistol'), STARTER_PISTOL);
    expect(slot.optic).toBeNull();
    expect(slot.parts).toEqual({ grip: 'none', magazine: GAS_PISTOL.magazines[0], laser: null, barrel: null, muzzle: null, light: null });
  });

  it('makes a stronger gas shoot harder and kick harder at the same rate, and a battery set the rate of fire only (M29)', () => {
    const black = kitReplica(pool, item('GBB Pistol'), fit({ power: item('Black Gas') }));
    expect(black.muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.2);
    expect(black.recoilDeg).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.2);
    expect(black.fireRate).toBe(GAS_PISTOL.fireRate);
    // The standard battery is the replica as it comes; the LiPo raises the rate of fire only.
    const battery = kitReplica(pool, item('AEG Rifle'), fit({ power: item('Standard Battery') }));
    expect([battery.muzzleEnergy, battery.fireRate]).toEqual([AEG.muzzleEnergy, AEG.fireRate]);
    const lipo = kitReplica(pool, item('AEG Rifle'), fit({ power: item('11.1 V LiPo Battery') }));
    expect(lipo.fireRate).toBeCloseTo(AEG.fireRate * 1.15);
    expect(lipo.muzzleEnergy).toBe(AEG.muzzleEnergy);
    const red = kitReplica(pool, item('GBB Pistol'), fit({ power: item('Red Gas') }));
    expect(red.muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.1);
  });

  it('stops stacked energy at the site limit, and says so (M29)', () => {
    const pistol = item('GBB Pistol');
    const black = fit({ power: item('Black Gas') });
    expect(kitReplica(pool, pistol, black).muzzleEnergy).toBeCloseTo(GAS_PISTOL.muzzleEnergy * 1.2);
    expect(energyCapped(pool, pistol, black)).toBe(false);
    // A site that allows less: the same kit stops at its limit.
    const strict = { ...GAME_STATS, power: { ...GAME_STATS.power, [id('Black Gas')]: { energy: 1, fireRate: 0, recoil: 0 } } };
    const capped = kitReplica(pool, pistol, black, strict);
    expect(capped.muzzleEnergy).toBe(GAS_PISTOL.energyLimit);
    expect(energyCapped(pool, pistol, black, strict)).toBe(true);
  });

  it("tightens the pistol's spread with the laser", () => {
    const laser = kitReplica(pool, item('GBB Pistol'), fit({ power: item('Green Gas'), laser: item('Red Laser') }));
    expect(laser.spreadDeg).toBeCloseTo(GAS_PISTOL.spreadDeg * LASERS.redLaser.spreadScale);
    expect(kitSlot(pool, item('GBB Pistol'), fit({ laser: item('Red Laser') })).parts.laser).toBe('redLaser');
  });

  it('fits an optic, grip and magazine as parts, by their keys', () => {
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
  const BLACK_PISTOL = fit({ power: item('Black Gas') });

  it('never lets the pistol leave the barrel above 1.00 J through kitReplica, however big the gas', () => {
    for (const energy of [1, 5, 100]) {
      const r = kitReplica(pool, item('GBB Pistol'), BLACK_PISTOL, hugeGas(energy));
      expect(r.muzzleEnergy).toBe(1.0);
      expect(energyCapped(pool, item('GBB Pistol'), BLACK_PISTOL, hugeGas(energy))).toBe(true);
    }
    // Through kitSlot too (what the match and the Performance sheet read).
    expect(kitSlot(pool, item('GBB Pistol'), BLACK_PISTOL, hugeGas(100)).replica.muzzleEnergy).toBe(1.0);
  });

  it("stops the rifle at its own class's 1.20 J, from a battery that is given energy too", () => {
    const boosted = { ...GAME_STATS, power: { ...GAME_STATS.power, [id('Standard Battery')]: { energy: 3, fireRate: 0, recoil: 0 } } };
    const r = kitReplica(pool, item('AEG Rifle'), STARTER_AEG, boosted);
    expect(r.muzzleEnergy).toBe(1.2);
    expect(r.muzzleEnergy).not.toBe(1.0);
    expect(energyCapped(pool, item('AEG Rifle'), STARTER_AEG, boosted)).toBe(true);
  });

  it('is not capped as it comes, nor at the best of everything the pool holds, with the numbers as shipped', () => {
    expect(energyCapped(pool, item('AEG Rifle'), STARTER_AEG)).toBe(false);
    expect(energyCapped(pool, item('GBB Pistol'), STARTER_PISTOL)).toBe(false);
    expect(energyCapped(pool, item('GBB Pistol'), BLACK_PISTOL)).toBe(false);
    expect(energyCapped(pool, item('AEG Rifle'), fit({ power: item('11.1 V LiPo Battery') }))).toBe(false);
    expect(energyCapped(pool, item('AEG Rifle'), fit({ power: item('11.1 V LiPo Battery'), barrel: item('Long Barrel') }))).toBe(false);
  });

  it('is not capped when the energy lands exactly on the limit, and is a hair past it', () => {
    // 0.52 J pistol on a gas whose Energy % brings it to exactly 1.00 J.
    const exact = hugeGas(1.0 / 0.52 - 1);
    const kit = fit({ power: item('Black Gas') });
    expect(kitReplica(pool, item('GBB Pistol'), kit, exact).muzzleEnergy).toBeCloseTo(1.0, 10);
    expect(energyCapped(pool, item('GBB Pistol'), kit, hugeGas(1.0 / 0.52 - 1 + 0.01))).toBe(true);
    expect(energyCapped(pool, item('GBB Pistol'), kit, hugeGas(1.0 / 0.52 - 1 - 0.01))).toBe(false);
  });

  it('applies the site limit as stats.md lists it for the replica (the limit is on the replica, from its class)', () => {
    expect(kitReplica(pool, item('GBB Pistol'), STARTER_PISTOL).energyLimit).toBe(GAME_STATS.siteLimits.pistol);
    expect(kitReplica(pool, item('AEG Rifle'), STARTER_AEG).energyLimit).toBe(GAME_STATS.siteLimits.rifle);
  });

  it('caps only the energy: the gas keeps its rate of fire and its extra kick when the site stops it', () => {
    const r = kitReplica(pool, item('GBB Pistol'), BLACK_PISTOL, hugeGas(100));
    expect(r.recoilDeg).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.2);
    expect(r.fireRate).toBe(GAS_PISTOL.fireRate);
  });
});

describe('kit, acceptance 3: a power source and the recoil', () => {
  const recoilOf = (name: string) => kitReplica(pool, item('GBB Pistol'), fit({ power: item(name) })).recoilDeg;

  it("follows the power source's Recoil %: Green none, Red +10 %, Black +20 %", () => {
    expect(recoilOf('Green Gas')).toBe(GAS_PISTOL.recoilDeg);
    expect(recoilOf('Red Gas')).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.1);
    expect(recoilOf('Black Gas')).toBeCloseTo(GAS_PISTOL.recoilDeg * 1.2);
  });

  it('follows another Recoil % from the file, a negative one included', () => {
    const calmer = { ...GAME_STATS, power: { ...GAME_STATS.power, [id('Black Gas')]: { energy: 0.2, fireRate: 0, recoil: -0.5 } } };
    expect(kitReplica(pool, item('GBB Pistol'), fit({ power: item('Black Gas') }), calmer).recoilDeg).toBeCloseTo(GAS_PISTOL.recoilDeg * 0.5);
    expect(kitReplica(pool, item('GBB Pistol'), STARTER_PISTOL).recoilDeg).toBe(GAS_PISTOL.recoilDeg);
  });

  it('keeps a battery off the energy and a gas off the rate of fire, and the LiPo off both the kick and the energy', () => {
    const lipo = kitReplica(pool, item('AEG Rifle'), fit({ power: item('11.1 V LiPo Battery') }));
    expect([lipo.recoilDeg, lipo.muzzleEnergy]).toEqual([AEG.recoilDeg, AEG.muzzleEnergy]);
    expect(lipo.fireRate).toBeCloseTo(AEG.fireRate * 1.15);
    const red = kitReplica(pool, item('GBB Pistol'), fit({ power: item('Red Gas') }));
    expect(red.fireRate).toBe(GAS_PISTOL.fireRate);
  });

  it('reads an unpooled power source as no change (the stats file has no row for it)', () => {
    const none = { ...GAME_STATS, power: {} };
    const r = kitReplica(pool, item('GBB Pistol'), fit({ power: item('Black Gas') }), none);
    expect([r.muzzleEnergy, r.recoilDeg, r.fireRate]).toEqual([GAS_PISTOL.muzzleEnergy, GAS_PISTOL.recoilDeg, GAS_PISTOL.fireRate]);
  });
});

describe('barrels and muzzle parts (M29b)', () => {
  it('tightens spread with a Tight-Bore Barrel and adds a little energy; a Long Barrel adds more energy and a little tightness but handles slower', () => {
    const tight = kitSlot(pool, item('AEG Rifle'), fit({ ...STARTER_AEG, barrel: item('Tight-Bore Barrel') }));
    expect(tight.parts.barrel).toBe('tightBore');
    expect(tight.replica.spreadDeg).toBeCloseTo(AEG.spreadDeg * BARRELS.tightBore.spreadScale);
    expect(tight.replica.muzzleEnergy).toBeCloseTo(AEG.muzzleEnergy * (1 + BARRELS.tightBore.energy));
    const long = kitSlot(pool, item('AEG Rifle'), fit({ ...STARTER_AEG, barrel: item('Long Barrel') }));
    expect(long.replica.muzzleEnergy).toBeCloseTo(AEG.muzzleEnergy * (1 + BARRELS.long.energy));
    expect(long.replica.muzzleEnergy).toBeGreaterThan(tight.replica.muzzleEnergy);
    expect(long.replica.spreadDeg).toBeCloseTo(AEG.spreadDeg * BARRELS.long.spreadScale);
    expect(long.replica.spreadDeg).toBeGreaterThan(tight.replica.spreadDeg);
    const stock = handlingOf(AEG, factoryParts(AEG));
    const h = handlingOf(long.replica, long.parts);
    expect(h.drawTime).toBeCloseTo(stock.drawTime * BARRELS.long.handlingScale);
    expect(h.raiseScale).toBeCloseTo(BARRELS.long.handlingScale);
  });

  it('costs a silencer energy and handling, and halves how far its shots carry, on either replica', () => {
    for (const [name, base, starter] of [['AEG Rifle', AEG, STARTER_AEG], ['GBB Pistol', GAS_PISTOL, STARTER_PISTOL]] as const) {
      const s = kitSlot(pool, item(name), fit({ ...starter, muzzle: item('Silencer') }));
      expect(s.parts.muzzle, name).toBe('silencer');
      expect(s.replica.muzzleEnergy).toBeCloseTo(base.muzzleEnergy * (1 + MUZZLES.silencer.energy));
      expect(s.replica.muzzleEnergy).toBeLessThan(base.muzzleEnergy);
      const h = handlingOf(s.replica, s.parts);
      expect(h.drawTime).toBeCloseTo(base.drawTime * MUZZLES.silencer.handlingScale);
      expect(h.heardScale).toBe(MUZZLES.silencer.heardScale);
      expect(h.muffled).toBe(true);
    }
    expect(MUZZLES.silencer.heardScale).toBe(0.5);
  });

  it('fits barrels to the AEG only and the silencer to both (pool.md tags)', () => {
    const asset = (name: string) => pool.byId.get(id(name))!;
    for (const barrel of ['Tight-Bore Barrel', 'Long Barrel']) {
      expect(fits(asset(barrel), asset('AEG Rifle')), barrel).toBe(true);
      expect(fits(asset(barrel), asset('GBB Pistol')), barrel).toBe(false);
    }
    expect(fits(asset('Silencer'), asset('AEG Rifle'))).toBe(true);
    expect(fits(asset('Silencer'), asset('GBB Pistol'))).toBe(true);
  });

});

describe('barrels and muzzle parts, acceptance 2: the site limit still holds (M29b)', () => {
  it('stacks a barrel and a silencer on the energy, and stays under the AEG limit as shipped', () => {
    const slot = kitSlot(pool, item('AEG Rifle'), fit({ ...STARTER_AEG, barrel: item('Long Barrel'), muzzle: item('Silencer') }));
    expect(slot.replica.muzzleEnergy).toBeCloseTo(AEG.muzzleEnergy * (1 + BARRELS.long.energy) * (1 + MUZZLES.silencer.energy));
    expect(slot.replica.muzzleEnergy).toBeLessThanOrEqual(AEG.energyLimit);
    expect(energyCapped(pool, item('AEG Rifle'), fit({ ...STARTER_AEG, barrel: item('Long Barrel') }))).toBe(false);
  });

  it("caps a barrel's energy at the site limit, and says so, when a looser stats.md pushes it past", () => {
    const saved = { ...BARRELS.long };
    try {
      Object.assign(BARRELS.long, { energy: 0.5 }); // 0.97 J * 1.5 is past the rifle's 1.20 J
      const longFit = fit({ ...STARTER_AEG, barrel: item('Long Barrel') });
      expect(energyCapped(pool, item('AEG Rifle'), longFit)).toBe(true);
      expect(kitReplica(pool, item('AEG Rifle'), longFit).muzzleEnergy).toBe(AEG.energyLimit);
      // The silencer on the same replica pulls it back under: nothing is capped without the barrel.
      expect(energyCapped(pool, item('AEG Rifle'), STARTER_AEG)).toBe(false);
    } finally {
      Object.assign(BARRELS.long, saved);
    }
    expect(kitReplica(pool, item('AEG Rifle'), fit({ ...STARTER_AEG, barrel: item('Long Barrel') })).muzzleEnergy).toBeCloseTo(AEG.muzzleEnergy * 1.1);
  });

  it('leaves a barrel the pistol cannot take out of the pistol, and never fits one the kit does not name', () => {
    const none = kitSlot(pool, item('GBB Pistol'), STARTER_PISTOL);
    expect(none.parts.barrel).toBeNull();
    expect(none.parts.muzzle).toBeNull();
    expect(handlingOf(none.replica, none.parts).heardScale).toBe(1);
    expect(handlingOf(none.replica, none.parts).muffled).toBe(false);
  });
});

describe('the LV1 rebalance: the Low-Cap Magazine and the Long Barrel', () => {
  it('carries the Low-Cap as half the BBs in each, two more magazines, a quicker change and a quicker draw', () => {
    expect(MAGAZINES.lowCap).toMatchObject({ capacity: 0.5, carried: 2, reloadScale: 0.75, drawScale: 0.9 });
    const slot = kitSlot(pool, item('AEG Rifle'), fit({ ...STARTER_AEG, magazine: item('Low-Cap Magazine') }));
    const stock = handlingOf(AEG, factoryParts(AEG));
    const h = handlingOf(slot.replica, slot.parts);
    expect(h.magSize).toBe(Math.round(AEG.magSize * 0.5));
    expect(h.mags).toBe(AEG.mags + 2);
    expect(h.reloadTime).toBeCloseTo(stock.reloadTime * 0.75);
    expect(h.drawTime).toBeCloseTo(stock.drawTime * 0.9);
  });

  it('gives the Long Barrel 10 % more energy, a 0.9 spread and slower handling', () => {
    expect(BARRELS.long).toMatchObject({ energy: 0.1, spreadScale: 0.9, handlingScale: 1.15 });
  });
});

describe('M32 acceptance 2: the Cyber Pistol as carried (LV1: its own numbers, the old Legendary ones)', () => {
  const ref: ItemRef = { asset: '000019' };
  const cyber = kitReplica(pool, ref, EMPTY_FIT);

  it('shoots 1.00 J on 0.25 g BBs, 14 a second, spread 0.30 degrees, kick 0.06 degrees', () => {
    expect(cyber.id).toBe('cyber');
    expect(cyber.power).toBe('electric');
    expect(cyber.bbWeight).toBe(0.25);
    expect(cyber.muzzleEnergy).toBeGreaterThan(0.995);
    expect(cyber.muzzleEnergy).toBeLessThan(1.005);
    expect(cyber.fireRate).toBeGreaterThan(13.95);
    expect(cyber.fireRate).toBeLessThan(14.05);
    expect(cyber.spreadDeg).toBeCloseTo(0.3, 2);
    expect(cyber.recoilDeg).toBeCloseTo(0.06, 3);
  });

  it('reloads in 1.1 s, draws in 0.28 s, holds 50 BBs in each of 3 magazines', () => {
    expect(cyber.reloadTime).toBeCloseTo(1.1, 2);
    expect(cyber.drawTime).toBeCloseTo(0.28, 2);
    expect(cyber.magSize).toBe(50);
    expect(cyber.mags).toBe(3);
  });

  it('fires semi, burst and auto, on semi to start with', () => {
    expect(cyber.fireModes).toEqual(['semi', 'burst', 'auto']);
    expect(cyber.defaultFireMode).toBe('semi');
  });

  it('is not held back by the pistol site limit: 1.00 J is the limit, and it stays on it', () => {
    expect(cyber.energyLimit).toBeCloseTo(1.0, 5);
    expect(cyber.muzzleEnergy).toBeLessThanOrEqual(cyber.energyLimit + 1e-9);
    expect(energyCapped(pool, ref, EMPTY_FIT)).toBe(false);
  });

  it('uses only its own magazine and is carried exactly as its config (stats.md) has it: no tier lifts it', () => {
    expect(cyber.magazines).toEqual(['standard']);
    expect({ ...cyber, name: CYBER_PISTOL.name }).toEqual(CYBER_PISTOL);
    expect([CYBER_PISTOL.muzzleEnergy, CYBER_PISTOL.fireRate, CYBER_PISTOL.spreadDeg, CYBER_PISTOL.reloadTime, CYBER_PISTOL.drawTime]).toEqual([1.0, 14, 0.3, 1.1, 0.28]);
  });

  it('stays on target to about 33 m out of the box on 0.25 g BBs', () => {
    const reach = hopUpReach(cyber, cyber.hopUpDial, BALLISTICS);
    expect(reach.onTargetTo).toBeGreaterThanOrEqual(31);
    expect(reach.onTargetTo).toBeLessThanOrEqual(35);
    // Further than the GBB Pistol, short of the AEG's own factory reach.
    expect(reach.onTargetTo).toBeGreaterThan(hopUpReach(GAS_PISTOL, GAS_PISTOL.hopUpDial, BALLISTICS).onTargetTo);
    expect(reach.onTargetTo).toBeLessThan(hopUpReach(AEG, AEG.hopUpDial, BALLISTICS).onTargetTo);
  });

  it("tuned as well as it goes, on any BB weight from 0.20 to 0.30 g, still falls short of a tuned AEG", () => {
    const aegBest = bestHopUp(AEG, BALLISTICS).onTargetTo;
    for (const grams of [0.2, 0.25, 0.3]) {
      const best = bestHopUp(cyber, BALLISTICS, grams);
      expect(best.onTargetTo, `${grams} g`).toBeGreaterThan(0);
      expect(best.onTargetTo, `${grams} g`).toBeLessThan(aegBest);
    }
    // The dial still does something (hop-up still turns): none reaches less far than the factory setting.
    expect(hopUpReach(cyber, HOP_UP.minDial, BALLISTICS).onTargetTo).toBeLessThan(hopUpReach(cyber, cyber.hopUpDial, BALLISTICS).onTargetTo);
  });
});

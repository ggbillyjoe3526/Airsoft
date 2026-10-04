import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AEG, BB_WEIGHT, GAS_PISTOL, HOP_UP, muzzleEnergy, muzzleVelocity } from '../config/replicas';
import { type ItemRef, itemKey } from '../pool/collection';
import { GAME_POOL } from '../pool/gamePool';
import { EMPTY_FIT, kitSlot, type ReplicaFit } from '../pool/kit';
import { LoadoutModel } from '../pool/loadoutModel';
import { MemoryStorage } from '../pool/testStorage';
import {
  bbWeightLabel,
  barrelReadout,
  bbWeightReadout,
  gripReadout,
  hopUpLabel,
  hopUpReadout,
  laserReadout,
  loadoutSummary,
  loadoutTile,
  magazineReadout,
  muzzleReadout,
  opticReadout,
  powerReadout,
} from './loadoutChoice';

const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string, tier = 'common'): ItemRef => ({ asset: id(name), tier });
/** The AEG Rifle or Gas Pistol (Common, on its starter power) with these items fitted. */
const aeg = (parts: Partial<ReplicaFit> = {}) => kitSlot(pool, item('AEG Rifle'), { ...EMPTY_FIT, power: item('Standard Battery'), ...parts });
const pistol = (parts: Partial<ReplicaFit> = {}) => kitSlot(pool, item('Gas Pistol'), { ...EMPTY_FIT, power: item('Green Gas'), ...parts });

describe('hop-up readout', () => {
  it('shows the dial as a percentage', () => {
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

  it('calls the dial the factory setting only with the factory BB, and changes with the weight', () => {
    expect(hopUpReadout(AEG, AEG.hopUpDial, AEG.bbWeight)).toMatch(/\(factory setting\)\.$/);
    expect(hopUpReadout(AEG, AEG.hopUpDial, 0.28)).not.toMatch(/factory/);
    expect(hopUpReadout(AEG, AEG.hopUpDial, 0.2)).toMatch(/^Too much/);
    expect(hopUpReadout(AEG, AEG.hopUpDial, 0.28)).not.toBe(hopUpReadout(AEG, AEG.hopUpDial, 0.25));
  });
});

describe('BB weight readout', () => {
  it('labels weights to the hundredth of a gram', () => {
    expect(bbWeightLabel(0.3)).toBe('0.30 g');
    expect(bbWeightLabel(0.27)).toBe('0.27 g');
  });

  it('keeps the rated energy at the factory weight; across the slider a heavier BB leaves slower with a little more energy', () => {
    expect(muzzleEnergy(AEG)).toBe(AEG.muzzleEnergy);
    expect(muzzleVelocity(AEG)).toBeCloseTo(88, 0);
    for (let g = BB_WEIGHT.min + BB_WEIGHT.step; g <= BB_WEIGHT.max + 1e-9; g += BB_WEIGHT.step) {
      expect(muzzleVelocity(AEG, g)).toBeLessThan(muzzleVelocity(AEG, g - BB_WEIGHT.step));
      expect(muzzleEnergy(AEG, g)).toBeGreaterThan(muzzleEnergy(AEG, g - BB_WEIGHT.step));
    }
    // A few per cent, as at a chrono: never a big jump.
    expect(muzzleEnergy(AEG, 0.3) / muzzleEnergy(AEG, 0.2)).toBeLessThan(1.1);
  });

  it('says both sides of the weight: how fast the BB gets there, and how far it carries with the hop set for it', () => {
    expect(bbWeightReadout(AEG, 0.25)).toMatch(
      new RegExp(`^Leaves the barrel at 88 m/s \\(${AEG.muzzleEnergy.toFixed(2)} J\\) and reaches 20 m in 0\\.\\d\\d s \\(as it comes\\)\\. Longest reach at about 65% hop-up: on target to about 3\\d m\\.$`),
    );
    expect(bbWeightReadout(AEG, 0.3)).toMatch(/^Leaves the barrel at \d+ m\/s \(\d\.\d\d J\) and reaches 20 m in 0\.\d\d s\. Longest reach at about \d+% hop-up: on target to about \d+ m\.$/);
  });
});

describe('part readouts (M26b)', () => {
  it('says in numbers what a magazine does', () => {
    expect(magazineReadout(aeg())).toBe('60 BBs each, 4 carried (240 in all). Reload 1.8 s.');
    expect(magazineReadout(aeg({ magazine: item('Hi-Cap Magazine') }))).toBe('120 BBs each, 2 carried (240 in all). Reload 1.8 s.');
    expect(magazineReadout(aeg({ magazine: item('Low-Cap Magazine') }))).toBe('30 BBs each, 5 carried (150 in all). Reload 1.4 s.');
    expect(magazineReadout(pistol({ magazine: item('Extended Magazine') }))).toBe('27 BBs each, 4 carried (108 in all). Reload 1.2 s. Draw 0.41 s.');
    // A rarer magazine (and a rarer replica) reload quicker.
    expect(magazineReadout(aeg({ magazine: item('Hi-Cap Magazine', 'legendary') }))).toBe('120 BBs each, 2 carried (240 in all). Reload 1.5 s.');
  });

  it("says how quickly the optic comes up with the replica's grip, or that iron sights fire from the hip", () => {
    expect(opticReadout(aeg({ optic: item('Red Dot') }))).toBe('Up to your eye in 0.15 s.');
    expect(opticReadout(aeg({ optic: item('2x Scope'), grip: item('Vertical Grip') }))).toBe('Up to your eye in 0.30 s with the vertical grip.');
    expect(opticReadout(aeg({ optic: item('2x Scope'), grip: item('Angled Grip') }))).toBe('Up to your eye in 0.19 s with the angled grip.');
    expect(opticReadout(aeg({ grip: item('Angled Grip') }))).toBe('Fired from the hip: no sight to raise.');
  });

  it('says how a grip changes the draw and how soon the aim is steady after a sprint', () => {
    expect(gripReadout(aeg())).toBe('Brings the AEG Rifle up in 0.45 s. After a sprint it can fire from 0.20 s, steady from 0.27 s.');
    // Steadier and slower with a vertical grip; quicker and shakier with an angled one.
    expect(gripReadout(aeg({ grip: item('Vertical Grip') }))).toBe('Brings the AEG Rifle up in 0.56 s. After a sprint it can fire from 0.20 s, already steady.');
    expect(gripReadout(aeg({ grip: item('Angled Grip') }))).toBe('Brings the AEG Rifle up in 0.36 s. After a sprint it can fire from 0.20 s, steady from 0.33 s.');
  });

  it('says what the power source gives with the BB weight in use, and what the laser does to the spread', () => {
    expect(powerReadout(aeg(), 0.25)).toBe(`${AEG.muzzleEnergy.toFixed(2)} J: leaves the barrel at 88 m/s with 0.25 g BBs. ${AEG.fireRate} BBs a second at most.`);
    expect(powerReadout(pistol({ power: item('Black Gas') }), 0.2)).toMatch(/^\d\.\d\d J: leaves the barrel at \d+ m\/s with 0\.20 g BBs\. \d+ BBs a second at most\.$/);
    expect(muzzleEnergy(pistol({ power: item('Black Gas') }).replica, 0.2)).toBeGreaterThan(muzzleEnergy(GAS_PISTOL, 0.2));
    const plain = Number(/Spread ([\d.]+)°/.exec(laserReadout(pistol()))![1]);
    const laser = Number(/Spread ([\d.]+)°/.exec(laserReadout(pistol({ laser: item('Red Laser') })))![1]);
    expect(laser).toBeLessThan(plain);
  });
});

describe('Loadout tile on New game (M26b)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  const owning = (items: ItemRef[]) => {
    const set = new Set(items.map((r) => itemKey(r.asset, r.tier)));
    return new LoadoutModel(pool, { owns: (r) => set.has(itemKey(r.asset, r.tier)) });
  };
  const STARTERS = ['AEG Rifle', 'Gas Pistol', 'Standard Battery', 'Green Gas'].map((n) => item(n));

  it('names each replica (with its tier unless Common), then the fitted parts, BB weights and hop-up dials', () => {
    expect(loadoutTile(owning(STARTERS))).toEqual({ replicas: 'AEG Rifle\nGas Pistol', detail: `0.25 g / 0.20 g BBs · hop-up 65% / ${hopUpLabel(GAS_PISTOL.hopUpDial)}` });
    const model = owning([...STARTERS, item('AEG Rifle', 'epic'), item('Red Dot'), item('Red Laser', 'rare')]);
    model.setFit(id('AEG Rifle'), 'optic', item('Red Dot'));
    model.setFit(id('Gas Pistol'), 'laser', item('Red Laser', 'rare'));
    expect(loadoutTile(model)).toEqual({ replicas: 'AEG Rifle (Epic)\nGas Pistol', detail: `Red Dot · Red Laser · 0.25 g / 0.20 g BBs · hop-up 65% / ${hopUpLabel(GAS_PISTOL.hopUpDial)}` });
  });

  it('shows the factory setting for a missing dial or weight', () => {
    const kit = { slots: [pistol()], hopUps: [], bbWeights: [], glowBBs: [] };
    expect(loadoutSummary(kit, [])).toBe(`0.20 g BBs · hop-up ${hopUpLabel(GAS_PISTOL.hopUpDial)}`);
  });
});

describe('barrel and muzzle readouts (M29b)', () => {
  it("says the barrel's energy, spread and draw, and how far bots hear a silencer's shots", () => {
    expect(barrelReadout(aeg())).toBe(`${AEG.muzzleEnergy.toFixed(2)} J with 0.25 g BBs, spread ${AEG.spreadDeg.toFixed(2)}°. Brings it up in ${AEG.drawTime.toFixed(2)} s.`);
    const tight = barrelReadout(aeg({ barrel: item('Tight-Bore Barrel') }));
    expect(Number(/spread ([\d.]+)°/.exec(tight)![1])).toBeLessThan(AEG.spreadDeg);
    expect(Number(/Brings it up in ([\d.]+) s/.exec(barrelReadout(aeg({ barrel: item('Long Barrel') })))![1])).toBeCloseTo(AEG.drawTime * 1.15, 1);
    expect(muzzleReadout(aeg())).toBe('Bots hear your shots from 22 m (22 m without a silencer).');
    expect(muzzleReadout(aeg({ muzzle: item('Silencer') }))).toBe('Bots hear your shots from 11 m (22 m without a silencer).');
    expect(muzzleReadout(pistol({ muzzle: item('Silencer') }))).toMatch(/from 11 m/);
  });
});

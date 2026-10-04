import { describe, expect, it } from 'vitest';
import { GAME_STATS } from '../config/gameStats';
import { HOP_UP } from '../config/replicas';
import type { ItemRef } from '../pool/collection';
import { GAME_POOL } from '../pool/gamePool';
import { EMPTY_FIT, energyCapped, kitSlot, type ReplicaFit } from '../pool/kit';
import { gearLine, performanceOf, sheetRows, tierBlurb, tierLine } from './performanceSheet';

const pool = GAME_POOL;
const id = (name: string) => pool.assets.find((a) => a.name === name)!.id;
const item = (name: string, tier = 'common'): ItemRef => ({ asset: id(name), tier });
const fit = (parts: Partial<ReplicaFit>): ReplicaFit => ({ ...EMPTY_FIT, ...parts });
const aeg = (tier = 'common', parts: Partial<ReplicaFit> = {}) => kitSlot(pool, item('AEG Rifle', tier), fit({ power: item('Standard Battery'), ...parts }));
const rowsOf = (now: ReturnType<typeof aeg>, factory: ReturnType<typeof aeg>, grams = 0.25, dial = 0.65) =>
  sheetRows(performanceOf(now, grams, dial), performanceOf(factory, 0.25, 0.65), HOP_UP.readoutRange);
const find = (rows: ReturnType<typeof rowsOf>, label: string) => rows.find((r) => r.label === label)!;

describe('Performance sheet (M29)', () => {
  it('shows the AEG as it comes in joules, m/s and fps on 0.20 g, with no changes', () => {
    const rows = rowsOf(aeg(), aeg());
    expect(find(rows, 'Energy').value).toBe('0.97 J');
    // 0.97 J on 0.25 g is 88 m/s; on 0.20 g it chronos at about 318 fps.
    expect(find(rows, 'Muzzle speed').value).toMatch(/^88 m\/s \(31[5-9] fps\)$/);
    expect(find(rows, 'Rate of fire').value).toBe('13 BBs/s');
    expect(find(rows, 'Magazines').value).toBe('60 × 4 (240)');
    expect(find(rows, 'Aim raise').value).toBe('no optic');
    expect(rows.every((r) => r.delta === '' && r.change === null)).toBe(true);
  });

  it('marks what a Legendary copy improves as better, with its percentage', () => {
    const rows = rowsOf(aeg('legendary'), aeg());
    expect(find(rows, 'Energy')).toMatchObject({ value: '1.04 J', delta: '+7.5%', change: 'better' });
    expect(find(rows, 'Rate of fire')).toMatchObject({ value: '14 BBs/s', delta: '+7.5%', change: 'better' });
    expect(find(rows, 'Spread')).toMatchObject({ delta: '−15%', change: 'better' });
    expect(find(rows, 'Reload')).toMatchObject({ delta: '−15%', change: 'better' });
    // More energy flies flatter and arrives sooner.
    expect(find(rows, 'Time to 20 m').change).toBe('better');
  });

  it('marks a trade-off both ways: the vertical grip draws slower, the hi-cap is neither', () => {
    const rows = rowsOf(aeg('common', { grip: item('Vertical Grip'), magazine: item('Hi-Cap Magazine') }), aeg());
    expect(find(rows, 'Draw').change).toBe('worse');
    expect(find(rows, 'Magazines')).toMatchObject({ value: '120 × 2 (240)', change: null });
  });

  it('says a semi-only replica fires up to its rate, and a heavier BB is shown without a colour', () => {
    const pistol = kitSlot(pool, item('Gas Pistol'), fit({ power: item('Green Gas') }));
    const p = sheetRows(performanceOf(pistol, 0.25, 0.55), performanceOf(pistol, 0.2, 0.55), HOP_UP.readoutRange);
    expect(find(p, 'Rate of fire').value).toBe('up to 7 BBs/s');
    expect(find(p, 'BB weight')).toMatchObject({ value: '0.25 g', change: null });
    expect(find(p, 'Muzzle speed').change).toBe('worse');
  });

  it('notes the site limit when it stopped the energy', () => {
    const rows = sheetRows(performanceOf(aeg(), 0.25, 0.65, true), performanceOf(aeg(), 0.25, 0.65), HOP_UP.readoutRange);
    expect(find(rows, 'Energy').value).toBe('0.97 J (site limit)');
  });

  it('puts energy, rate of fire and magazine on the gear slot', () => {
    expect(gearLine(aeg('legendary'), 0.25)).toBe('1.04 J · 14 BBs/s · 60 BBs');
  });

  it("says what a tier adds in the Armory, by the item's category, and nothing at Common", () => {
    expect(tierLine(pool, item('AEG Rifle', 'legendary'))).toBe('+7.5% energy · +7.5% rate of fire · −15% spread · −15% reload · −15% draw');
    expect(tierLine(pool, item('Standard Battery', 'legendary'))).toBe('+7.5% rate of fire');
    expect(tierLine(pool, item('Red Gas', 'epic'))).toBe('+6% energy');
    expect(tierLine(pool, item('Vertical Grip', 'rare'))).toBe('−3% draw · −3% aim raise · −3% sprint shake');
    expect(tierLine(pool, item('AEG Rifle'))).toBe('');
  });

  it('says what a tier means on the Loadout, Common included (audit POOL-10)', () => {
    expect(tierBlurb(pool, item('Standard Battery', 'legendary'))).toBe('Legendary: +7.5% rate of fire');
    expect(tierBlurb(pool, item('AEG Rifle'))).toBe('Common: no tier bonus');
  });
});

describe('Performance sheet, acceptance 5: every row, and the sliders', () => {
  const LABELS = ['Energy', 'Muzzle speed', 'BB weight', 'Rate of fire', 'On target to', 'Time to 20 m', 'Spread', 'Recoil', 'Magazines', 'Reload', 'Draw', 'Aim raise', 'Shots heard from'];

  it('lists energy, speed (m/s and fps), BB weight, rate, reach, time to 20 m, spread, recoil, magazines, reload, draw and aim raise, in that order', () => {
    expect(rowsOf(aeg(), aeg()).map((r) => r.label)).toEqual(LABELS);
  });

  it('reads the Gas Pistol as it comes: 0.52 J, 72 m/s on 0.20 g which a chrono reads as about 237 fps', () => {
    const pistol = kitSlot(pool, item('Gas Pistol'), fit({ power: item('Green Gas') }));
    const p = sheetRows(performanceOf(pistol, 0.2, 0.55), performanceOf(pistol, 0.2, 0.55), HOP_UP.readoutRange);
    expect(find(p, 'Energy').value).toBe('0.52 J');
    expect(find(p, 'Muzzle speed').value).toMatch(/^72 m\/s \(23[67] fps\)$/);
    expect(find(p, 'BB weight').value).toBe('0.20 g');
    expect(find(p, 'Magazines').value).toBe('18 × 4 (72)');
    expect(find(p, 'Spread').value).toBe('0.80°');
    expect(find(p, 'Recoil').value).toBe('0.50°');
    expect(find(p, 'Reload').value).toBe('1.20 s');
    expect(find(p, 'Draw').value).toBe('0.30 s');
  });

  it('follows the BB weight slider: a heavier BB is more energy and slower, and the BB weight row changes with no colour', () => {
    const light = rowsOf(aeg(), aeg(), 0.25);
    const heavy = rowsOf(aeg(), aeg(), 0.3);
    expect(find(heavy, 'BB weight')).toMatchObject({ value: '0.30 g', delta: '+20%', change: null });
    expect(find(heavy, 'Energy').change).toBe('better');
    expect(Number.parseFloat(find(heavy, 'Energy').value)).toBeGreaterThan(Number.parseFloat(find(light, 'Energy').value));
    expect(find(heavy, 'Muzzle speed')).toMatchObject({ change: 'worse' });
    const speed = (rows: ReturnType<typeof rowsOf>) => Number.parseInt(find(rows, 'Muzzle speed').value, 10);
    expect(speed(heavy)).toBeLessThan(speed(light));
    // The fps stays on 0.20 g: it follows the replica's energy, not the picked weight, so it changes with the BB's energy shift only.
    expect(find(light, 'Muzzle speed').value).toMatch(/\(31\d fps\)$/);
  });

  it('follows the hop-up slider: the reach and the time to 20 m change, the energy does not', () => {
    const low = rowsOf(aeg(), aeg(), 0.25, 0.2);
    const set = rowsOf(aeg(), aeg(), 0.25, 0.65);
    expect(find(low, 'On target to').value).not.toBe(find(set, 'On target to').value);
    // The row shows two decimals; the flight time itself moves with the dial.
    expect(performanceOf(aeg(), 0.25, 0.2).timeTo).not.toBe(performanceOf(aeg(), 0.25, 0.65).timeTo);
    expect(find(low, 'Energy').value).toBe(find(set, 'Energy').value);
    expect(find(set, 'On target to').value).toMatch(/^(\d+ m|past 60 m)$/);
  });

  it('marks a stronger gas as more energy (better) with a worse recoil, against the replica as it comes', () => {
    const come = kitSlot(pool, item('Gas Pistol'), fit({ power: item('Green Gas') }));
    const black = kitSlot(pool, item('Gas Pistol'), fit({ power: item('Black Gas') }));
    const rows = sheetRows(performanceOf(black, 0.2, 0.55), performanceOf(come, 0.2, 0.55), HOP_UP.readoutRange);
    expect(find(rows, 'Energy')).toMatchObject({ value: '0.62 J', delta: '+20%', change: 'better' });
    expect(find(rows, 'Recoil')).toMatchObject({ value: '0.60°', delta: '+20%', change: 'worse' });
    expect(find(rows, 'Rate of fire').change).toBeNull();
  });

  it('marks a LiPo battery as +15 % rate of fire and nothing else', () => {
    const rows = rowsOf(aeg('common', { power: item('11.1 V LiPo Battery') }), aeg());
    expect(find(rows, 'Rate of fire')).toMatchObject({ value: '15 BBs/s', delta: '+15%', change: 'better' });
    expect(find(rows, 'Energy')).toMatchObject({ delta: '', change: null });
    expect(find(rows, 'Recoil')).toMatchObject({ delta: '', change: null });
  });

  it('shows a fitted optic as its raise time, and a scope as slower than the red dot', () => {
    const dot = find(rowsOf(aeg('common', { optic: item('Red Dot') }), aeg()), 'Aim raise');
    const scope = find(rowsOf(aeg('common', { optic: item('2x Scope') }), aeg()), 'Aim raise');
    expect(dot.value).toMatch(/^\d\.\d{2} s$/);
    expect(Number.parseFloat(scope.value)).toBeGreaterThan(Number.parseFloat(dot.value));
  });

  it('says "site limit" on the energy of a kit the limit stopped, through the model, and not otherwise', () => {
    const strict = { ...GAME_STATS, power: { ...GAME_STATS.power, [id('Black Gas')]: { energy: 5, fireRate: 0, recoil: 0.2 } } };
    const black = fit({ power: item('Black Gas') });
    const capped = energyCapped(pool, item('Gas Pistol'), black, strict);
    const slot = kitSlot(pool, item('Gas Pistol'), black, strict);
    const come = kitSlot(pool, item('Gas Pistol'), fit({ power: item('Green Gas') }));
    const rows = sheetRows(performanceOf(slot, 0.2, 0.55, capped), performanceOf(come, 0.2, 0.55), HOP_UP.readoutRange);
    expect(find(rows, 'Energy').value).toBe('1.00 J (site limit)');
    expect(find(rows, 'Energy').change).toBe('better');
    expect(find(sheetRows(performanceOf(come, 0.2, 0.55, false), performanceOf(come, 0.2, 0.55), HOP_UP.readoutRange), 'Energy').value).not.toContain('site limit');
  });

  it('shows a change smaller than half a percent as none, and a big one without decimals', () => {
    const tiny = { ...performanceOf(aeg(), 0.25, 0.65), energy: 0.97 * 1.003 };
    expect(find(sheetRows(tiny, performanceOf(aeg(), 0.25, 0.65), HOP_UP.readoutRange), 'Energy')).toMatchObject({ delta: '', change: null });
    const big = { ...performanceOf(aeg(), 0.25, 0.65), fireRate: 13 * 1.5 };
    expect(find(sheetRows(big, performanceOf(aeg(), 0.25, 0.65), HOP_UP.readoutRange), 'Rate of fire').delta).toBe('+50%');
  });

  it('says "never gets there" for a BB that does not reach 20 m, and "past 60 m" for a reach beyond the readout', () => {
    const now = { ...performanceOf(aeg(), 0.25, 0.65), timeTo: Number.POSITIVE_INFINITY, onTargetTo: HOP_UP.readoutRange + 5 };
    const rows = sheetRows(now, performanceOf(aeg(), 0.25, 0.65), HOP_UP.readoutRange);
    expect(find(rows, 'Time to 20 m').value).toBe('never gets there');
    expect(find(rows, 'On target to').value).toBe(`past ${HOP_UP.readoutRange} m`);
  });
});

describe('Performance sheet, acceptance 6: the gear slot and the Armory line', () => {
  it('shows "energy · rate of fire · magazine" for each replica as it comes', () => {
    expect(gearLine(aeg(), 0.25)).toBe('0.97 J · 13 BBs/s · 60 BBs');
    expect(gearLine(kitSlot(pool, item('Gas Pistol'), fit({ power: item('Green Gas') })), 0.2)).toBe('0.52 J · 7 BBs/s · 18 BBs');
  });

  it("follows the gear: a tier, a power source, a magazine and the BB weight change the line", () => {
    expect(gearLine(aeg('common', { power: item('11.1 V LiPo Battery') }), 0.25)).toBe('0.97 J · 15 BBs/s · 60 BBs');
    expect(gearLine(aeg('common', { magazine: item('Hi-Cap Magazine') }), 0.25)).toBe('0.97 J · 13 BBs/s · 120 BBs');
    expect(gearLine(kitSlot(pool, item('Gas Pistol'), fit({ power: item('Black Gas') })), 0.2)).toBe('0.62 J · 7 BBs/s · 18 BBs');
    expect(gearLine(kitSlot(pool, item('Gas Pistol'), fit({ power: item('Green Gas'), magazine: item('Extended Magazine') })), 0.2)).toBe('0.52 J · 7 BBs/s · 27 BBs');
    expect(gearLine(aeg(), 0.3)).not.toBe(gearLine(aeg(), 0.25));
  });

  it('names what each category of tier adds in the Armory, the same words at every tier above Common', () => {
    expect(tierLine(pool, item('Red Dot', 'legendary'))).toBe('−15% aim raise');
    expect(tierLine(pool, item('Red Laser', 'legendary'))).toBe('−7.5% spread');
    expect(tierLine(pool, item('Hi-Cap Magazine', 'rare'))).toBe('−6% reload');
    expect(tierLine(pool, item('Green Gas', 'legendary'))).toBe('+7.5% energy');
    expect(tierLine(pool, item('AEG Rifle', 'rare'))).toBe('+3% energy · +3% rate of fire · −6% spread · −6% reload · −6% draw');
    for (const a of pool.assets.filter((x) => x.category !== 'grenade')) {
      expect(tierLine(pool, { asset: a.id, tier: 'common' }), a.name).toBe('');
      expect(tierLine(pool, { asset: a.id, tier: 'legendary' }), a.name).not.toBe('');
    }
  });

  it('says nothing for an item that is not in the pool', () => {
    expect(tierLine(pool, { asset: '999999', tier: 'legendary' })).toBe('');
  });
});

describe('Performance sheet, barrels and muzzle parts (M29b)', () => {
  it('shows how far shots are heard, and a silencer halving it as better, with its energy cost as worse', () => {
    const rows = rowsOf(aeg('common', { muzzle: item('Silencer') }), aeg());
    expect(find(rowsOf(aeg(), aeg()), 'Shots heard from').value).toBe('22 m');
    expect(find(rows, 'Shots heard from')).toMatchObject({ value: '11 m', delta: '−50%', change: 'better' });
    expect(find(rows, 'Energy')).toMatchObject({ delta: '−5%', change: 'worse' });
    expect(find(rows, 'Draw').change).toBe('worse');
  });

  it('marks a Tight-Bore Barrel tighter and stronger, and a Long Barrel stronger but slower to draw', () => {
    const tight = rowsOf(aeg('common', { barrel: item('Tight-Bore Barrel') }), aeg());
    expect(find(tight, 'Spread')).toMatchObject({ delta: '−15%', change: 'better' });
    expect(find(tight, 'Energy')).toMatchObject({ delta: '+3%', change: 'better' });
    const long = rowsOf(aeg('common', { barrel: item('Long Barrel') }), aeg());
    expect(find(long, 'Energy')).toMatchObject({ delta: '+8%', change: 'better' });
    expect(find(long, 'Draw')).toMatchObject({ delta: '+15%', change: 'worse' });
  });
});

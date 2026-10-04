import { describe, expect, it } from 'vitest';
import { HOP_UP } from '../config/replicas';
import type { ItemRef } from '../pool/collection';
import { GAME_POOL } from '../pool/gamePool';
import { EMPTY_FIT, kitSlot, type ReplicaFit } from '../pool/kit';
import { gearLine, performanceOf, sheetRows, tierLine } from './performanceSheet';

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
});

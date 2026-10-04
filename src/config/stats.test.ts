import { describe, expect, it } from 'vitest';
import statsText from '../../stats.md?raw';
import { GAME_POOL } from '../pool/gamePool';
import { GRIP_KEYS, LASER_KEYS, MAGAZINE_KEYS, OPTIC_KEYS, REPLICA_KEYS } from '../pool/pool';
import { GRIPS, MAGAZINES } from './attachments';
import { LASERS } from './lasers';
import { OPTICS } from './optics';
import { AEG, GAS_PISTOL, withStats } from './replicas';
import { DEFAULT_TIER_SHARES, loadStats, overlay } from './statsFile';

const stats = loadStats(statsText);

/** A minimal stats.md with the given tables. */
function mini(...tables: string[]): string {
  return tables.join('\n\n');
}

const REPLICAS = [
  '## Replicas',
  '| Key | Name | Class | Energy (J) | BB (g) | Fire rate (BBs/s) | Magazine (BBs) | Magazines | Reload (s) | Draw (s) | Spread (°) | Recoil (°) |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  '| aeg | AEG Rifle | rifle | 1.1 | 0.28 | 15 | 30 | 5 | 2 | 0.5 | 0.4 | 0.2 |',
].join('\n');

describe('stats.md (M29)', () => {
  it('reads without a single problem', () => {
    expect(stats.errors).toEqual([]);
  });

  it('gives every pooled replica, optic, grip, laser, magazine and power source a row, under its pool.md name', () => {
    const name = (id: string) => GAME_POOL.byId.get(id)?.name;
    const keyed = (category: string, rows: Readonly<Record<string, unknown>>) =>
      GAME_POOL.assets.filter((a) => a.category === category).forEach((a) => expect(rows[a.key], `${a.name} (${a.key})`).toBeDefined());
    keyed('replica', stats.replicas);
    keyed('optic', stats.optics);
    keyed('grip', stats.grips);
    keyed('laser', stats.lasers);
    keyed('magazine', stats.magazines);
    for (const a of GAME_POOL.assets.filter((x) => x.category === 'power')) expect(stats.power[a.id], a.name).toBeDefined();
    // And nothing in stats.md that the pool or the code doesn't know.
    for (const id of Object.keys(stats.power)) expect(GAME_POOL.byId.get(id)?.category, `power source ${id}`).toBe('power');
    for (const key of Object.keys(stats.replicas)) expect(Object.keys(REPLICA_KEYS)).toContain(key);
    for (const key of Object.keys(stats.optics)) expect(OPTIC_KEYS).toContain(key);
    for (const key of Object.keys(stats.grips)) expect(GRIP_KEYS).toContain(key);
    for (const key of Object.keys(stats.lasers)) expect(LASER_KEYS).toContain(key);
    for (const key of Object.keys(stats.magazines)) expect(MAGAZINE_KEYS).toContain(key);
    // The Name column is only a label, but it should say the same as pool.md.
    const rows = statsText.split('\n').filter((l) => /^\| \d{6} \|/.test(l));
    for (const row of rows) {
      const [, id, label] = row.split('|').map((c) => c.trim());
      expect(label, `stats.md names ${id}`).toBe(name(id!));
    }
  });

  it("is what the game's replicas and parts carry", () => {
    expect(AEG.muzzleEnergy).toBe(stats.replicas.aeg!.muzzleEnergy);
    expect(GAS_PISTOL.fireRate).toBe(stats.replicas.pistol!.fireRate);
    expect(GRIPS.vertical.shakeScale).toBe(stats.grips.vertical!.shakeScale);
    expect(MAGAZINES.hiCap.rattles).toBe(true);
    expect(MAGAZINES.hiCap.carried).toBe(stats.magazines.hiCap!.carried);
    expect(OPTICS.scope2x.zoom).toBe(stats.optics.scope2x!.zoom);
    expect(LASERS.redLaser.spreadScale).toBe(stats.lasers.redLaser!.spreadScale);
    // What the file doesn't hold stays as the code has it.
    expect(OPTICS.scope2x.scope).toBe(true);
    expect(GRIPS.none.handlingScale).toBe(1);
  });

  it('sets each replica its class limit, which it comes in under (bots carry it as it comes)', () => {
    expect(AEG.energyLimit).toBe(stats.siteLimits.rifle);
    expect(GAS_PISTOL.energyLimit).toBe(stats.siteLimits.pistol);
    for (const r of [AEG, GAS_PISTOL]) expect(r.muzzleEnergy).toBeLessThanOrEqual(r.energyLimit);
  });

  it('lays a file over the built-in numbers: a replica takes its row and its class limit', () => {
    const file = loadStats(mini(REPLICAS, '## Site limits\n| Class | Limit (J) |\n|---|---|\n| rifle | 1.5 |'));
    expect(file.errors.filter((e) => e.startsWith('line'))).toEqual([]);
    const r = withStats({ ...AEG, siteClass: 'rifle' }, file);
    expect([r.muzzleEnergy, r.bbWeight, r.fireRate, r.magSize, r.mags, r.reloadTime, r.drawTime, r.spreadDeg, r.recoilDeg]).toEqual([1.1, 0.28, 15, 30, 5, 2, 0.5, 0.4, 0.2]);
    expect(r.energyLimit).toBe(1.5);
    expect(r.look).toBe(AEG.look);
  });

  it('reports a cell it cannot read with its line and keeps the built-in number there', () => {
    const file = loadStats(mini(REPLICAS.replace('| 1.1 |', '| lots |').replace('| 15 |', '| 500 |')));
    expect(file.errors.some((e) => /^line 4: Energy \(J\) must be a number/.test(e))).toBe(true);
    expect(file.errors.some((e) => /^line 4: Fire rate \(BBs\/s\) must be a number from 0.5 to 50/.test(e))).toBe(true);
    const r = withStats({ ...AEG, siteClass: 'rifle' }, file);
    expect(r.muzzleEnergy).toBe(AEG.muzzleEnergy);
    expect(r.bbWeight).toBe(0.28);
  });

  it('reads power sources by ID as percentages, a typed minus sign included', () => {
    const file = loadStats(
      mini('## Power sources\n| ID | Name | Energy % | Fire rate % | Recoil % |\n|---|---|---|---|---|\n| 000009 | Black Gas | 20 | −5% | 20 |\n| 9 | Short | 0 | 0 | 0 |'),
    );
    expect(file.power['000009']).toEqual({ energy: 0.2, fireRate: -0.05, recoil: 0.2 });
    expect(file.errors.some((e) => /^line 5: ID must be six digits/.test(e))).toBe(true);
  });

  it('flags a tier share the code has no use for, and falls back to the built-in shares without the table', () => {
    const file = loadStats(mini('## Tier scaling\n| Category | Stat | Share % |\n|---|---|---|\n| Optic | Energy | 50 |\n| Replica | Spread | 80 |\n| Replica | Spread | 90 |'));
    expect(file.errors.some((e) => e.startsWith('line 4: Optic tiers can\'t improve "Energy"'))).toBe(true);
    expect(file.errors.some((e) => e.startsWith('line 6: Replica · Spread is listed twice'))).toBe(true);
    expect(file.tierShares.replica).toEqual({ spread: 0.8 });
    expect(loadStats('').tierShares).toBe(DEFAULT_TIER_SHARES);
    expect(loadStats('').errors.some((e) => e.includes('"Tier scaling"'))).toBe(true);
  });

  it('overlays only the entries and fields the file names', () => {
    const base = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } };
    expect(overlay(base, { a: { y: 9 }, c: { x: 0 } })).toEqual({ a: { x: 1, y: 9 }, b: { x: 3, y: 4 } });
  });
});

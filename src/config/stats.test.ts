import { describe, expect, it } from 'vitest';
import statsText from '../../stats.md?raw';
import { GAME_POOL } from '../pool/gamePool';
import { createCharacter } from '../sim/character';
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

/** Numbers as the game shipped them before stats.md (M29 acceptance 1: "the game's numbers as shipped are unchanged"). */
describe('stats.md, acceptance 1: the numbers as shipped', () => {
  it('gives the AEG Rifle and Gas Pistol the numbers they had before the file', () => {
    const num = (r: typeof AEG) => [r.muzzleEnergy, r.bbWeight, r.fireRate, r.magSize, r.mags, r.reloadTime, r.drawTime, r.spreadDeg, r.recoilDeg];
    expect(num(AEG)).toEqual([0.97, 0.25, 13, 60, 4, 1.8, 0.45, 0.45, 0.18]);
    expect(num(GAS_PISTOL)).toEqual([0.52, 0.2, 7, 18, 4, 1.2, 0.3, 0.8, 0.5]);
    expect([AEG.energyLimit, GAS_PISTOL.energyLimit]).toEqual([1.2, 1.0]);
  });

  it('gives the optics, grips, lasers and magazines the numbers they had', () => {
    expect([OPTICS.redDot.zoom, OPTICS.redDot.raiseScale, OPTICS.scope2x.zoom, OPTICS.scope2x.raiseScale]).toEqual([1.25, 1, 2, 1.6]);
    expect([GRIPS.vertical.handlingScale, GRIPS.vertical.shakeScale, GRIPS.angled.handlingScale, GRIPS.angled.shakeScale]).toEqual([1.25, 0.6, 0.8, 1.3]);
    expect(LASERS.redLaser.spreadScale).toBe(0.8);
    const m = (k: keyof typeof MAGAZINES) => [MAGAZINES[k].capacity, MAGAZINES[k].carried, MAGAZINES[k].reloadScale, MAGAZINES[k].drawScale, MAGAZINES[k].rattles];
    expect(m('hiCap')).toEqual([2, -2, 1, 1, true]);
    expect(m('lowCap')).toEqual([0.5, 1, 0.8, 1, false]);
    expect(m('extended')).toEqual([1.5, 0, 1, 1.35, false]);
    // Names and blurbs stay the code's: stats.md holds numbers only.
    expect(GRIPS.vertical.label).toBe('Vertical Grip');
    expect(MAGAZINES.lowCap.blurb).toMatch(/Half the BBs/);
  });

  it("gives the power sources the Power % pool.md had (Red Gas 10, Black Gas 20), a battery none, and the LiPo's rate of fire", () => {
    const power = (name: string) => stats.power[GAME_POOL.assets.find((a) => a.name === name)!.id]!;
    expect(power('Standard Battery')).toEqual({ energy: 0, fireRate: 0, recoil: 0 });
    expect(power('Green Gas')).toEqual({ energy: 0, fireRate: 0, recoil: 0 });
    expect(power('Red Gas')).toEqual({ energy: 0.1, fireRate: 0, recoil: 0.1 });
    expect(power('Black Gas')).toEqual({ energy: 0.2, fireRate: 0, recoil: 0.2 });
    // A battery sets the rate of fire only, a gas the energy and kick only.
    for (const a of GAME_POOL.assets.filter((x) => x.category === 'power')) {
      const p = stats.power[a.id]!;
      if (a.power!.type === 'battery') expect([p.energy, p.recoil], a.name).toEqual([0, 0]);
      if (a.power!.type === 'gas') expect(p.fireRate, a.name).toBe(0);
    }
    expect(power('11.1 V LiPo Battery')).toEqual({ energy: 0, fireRate: 0.15, recoil: 0 });
  });

  it('ships the tier shares that make a Legendary replica 15 % tighter and 7.5 % stronger', () => {
    expect(stats.tierShares).toEqual(DEFAULT_TIER_SHARES);
    expect(stats.tierShares.replica).toEqual({ spread: 1, reload: 1, draw: 1, energy: 0.5, fireRate: 0.5 });
    expect(stats.tierShares.battery).toEqual({ fireRate: 0.5 });
    expect(stats.tierShares.gas).toEqual({ energy: 0.5 });
  });

  it('ships the site limits of a rifle (1.20 J) and a pistol (1.00 J)', () => {
    expect(stats.siteLimits).toEqual({ rifle: 1.2, pistol: 1.0 });
  });
});

describe('stats.md, acceptance 1: a cell or column it cannot read keeps the built-in number', () => {
  const twoRows = (header: string, sep: string, ...rows: string[]) => [header, sep, ...rows].join('\n');

  it('reports a missing column once, however many rows, and keeps the built-in number for it', () => {
    const text = mini(
      [
        '## Replicas',
        '| Key | Name | Class | Energy (J) | BB (g) | Fire rate (BBs/s) | Magazine (BBs) | Magazines | Reload (s) | Draw (s) | Spread (°) |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
        '| aeg | AEG Rifle | rifle | 1.1 | 0.28 | 15 | 30 | 5 | 2 | 0.5 | 0.4 |',
        '| pistol | Gas Pistol | pistol | 0.6 | 0.2 | 8 | 20 | 3 | 1 | 0.2 | 0.7 |',
      ].join('\n'),
    );
    const file = loadStats(text);
    const missing = file.errors.filter((e) => e.includes('Recoil (°)'));
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatch(/^line \d+: the Replicas table has no "Recoil \(°\)" column/);
    expect(file.errors.filter((e) => e.startsWith('line'))).toHaveLength(1);
    const aeg = withStats({ ...AEG, siteClass: 'rifle' }, file);
    const pistol = withStats({ ...GAS_PISTOL, siteClass: 'pistol' }, file);
    expect([aeg.recoilDeg, pistol.recoilDeg]).toEqual([AEG.recoilDeg, GAS_PISTOL.recoilDeg]);
    expect([aeg.muzzleEnergy, pistol.muzzleEnergy, pistol.magSize]).toEqual([1.1, 0.6, 20]);
  });

  it('reports a missing table once and falls back to the built-in numbers, never throwing', () => {
    const none = loadStats('# nothing here');
    expect(() => loadStats('')).not.toThrow();
    for (const name of ['Replicas', 'Power sources', 'Optics', 'Grips', 'Lasers', 'Magazines', 'Tier scaling', 'Site limits'])
      expect(none.errors.filter((e) => e.includes(`"${name}"`)), name).toHaveLength(1);
    expect(none.siteLimits).toEqual({ rifle: 1.2, pistol: 1.0 });
    // The config modules keep every number when the file gives none.
    const r = withStats({ ...AEG, siteClass: 'rifle' }, none);
    expect([r.muzzleEnergy, r.fireRate, r.magSize, r.energyLimit]).toEqual([AEG.muzzleEnergy, AEG.fireRate, AEG.magSize, 1.2]);
  });

  it('reads an optic, grip, laser and magazine cell it can read and leaves the one it cannot, with its line', () => {
    const file = loadStats(
      mini(
        twoRows('## Optics\n| Key | Name | Zoom (×) | Raise time (×) |', '|---|---|---|---|', '| scope2x | 2x Scope | huge | 1.5 |'),
        twoRows('## Grips\n| Key | Name | Handling (×) | Shake (×) |', '|---|---|---|---|', '| vertical | Vertical Grip | 1.1 | 0 |'),
        twoRows('## Lasers\n| Key | Name | Spread (×) |', '|---|---|---|', '| redLaser | Red Laser | 0.7 |'),
        twoRows('## Magazines\n| Key | Name | Capacity (×) | Carried (+) | Reload (×) | Draw (×) | Rattles |', '|---|---|---|---|---|---|---|', '| hiCap | Hi-Cap Magazine | 2 | -2 | 1 | 1 | maybe |'),
      ),
    );
    expect(file.optics.scope2x).toEqual({ raiseScale: 1.5 });
    expect(file.grips.vertical).toEqual({ handlingScale: 1.1 });
    expect(file.lasers.redLaser).toEqual({ spreadScale: 0.7 });
    expect(file.magazines.hiCap).toEqual({ capacity: 2, carried: -2, reloadScale: 1, drawScale: 1 });
    expect(file.errors.some((e) => /^line \d+: Zoom \(×\) must be a number/.test(e))).toBe(true);
    expect(file.errors.some((e) => /^line \d+: Shake \(×\) must be a number from 0.1/.test(e))).toBe(true);
    expect(file.errors.some((e) => /^line \d+: Rattles must be yes or no, not "maybe"/.test(e))).toBe(true);
    // Overlaid on the built-in numbers: the unreadable cell stays as the code has it.
    expect(overlay(OPTICS, file.optics).scope2x).toMatchObject({ zoom: OPTICS.scope2x.zoom, raiseScale: 1.5 });
    expect(overlay(GRIPS, file.grips).vertical).toMatchObject({ shakeScale: GRIPS.vertical.shakeScale, handlingScale: 1.1 });
    expect(overlay(MAGAZINES, file.magazines).hiCap!.rattles).toBe(MAGAZINES.hiCap.rattles);
  });

  it('reports a bad site limit or class and keeps going, and a replica without a limit for its class is uncapped', () => {
    const file = loadStats(mini('## Site limits\n| Class | Limit (J) |\n|---|---|\n| rifle | cheap |\n| Pistol! | 1 |\n| smg | 0.9 |\n| smg | 0.8 |'));
    expect(file.errors.filter((e) => /^line \d+: /.test(e)).length).toBe(3);
    expect(file.siteLimits).toEqual({ smg: 0.9 });
    // A class neither the file nor the built-in limits know: no cap rather than a crash.
    expect(withStats({ ...AEG, siteClass: 'sniper' }, loadStats('')).energyLimit).toBe(Number.POSITIVE_INFINITY);
  });

  it('does not let a power source with an unreadable cell change anything: that stat reads as no change', () => {
    const file = loadStats(mini('## Power sources\n| ID | Name | Energy % | Fire rate % | Recoil % |\n|---|---|---|---|---|\n| 000009 | Black Gas | lots | 0 | 20 |'));
    expect(file.power['000009']).toEqual({ energy: 0, fireRate: 0, recoil: 0.2 });
    expect(file.errors.some((e) => /^line 4: Energy % must be a number/.test(e))).toBe(true);
  });
});

describe('stats.md, acceptance 7: bots carry each replica as it comes', () => {
  it("gives a bot the stats.md replicas at Common, under the site limit, with the file's magazines", () => {
    const bot = createCharacter(1, { x: 0, y: 0, z: 0 }, 0);
    expect(bot.armament.replicas.map((r) => r.id)).toEqual(['aeg', 'pistol']);
    expect(bot.armament.replicas[0]!.muzzleEnergy).toBe(stats.replicas.aeg!.muzzleEnergy);
    expect(bot.armament.replicas[1]!.fireRate).toBe(stats.replicas.pistol!.fireRate);
    for (const r of bot.armament.replicas) expect(r.muzzleEnergy).toBeLessThanOrEqual(r.energyLimit);
    const [aegAmmo, pistolAmmo] = bot.armament.ammo;
    expect([aegAmmo!.mag, aegAmmo!.pouch.length + 1]).toEqual([stats.replicas.aeg!.magSize, stats.replicas.aeg!.mags]);
    expect([pistolAmmo!.mag, pistolAmmo!.pouch.length + 1]).toEqual([stats.replicas.pistol!.magSize, stats.replicas.pistol!.mags]);
  });
});

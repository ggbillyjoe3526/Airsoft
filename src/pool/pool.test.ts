import { describe, expect, it } from 'vitest';
import poolText from '../../pool.md?raw';
import { addItem, type Collection, grantStarters, inPool, itemKey, loadCollection, newCollection, ownedItems, parseItemKey, saveCollection } from './collection';
import { shotAssets } from './armory';
import { assetOfReplica, comesIn, DEFAULT_ECONOMY, fcPerToken, fits, hasBuiltInPower, isChase, loadPool, replicaOf, tierId, tiersOf } from './pool';
import { readTables } from './poolFile';
import { MemoryStorage } from './testStorage';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';

const pool = loadPool(poolText);
const byName = (name: string) => pool.assets.find((a) => a.name === name)!;

/** A minimal pool.md around the given asset rows (a Replicas table plus the given tables). */
function mini(extra: string): string {
  return [
    '### Rarity',
    '| Tier | Odds % | Bonus % | Scrap FC |',
    '|---|---|---|---|',
    '| Common | 70 | 0 | 5 |',
    '| Very Rare | 30 | 9 | 40 |',
    '### Replicas',
    '| ID | Name | Key | Tags | Starter | In Shots |',
    '|---|---|---|---|---|---|',
    '| 000001 | Gas Pistol | pistol | pistol, gas | yes | yes |',
    extra,
  ].join('\n');
}

describe('pool.md', () => {
  it('reads without a single problem', () => {
    expect(pool.errors).toEqual([]);
  });

  it("holds the owner's assets with unique six-digit IDs, the first two as he numbered them", () => {
    expect(byName('Gas Pistol').id).toBe('000001');
    expect(byName('AEG Rifle').id).toBe('000002');
    for (const name of ['Standard Battery', 'Green Gas', 'Red Laser', 'Vertical Grip', 'Red Dot', 'Red Gas']) expect(byName(name)).toBeDefined();
    expect(new Set(pool.assets.map((a) => a.id)).size).toBe(pool.assets.length);
  });

  it('starts every player with the AEG Rifle, Gas Pistol, Standard Battery and Green Gas, nothing else', () => {
    expect(pool.assets.filter((a) => a.starter).map((a) => a.name).sort()).toEqual(['AEG Rifle', 'Gas Pistol', 'Green Gas', 'Standard Battery']);
  });

  it('fits by tags: Green Gas on the pistol, the battery on the rifle, the laser on the pistol only', () => {
    const pistol = byName('Gas Pistol');
    const rifle = byName('AEG Rifle');
    expect(fits(byName('Green Gas'), pistol)).toBe(true);
    expect(fits(byName('Green Gas'), rifle)).toBe(false);
    expect(fits(byName('Standard Battery'), rifle)).toBe(true);
    expect(fits(byName('Red Laser'), pistol)).toBe(true);
    expect(fits(byName('Red Laser'), rifle)).toBe(false);
    expect(fits(byName('Red Dot'), rifle)).toBe(true);
    expect(fits(byName('Vertical Grip'), rifle)).toBe(true);
  });

  it('gives every replica a starter power source that fits it, unless its power is built in (then none fits)', () => {
    for (const r of pool.assets.filter((a) => a.category === 'replica')) {
      const power = pool.assets.filter((p) => p.category === 'power' && fits(p, r));
      if (hasBuiltInPower(r)) expect(power).toEqual([]);
      else expect(power.some((p) => p.starter)).toBe(true);
    }
  });

  it('links replica rows to the replicas in code', () => {
    expect(replicaOf(byName('AEG Rifle'))).toBe(AEG);
    expect(assetOfReplica(pool, GAS_PISTOL)?.id).toBe('000001');
  });

  it("matches the shipped economy: the owner's exchange rate (160 FC a Token), three assets a Shot, odds adding to 100", () => {
    expect(pool.economy).toEqual(DEFAULT_ECONOMY);
    expect(fcPerToken(pool.economy)).toBe(160);
    expect(pool.tiers.map((t) => t.id)).toEqual(['common', 'uncommon', 'rare', 'veryRare', 'epic', 'legendary']);
    expect(pool.tiers.reduce((s, t) => s + t.odds, 0)).toBeCloseTo(1, 9);
  });
});

describe('reading pool.md', () => {
  it('skips the examples in fenced blocks', () => {
    const tables = readTables('## A\n```\n| x | y |\n|---|---|\n| 1 | 2 |\n```\n| p | q |\n|---|---|\n| 3 | 4 |');
    expect(tables).toHaveLength(1);
    expect(tables[0]!.rows[0]!.cells).toEqual({ p: '3', q: '4' });
    expect(tables[0]!.heading).toBe('A');
  });

  it('reports a bad row with its line and leaves it out, keeping the rest', () => {
    const p = loadPool(
      mini(
        [
          '### Power sources',
          '| ID | Name | Type | Fits | Starter | In Shots |',
          '|---|---|---|---|---|---|',
          '| 000002 | Green Gas | gas | gas | yes | yes |',
          '| 000003 | Odd Gas | plasma | gas | no | yes |',
          '| 000001 | Copy | gas | gas | no | yes |',
          '| 000004 | Typo Gas | gas | gsa | no | yes |',
          '| 00005 | Short | gas | gas | no | yes |',
        ].join('\n'),
      ),
    );
    expect(p.assets.map((a) => a.name)).toEqual(['Gas Pistol', 'Green Gas']);
    expect(p.errors.some((e) => /^line 14: Type must be battery, gas or spring/.test(e))).toBe(true);
    expect(p.errors.some((e) => /^line 15: ID 000001 is already used by Gas Pistol/.test(e))).toBe(true);
    expect(p.errors.some((e) => /^line 16: Typo Gas fits "gsa", which no replica has/.test(e))).toBe(true);
    expect(p.errors.some((e) => /^line 17: ID must be six digits/.test(e))).toBe(true);
  });

  it('takes tiers in table order, in camel case, and flags odds that miss 100', () => {
    const p = loadPool(mini(''));
    expect(p.tiers.map((t) => t.id)).toEqual(['common', 'veryRare']);
    expect(tierId('Very Rare')).toBe('veryRare');
    const bad = loadPool(mini('').replace('| 30 |', '| 20 |'));
    expect(bad.errors.some((e) => e.includes('add up to 90'))).toBe(true);
  });

  it('falls back to the built-in economy when its tables are missing, and says so', () => {
    const p = loadPool(mini(''));
    expect(p.economy.earn).toEqual(DEFAULT_ECONOMY.earn);
    expect(p.errors.some((e) => e.includes('"Field Credits"'))).toBe(true);
  });

  it('flags a power source that fits replicas driven another way, and a row listed twice', () => {
    const p = loadPool(
      mini(
        [
          '### Power sources',
          '| ID | Name | Type | Fits | Starter | In Shots |',
          '|---|---|---|---|---|---|',
          '| 000002 | Odd Battery | battery | gas | no | yes |',
          '### Field Credits',
          '| Event | FC |',
          '|---|---|',
          '| Hit on an opponent | 5 |',
          '| Hit on an opponent | 50 |',
        ].join('\n'),
      ),
    );
    expect(p.errors.some((e) => e.includes('Odd Battery is a battery, so it fits "electric" replicas, not "gas"'))).toBe(true);
    expect(p.errors.some((e) => e.includes('"Hit on an opponent" is listed twice'))).toBe(true);
    expect(p.economy.earn.hit).toBe(5);
  });

  it('reads the tiers from the Tier table even with another table above it under Rarity', () => {
    const p = loadPool(mini('').replace('### Rarity', '### Rarity\n| Category | Means |\n|---|---|\n| Replica | tighter |\n'));
    expect(p.tiers.map((t) => t.id)).toEqual(['common', 'veryRare']);
  });

  it('rejects a Key the code has no behaviour for', () => {
    const p = loadPool(mini('### Optics\n| ID | Name | Key | Fits | Starter | In Shots |\n|---|---|---|---|---|---|\n| 000009 | Holo | holo | pistol | no | yes |'));
    expect(p.errors.some((e) => e.includes('"holo" isn\'t a optic Key'))).toBe(true);
  });
});

describe('collection', () => {
  it('starts with the starters at Common', () => {
    const c = newCollection(pool, 7);
    expect(ownedItems(c, pool).map((i) => `${pool.byId.get(i.asset)!.name}@${i.tier}`).sort()).toEqual([
      'AEG Rifle@common',
      'Gas Pistol@common',
      'Green Gas@common',
      'Standard Battery@common',
    ]);
    expect(c.fc).toBe(0);
    expect(c.tokens).toBe(0);
  });

  it('saves and loads, keeping counts, currency and the draw seed; garbage is ignored', () => {
    const storage = new MemoryStorage();
    const c = newCollection(pool, 7);
    addItem(c, { asset: '000006', tier: 'epic' }, 3);
    c.fc = 120;
    c.tokens = 2;
    saveCollection(c, storage);
    expect(loadCollection(pool, 1, storage)).toEqual(c);
    storage.setItem('airsoft.collection', '{"version":1,"owned":{"x":1,"000006@rare":-2,"000006@epic":2.5},"fc":"lots"}');
    const junk = loadCollection(pool, 1, storage);
    expect(junk.owned['000006@rare']).toBeUndefined();
    expect(junk.fc).toBe(0);
    expect(junk.owned[itemKey('000002', 'common')]).toBe(1);
  });

  it("gives an existing save a starter it doesn't have, but not a second copy of one it has at a higher tier", () => {
    const c: Collection = { owned: { '000002@epic': 1 }, fc: 0, tokens: 0, seed: 0 };
    grantStarters(c, pool);
    expect(c.owned['000002@common']).toBeUndefined();
    expect(c.owned['000001@common']).toBe(1);
  });

  it('reads item keys', () => {
    expect(parseItemKey('000002@veryRare')).toEqual({ asset: '000002', tier: 'veryRare' });
    expect(parseItemKey('2@epic')).toBeNull();
  });
});

describe('pool.md, barrels and muzzle parts (M29b)', () => {
  it('lists the Tight-Bore Barrel (000016), Long Barrel (000017) and Silencer (000018) under their own sections, from Shots and not starters', () => {
    const expected = [
      ['000016', 'Tight-Bore Barrel', 'barrel', 'tightBore'],
      ['000017', 'Long Barrel', 'barrel', 'long'],
      ['000018', 'Silencer', 'muzzle', 'silencer'],
    ] as const;
    const inShots = new Set(shotAssets(pool).map((a) => a.id));
    for (const [id, name, category, key] of expected) {
      const a = pool.byId.get(id)!;
      expect(a, id).toBeDefined();
      expect([a.name, a.category, a.key], id).toEqual([name, category, key]);
      expect(a.starter, name).toBe(false);
      expect(a.inShots, name).toBe(true);
      expect(inShots.has(id), name).toBe(true);
    }
  });

  it('tags the AEG for a swappable barrel and both replicas for a muzzle thread, and fits by those tags', () => {
    const aeg = byName('AEG Rifle');
    const pistol = byName('Gas Pistol');
    expect(aeg.tags).toEqual(expect.arrayContaining(['barrel-mount', 'muzzle-thread']));
    expect(pistol.tags).toContain('muzzle-thread');
    expect(pistol.tags).not.toContain('barrel-mount');
    for (const barrel of ['Tight-Bore Barrel', 'Long Barrel']) {
      expect(byName(barrel).tags).toEqual(['barrel-mount']);
      expect(fits(byName(barrel), aeg)).toBe(true);
      expect(fits(byName(barrel), pistol)).toBe(false);
    }
    expect(byName('Silencer').tags).toEqual(['muzzle-thread']);
    expect(fits(byName('Silencer'), aeg) && fits(byName('Silencer'), pistol)).toBe(true);
  });

  it('reads Barrels and Muzzle parts sections from a file and rejects a Key the code has no behaviour for there', () => {
    const p = loadPool(mini('| 000002 | AEG Rifle | aeg | rifle, electric, barrel-mount, muzzle-thread | yes | yes |\n### Barrels\n| ID | Name | Key | Fits | Starter | In Shots |\n|---|---|---|---|---|---|\n| 000016 | Tight | tightBore | barrel-mount | no | yes |\n| 000019 | Wobbly | wobbly | barrel-mount | no | yes |\n### Muzzle parts\n| ID | Name | Key | Fits | Starter | In Shots |\n|---|---|---|---|---|---|\n| 000018 | Silencer | silencer | muzzle-thread | no | yes |'));
    expect(p.assets.filter((a) => a.category === 'barrel').map((a) => a.id)).toEqual(['000016']);
    expect(p.assets.filter((a) => a.category === 'muzzle').map((a) => a.id)).toEqual(['000018']);
    expect(p.errors.some((e) => /wobbly/.test(e))).toBe(true);
  });
});

describe('M32 acceptance 1: the Cyber Pistol row and the Tiers and Drop % columns', () => {
  /** A pool.md with a Replicas table that has the two new columns, one row per entry (line 11 is the first extra row). */
  const chaseText = (...rows: string[]): string =>
    [
      '### Rarity',
      '| Tier | Odds % | Bonus % | Scrap FC |',
      '|---|---|---|---|',
      '| Common | 60 | 0 | 5 |',
      '| Very Rare | 30 | 9 | 40 |',
      '| Legendary | 10 | 15 | 160 |',
      '### Replicas',
      '| ID | Name | Key | Tags | Starter | In Shots | Tiers | Drop % |',
      '|---|---|---|---|---|---|---|---|',
      '| 000001 | Gas Pistol | pistol | pistol, gas | yes | yes | | |',
      ...rows,
    ].join('\n');
  const FIRST_ROW_LINE = 11;
  /** Only the row errors (a fixture without the other tables gets a note for each of those). */
  const rowErrors = (p: { errors: readonly string[] }): string[] => p.errors.filter((e) => e.startsWith('line '));

  it('lists the Cyber Pistol as 000019, key cyber, at Legendary only, on a 0.25 % drop, with its battery built in', () => {
    const cyber = byName('Cyber Pistol');
    expect(cyber.id).toBe('000019');
    expect(cyber.key).toBe('cyber');
    expect(cyber.category).toBe('replica');
    expect(cyber.tiers).toEqual(['legendary']);
    expect(cyber.dropChance).toBeCloseTo(0.0025, 10);
    expect(cyber.starter).toBe(false);
    expect(cyber.inShots).toBe(true);
    expect(isChase(cyber)).toBe(true);
    expect(hasBuiltInPower(cyber)).toBe(true);
    expect(replicaOf(cyber)).toBe(CYBER_PISTOL);
    expect(assetOfReplica(pool, CYBER_PISTOL)).toBe(cyber);
    // No power source fits it, and no other asset is a chase item or has tiers of its own.
    expect(pool.assets.filter((a) => a.category === 'power' && fits(a, cyber))).toEqual([]);
    for (const a of pool.assets.filter((x) => x !== cyber)) {
      expect(a.tiers, a.name).toBeUndefined();
      expect(a.dropChance, a.name).toBeUndefined();
      expect(isChase(a), a.name).toBe(false);
    }
    expect(pool.errors).toEqual([]);
  });

  it('reads Tiers (in the Rarity order, whatever order they are typed in) and Drop % into the asset', () => {
    const p = loadPool(chaseText('| 000002 | Chase | aeg | rifle, electric | no | yes | Legendary, Very Rare | 2.5 |'));
    expect(rowErrors(p)).toEqual([]);
    const a = p.byId.get('000002')!;
    expect(a.tiers).toEqual(['veryRare', 'legendary']);
    expect(a.dropChance).toBeCloseTo(0.025, 10);
    expect(tiersOf(p, a).map((t) => t.id)).toEqual(['veryRare', 'legendary']);
    expect(comesIn(a, 'veryRare')).toBe(true);
    expect(comesIn(a, 'common')).toBe(false);
  });

  it('changes nothing for blank Tiers and Drop % cells: every tier, no chase, the even draw', () => {
    const p = loadPool(chaseText());
    const gas = p.byId.get('000001')!;
    expect(rowErrors(p)).toEqual([]);
    expect('tiers' in gas).toBe(false);
    expect('dropChance' in gas).toBe(false);
    expect(isChase(gas)).toBe(false);
    expect(tiersOf(p, gas)).toBe(p.tiers);
    for (const t of p.tiers) expect(comesIn(gas, t.id)).toBe(true);
    // A table without the two columns at all reads the same.
    const plain = loadPool(chaseText().replace(' | Tiers | Drop % |', ' |').replace('|---|---|---|---|---|---|---|---|', '|---|---|---|---|---|---|').replace(' | | |', ' |'));
    expect(rowErrors(plain)).toEqual([]);
    expect(plain.byId.get('000001')).toEqual(gas);
  });

  it('reports a tier name not in the Rarity table with its line, and leaves that row out', () => {
    const p = loadPool(chaseText('| 000002 | Typo | aeg | rifle, electric | no | yes | Mythic | |', '| 000003 | Half | aeg | rifle, electric | no | yes | Legendary, Mythic | 1 |', '| 000004 | Fine | aeg | rifle, electric | no | yes | Legendary | 1 |'));
    expect(p.assets.map((a) => a.name)).toEqual(['Gas Pistol', 'Fine']);
    const errors = rowErrors(p);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(new RegExp(`^line ${FIRST_ROW_LINE}: .*Mythic`));
    expect(errors[1]).toMatch(new RegExp(`^line ${FIRST_ROW_LINE + 1}: .*Mythic`));
  });

  it('reports a Drop % that is not a number from 0 to 100 with its line, and leaves that row out', () => {
    const p = loadPool(chaseText('| 000002 | Words | aeg | rifle, electric | no | yes | Legendary | lots |', '| 000003 | Over | aeg | rifle, electric | no | yes | Legendary | 150 |', '| 000004 | Under | aeg | rifle, electric | no | yes | Legendary | -1 |', '| 000005 | Fine | aeg | rifle, electric | no | yes | Legendary | 0.25 |'));
    expect(p.assets.map((a) => a.name)).toEqual(['Gas Pistol', 'Fine']);
    const errors = rowErrors(p);
    expect(errors).toHaveLength(3);
    for (const [i, e] of errors.entries()) expect(e).toMatch(new RegExp(`^line ${FIRST_ROW_LINE + i}: .*Drop %`));
  });

  it('keeps an asset that is in the pool only in a tier it comes in, and gives a chase starter its lowest tier', () => {
    const p = loadPool(chaseText('| 000002 | Chase | aeg | rifle, electric | yes | yes | Legendary | 1 |'));
    const chase = '000002';
    expect(inPool(p, { asset: chase, tier: 'legendary' })).toBe(true);
    expect(inPool(p, { asset: chase, tier: 'common' })).toBe(false);
    expect(inPool(p, { asset: chase, tier: 'veryRare' })).toBe(false);
    expect(inPool(p, { asset: '000001', tier: 'common' })).toBe(true);
    expect(inPool(p, { asset: '000001', tier: 'nope' })).toBe(false);
    const c = newCollection(p, 1);
    expect(c.owned[itemKey(chase, 'legendary')]).toBe(1);
    expect(c.owned[itemKey(chase, 'common')]).toBeUndefined();
    // An existing save that already holds one at a tier it comes in is not given a second.
    const save: Collection = { owned: { [itemKey(chase, 'legendary')]: 1 }, fc: 0, tokens: 0, seed: 0 };
    grantStarters(save, p);
    expect(save.owned[itemKey(chase, 'legendary')]).toBe(1);
    expect(save.owned[itemKey('000001', 'common')]).toBe(1);
  });
});

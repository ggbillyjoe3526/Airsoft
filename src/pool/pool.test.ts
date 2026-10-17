import { describe, expect, it } from 'vitest';
import poolText from '../../data/pool.md?raw';
import { inPool, itemKey, parseItemKey } from './item';
import { assetOfReplica, fits, hasBuiltInPower, loadPool, replicaOf } from './pool';
import { readTables } from './poolFile';
import { AEG, CYBER_PISTOL, GAS_PISTOL } from '../config/replicas';
import { loadLevels } from '../progress/levels';
import levelsText from '../../data/levels.md?raw';

const pool = loadPool(poolText);
const byName = (name: string) => pool.assets.find((a) => a.name === name)!;
/** levels.md read against this pool: the level 0 kit is what every player starts with (LV1). */
const levels = loadLevels(levelsText, pool);
const startKit = new Set(levels.levels[0]!.unlocks);

/** A minimal pool.md around the given asset rows (a Replicas table plus the given tables). */
function mini(extra: string): string {
  return [
    '### Replicas',
    '| ID | Name | Key | Tags |',
    '|---|---|---|---|',
    '| 000001 | GBB Pistol | pistol | pistol, gas |',
    extra,
  ].join('\n');
}

describe('pool.md', () => {
  it('reads without a single problem', () => {
    expect(pool.errors).toEqual([]);
  });

  it("holds the owner's assets with unique six-digit IDs, the first two as he numbered them", () => {
    expect(byName('GBB Pistol').id).toBe('000001');
    expect(byName('AEG Rifle').id).toBe('000002');
    for (const name of ['Standard Battery', 'Green Gas', 'Red Laser', 'Vertical Grip', 'Red Dot', 'Red Gas']) expect(byName(name)).toBeDefined();
    expect(new Set(pool.assets.map((a) => a.id)).size).toBe(pool.assets.length);
  });

  it('keeps every ID it shipped with as RV1 took the supply events out, each on its asset (IDs are save keys)', () => {
    const shipped: [string, string][] = [
      ['000001', 'GBB Pistol'],
      ['000002', 'AEG Rifle'],
      ['000003', 'Standard Battery'],
      ['000004', 'Green Gas'],
      ['000005', 'Red Laser'],
      ['000006', 'Vertical Grip'],
      ['000007', 'Red Dot'],
      ['000008', 'Red Gas'],
      ['000009', 'Black Gas'],
      ['000010', '2x Scope'],
      ['000011', 'Angled Grip'],
      ['000012', 'Hi-Cap Magazine'],
      ['000013', 'Low-Cap Magazine'],
      ['000014', 'Extended Magazine'],
      ['000015', '11.1 V LiPo Battery'],
      ['000016', 'Tight-Bore Barrel'],
      ['000017', 'Long Barrel'],
      ['000018', 'Silencer'],
      ['000019', 'Cyber Pistol'],
      ['000020', 'Weapon Torch'],
    ];
    for (const [id, name] of shipped) expect(pool.byId.get(id)?.name, id).toBe(name);
  });

  it('starts every player with the AEG Rifle, GBB Pistol, Standard Battery, Green Gas and the (dev) Weapon Torch, nothing else', () => {
    expect(pool.assets.filter((a) => startKit.has(a.id)).map((a) => a.name).sort()).toEqual(['AEG Rifle', 'GBB Pistol', 'Green Gas', 'Standard Battery', 'Weapon Torch']);
  });

  it('fits by tags: Green Gas on the pistol, the battery on the rifle, the laser on the pistol only', () => {
    const pistol = byName('GBB Pistol');
    const rifle = byName('AEG Rifle');
    expect(fits(byName('Green Gas'), pistol)).toBe(true);
    expect(fits(byName('Green Gas'), rifle)).toBe(false);
    expect(fits(byName('Standard Battery'), rifle)).toBe(true);
    expect(fits(byName('Red Laser'), pistol)).toBe(true);
    expect(fits(byName('Red Laser'), rifle)).toBe(false);
    expect(fits(byName('Red Dot'), rifle)).toBe(true);
    expect(fits(byName('Vertical Grip'), rifle)).toBe(true);
  });

  it('gives every replica a level 0 power source that fits it, unless its power is built in (then none fits)', () => {
    for (const r of pool.assets.filter((a) => a.category === 'replica')) {
      const power = pool.assets.filter((p) => p.category === 'power' && fits(p, r));
      if (hasBuiltInPower(r)) expect(power).toEqual([]);
      else expect(power.some((p) => startKit.has(p.id))).toBe(true);
    }
  });

  it('links replica rows to the replicas in code', () => {
    expect(replicaOf(byName('AEG Rifle'))).toBe(AEG);
    expect(assetOfReplica(pool, GAS_PISTOL)?.id).toBe('000001');
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
          '| ID | Name | Type | Fits |',
          '|---|---|---|---|',
          '| 000002 | Green Gas | gas | gas |',
          '| 000003 | Odd Gas | plasma | gas |',
          '| 000001 | Copy | gas | gas |',
          '| 000004 | Typo Gas | gas | gsa |',
          '| 00005 | Short | gas | gas |',
        ].join('\n'),
      ),
    );
    expect(p.assets.map((a) => a.name)).toEqual(['GBB Pistol', 'Green Gas']);
    expect(p.errors.some((e) => /^line 9: Type must be battery, gas or spring/.test(e))).toBe(true);
    expect(p.errors.some((e) => /^line 10: ID 000001 is already used by GBB Pistol/.test(e))).toBe(true);
    expect(p.errors.some((e) => /^line 11: Typo Gas fits "gsa", which no replica has/.test(e))).toBe(true);
    expect(p.errors.some((e) => /^line 12: ID must be six digits/.test(e))).toBe(true);
  });

  it('flags a power source that fits replicas driven another way, and leaves it out', () => {
    const p = loadPool(mini(['### Power sources', '| ID | Name | Type | Fits |', '|---|---|---|---|', '| 000002 | Odd Battery | battery | gas |'].join('\n')));
    expect(p.errors.some((e) => e.includes('Odd Battery is a battery, so it fits "electric" replicas, not "gas"'))).toBe(true);
    expect(p.byId.has('000002')).toBe(false);
  });

  it('reads no economy, rarity or cache-part columns: a pool.md without them has no errors about them (LV1)', () => {
    const p = loadPool(mini(''));
    expect(p.errors.filter((e) => /Rarity|Field Credits|Tokens|Shots|Tier/.test(e))).toEqual([]);
    expect(Object.keys(p).sort()).toEqual(['assets', 'byId', 'caseKinds', 'errors']);
  });

  it('ignores a leftover Supply events table in a pool.md edited before RV1: no error, no asset, no event field', () => {
    const stale = ['### Supply events', '| Supply event | Key | When | XP % |', '|---|---|---|---|', '| Supply weekend | supply-weekend | Friday to Sunday | 125 |'].join('\n');
    const p = loadPool(mini(stale));
    expect(p.errors).toEqual(loadPool(mini('')).errors);
    expect(p.assets.map((a) => a.id)).toEqual(['000001']);
    expect('supplyEvents' in p).toBe(false);
  });

  it('rejects a Key the code has no behaviour for', () => {
    const p = loadPool(mini('### Optics\n| ID | Name | Key | Fits |\n|---|---|---|---|\n| 000009 | Holo | holo | pistol |'));
    expect(p.errors.some((e) => e.includes('"holo" isn\'t a optic Key'))).toBe(true);
  });
});

describe('items (LV1: one of each, no rarity)', () => {
  it('saves a pick as its asset id and reads it back', () => {
    expect(itemKey({ asset: '000002' })).toBe('000002');
    expect(parseItemKey(itemKey({ asset: '000002' }))).toEqual({ asset: '000002' });
  });

  it("reads a pick saved before LV1 with its rarity tier, dropping the tier, and refuses what isn't an item", () => {
    expect(parseItemKey('000002@veryRare')).toEqual({ asset: '000002' });
    expect(parseItemKey('000007@legendary')).toEqual({ asset: '000007' });
    expect(parseItemKey('2@epic')).toBeNull();
    expect(parseItemKey('000002@')).toBeNull();
    expect(parseItemKey('none')).toBeNull();
  });

  it('keeps an item in the pool while pool.md lists its asset', () => {
    expect(inPool(pool, { asset: '000019' })).toBe(true);
    expect(inPool(pool, { asset: '999999' })).toBe(false);
  });
});

describe('pool.md, barrels and muzzle parts (M29b)', () => {
  it('lists the Tight-Bore Barrel (000016), Long Barrel (000017) and Silencer (000018) under their own sections, unlocked by a level, not at the start', () => {
    const expected = [
      ['000016', 'Tight-Bore Barrel', 'barrel', 'tightBore'],
      ['000017', 'Long Barrel', 'barrel', 'long'],
      ['000018', 'Silencer', 'muzzle', 'silencer'],
    ] as const;
    for (const [id, name, category, key] of expected) {
      const a = pool.byId.get(id)!;
      expect(a, id).toBeDefined();
      expect([a.name, a.category, a.key], id).toEqual([name, category, key]);
      expect(levels.unlockLevel.get(id), name).toBeGreaterThan(0);
    }
  });

  it('tags the AEG for a swappable barrel and both replicas for a muzzle thread, and fits by those tags', () => {
    const aeg = byName('AEG Rifle');
    const pistol = byName('GBB Pistol');
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
    const p = loadPool(mini('| 000002 | AEG Rifle | aeg | rifle, electric, barrel-mount, muzzle-thread |\n### Barrels\n| ID | Name | Key | Fits |\n|---|---|---|---|\n| 000016 | Tight | tightBore | barrel-mount |\n| 000019 | Wobbly | wobbly | barrel-mount |\n### Muzzle parts\n| ID | Name | Key | Fits |\n|---|---|---|---|\n| 000018 | Silencer | silencer | muzzle-thread |'));
    expect(p.assets.filter((a) => a.category === 'barrel').map((a) => a.id)).toEqual(['000016']);
    expect(p.assets.filter((a) => a.category === 'muzzle').map((a) => a.id)).toEqual(['000018']);
    expect(p.errors.some((e) => /wobbly/.test(e))).toBe(true);
  });
});

describe('pool.md, mistakes the owner could make by hand (audit POOL-06, POOL-18, POOL-19)', () => {
  it('names a column header used twice, a row with too many cells, a mis-cased heading and a Name used twice', () => {
    const p = loadPool(
      mini(
        [
          '### Power Sources',
          '| ID | Name | Type | Fits |',
          '|---|---|---|---|',
          '| 000002 | Green Gas | gas | gas |',
          '### Optics',
          '| ID | Name | Key | Fits | Access | Access |',
          '|---|---|---|---|---|---|',
          '| 000007 | Red Dot | redDot | pistol | public | public |',
          '| 000010 | Red Dot | scope2x | pistol | public | public | extra |',
        ].join('\n'),
      ),
    );
    expect(p.errors).toContain('line 6: "Power Sources" should be "Power sources" (headings are read exactly)');
    expect(p.errors).toContain('line 10: column "Access" appears twice');
    expect(p.errors).toContain('line 13: row has 7 cells, the header 6');
    expect(p.errors).toContain('line 13: the Name "Red Dot" is already used by 000007');
  });

  it('reads an escaped pipe as part of a cell', () => {
    const t = readTables('| a | b |\n|---|---|\n| x \\| y | z |')[0]!;
    expect(t.rows[0]!.cells).toEqual({ a: 'x | y', b: 'z' });
    expect(t.problems).toEqual([]);
  });

  it('names rows a blank line cut off from their table, once per run, and never rows after prose or a heading (BP5)', () => {
    const t = readTables(['## A', '| a | b |', '|---|---|', '| 1 | 2 |', '', '| 3 | 4 |', '| 5 | 6 |', '', '', '| 7 | 8 |'].join('\n'))[0]!;
    expect(t.rows.map((r) => r.cells.a)).toEqual(['1']);
    expect(t.problems).toEqual([
      { line: 6, message: 'row outside its table, so it and the rows after it are not read: a blank line ends a table' },
      { line: 10, message: 'row outside its table, so it and the rows after it are not read: a blank line ends a table' },
    ]);
    // Prose or a heading between: the line is something else, not the table's.
    for (const between of ['A note.', '## B']) {
      const [first] = readTables(['## A', '| a | b |', '|---|---|', '| 1 | 2 |', '', between, '| 3 | 4 |'].join('\n'));
      expect(first!.problems, between).toEqual([]);
    }
    // A second table after a blank line is a table, not stray rows.
    const two = readTables(['| a | b |', '|---|---|', '| 1 | 2 |', '', '| c | d |', '|---|---|', '| 3 | 4 |'].join('\n'));
    expect(two.map((x) => x.problems)).toEqual([[], []]);
    expect(two[1]!.rows[0]!.cells).toEqual({ c: '3', d: '4' });
  });
});

describe('pool.md, the Access column (M35)', () => {
  /** The errors that are about an asset row, not the missing tables of a small pool. */
  const rowErrors = (p: { errors: readonly string[] }): string[] => p.errors.filter((e) => !e.startsWith('no "'));
  const rows = (...r: string[]): string =>
    mini(['### Power sources', '| ID | Name | Type | Fits | Access |', '|---|---|---|---|---|', ...r].join('\n'));

  it('reads a blank Access as public, dev and DEV as dev, and public as public', () => {
    const p = loadPool(
      rows(
        '| 000002 | Green Gas | gas | gas | |',
        '| 000003 | Dev Gas | gas | gas | dev |',
        '| 000004 | Loud Gas | gas | gas | DEV |',
        '| 000005 | Open Gas | gas | gas | Public |',
      ),
    );
    expect(rowErrors(p)).toEqual([]);
    const tag = (name: string) => p.assets.find((a) => a.name === name)?.tag;
    expect(tag('Green Gas')).toBe('public');
    expect(tag('Dev Gas')).toBe('dev');
    expect(tag('Loud Gas')).toBe('dev');
    expect(tag('Open Gas')).toBe('public');
  });

  it('reads a table with no Access column as public', () => {
    const p = loadPool(mini(''));
    expect(rowErrors(p)).toEqual([]);
    expect(p.assets.map((a) => a.tag)).toEqual(['public']);
  });

  it('leaves a row with a bad Access word out and names its line, so a typo never makes a dev asset public', () => {
    const p = loadPool(rows('| 000002 | Green Gas | gas | gas | |', '| 000003 | Typo Gas | gas | gas | devv |'));
    expect(p.assets.map((a) => a.name)).toEqual(['GBB Pistol', 'Green Gas']);
    expect(rowErrors(p)).toHaveLength(1);
    expect(rowErrors(p)[0]).toMatch(/^line 9: Access must be public or dev, not "devv"/);
  });

  it('has every asset in the real pool.md public today but the Weapon Torch (dev, M33h), and no errors', () => {
    expect(pool.errors).toEqual([]);
    expect(pool.assets.length).toBeGreaterThan(0);
    expect(pool.assets.filter((a) => a.tag !== 'public').map((a) => a.name)).toEqual(['Weapon Torch']);
  });
});

describe("the Cyber Pistol row (M32; LV1: the level cap's unlock)", () => {
  it('lists the Cyber Pistol as 000019, key cyber, with its battery built in, unlocked at the top level', () => {
    const cyber = byName('Cyber Pistol');
    expect(cyber.id).toBe('000019');
    expect(cyber.key).toBe('cyber');
    expect(cyber.category).toBe('replica');
    expect(hasBuiltInPower(cyber)).toBe(true);
    expect(replicaOf(cyber)).toBe(CYBER_PISTOL);
    expect(assetOfReplica(pool, CYBER_PISTOL)).toBe(cyber);
    // No power source fits it.
    expect(pool.assets.filter((a) => a.category === 'power' && fits(a, cyber))).toEqual([]);
    expect(levels.unlockLevel.get(cyber.id)).toBe(levels.cap);
    expect(pool.errors).toEqual([]);
  });
});

describe('pool.md, plausibility guards (M56, audit POOL-06)', () => {
  /**
   * Every shipped ID and the asset it stands for (audit POOL-06). IDs are save keys (the unlocked items, the Loadout's
   * picks, fits by ID): renumbering a row would hand every player whatever now holds the ID. A new row
   * appends the next ID here; a removed row's ID stays out of pool.md and is never reused; a rename changes only its
   * Name here. 000021 is the guide's example battery and stays free.
   */
  it('pins every shipped pool ID to its asset', () => {
    expect(Object.fromEntries(pool.assets.map((a) => [a.id, a.name]))).toEqual({
      '000001': 'GBB Pistol',
      '000002': 'AEG Rifle',
      '000003': 'Standard Battery',
      '000004': 'Green Gas',
      '000005': 'Red Laser',
      '000006': 'Vertical Grip',
      '000007': 'Red Dot',
      '000008': 'Red Gas',
      '000009': 'Black Gas',
      '000010': '2x Scope',
      '000011': 'Angled Grip',
      '000012': 'Hi-Cap Magazine',
      '000013': 'Low-Cap Magazine',
      '000014': 'Extended Magazine',
      '000015': '11.1 V LiPo Battery',
      '000016': 'Tight-Bore Barrel',
      '000017': 'Long Barrel',
      '000018': 'Silencer',
      '000019': 'Cyber Pistol',
      '000020': 'Weapon Torch',
    });
  });
});

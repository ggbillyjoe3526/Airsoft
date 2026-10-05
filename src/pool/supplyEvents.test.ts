import { describe, expect, it } from 'vitest';
import poolText from '../../pool.md?raw';
import { vec3 } from '../sim/vec';
import { type CaseSpotLike, rollRunCases } from './caches';
import { loadPool } from './pool';
import { activeSupplyEvent, isOn, kindsUnder, readWhen, type SupplyEvent, supplyLine } from './supplyEvents';

const pool = loadPool(poolText);

/** Local dates (the device's clock): 2026-10-09 is a Friday, 2026-10-12 a Monday. */
const at = (y: number, m: number, d: number, h = 12): Date => new Date(y, m - 1, d, h);

const event = (over: Partial<SupplyEvent>): SupplyEvent => ({ name: 'Test', key: 'test', when: { weekly: { from: 5, to: 0 } }, fc: 1, parts: 1, ...over });

/** Depot-like spots: two for the locker, field cases on five, ammo cans on nine. */
const SPOTS: CaseSpotLike[] = [
  ['locker', 'field-case'],
  ['locker', 'field-case'],
  ['field-case', 'ammo-can'],
  ['field-case', 'ammo-can'],
  ['ammo-can'],
  ['ammo-can', 'field-case'],
  ['ammo-can', 'field-case'],
  ['ammo-can'],
  ['ammo-can'],
  ['ammo-can'],
  ['ammo-can'],
].map((kinds, i) => ({ position: vec3(i * 3, 0, 0), yaw: 0, kinds }));

describe("pool.md's Supply events table (M49)", () => {
  it('reads the shipped events without a problem: the Halloween run above the weekly Supply weekend', () => {
    expect(pool.errors).toEqual([]);
    expect(pool.supplyEvents.map((e) => [e.key, e.when, e.fc, e.parts])).toEqual([
      ['halloween-2026', { dated: { from: '2026-10-30', to: '2026-11-01' } }, 1.5, 2],
      ['supply-weekend', { weekly: { from: 5, to: 0 } }, 1.25, 1.5],
    ]);
  });

  it('reads weekdays (each week) and dates (one-off, a date alone is one day), and nothing else', () => {
    expect(readWhen('Friday to Sunday')).toEqual({ weekly: { from: 5, to: 0 } });
    expect(readWhen('fridays - sundays')).toEqual({ weekly: { from: 5, to: 0 } });
    expect(readWhen('Wednesday')).toEqual({ weekly: { from: 3, to: 3 } });
    expect(readWhen('2026-10-30 to 2026-11-01')).toEqual({ dated: { from: '2026-10-30', to: '2026-11-01' } });
    expect(readWhen('2026-12-25')).toEqual({ dated: { from: '2026-12-25', to: '2026-12-25' } });
    for (const bad of ['', 'weekends', '2026-11-01 to 2026-10-30', '2026-02-30', '30/10/2026', 'Friday to 2026-10-30', 'Friday to Sunday to Monday']) {
      expect(readWhen(bad), bad).toBeUndefined();
    }
  });

  it('leaves out a row it cannot read, naming its line and what is wrong; no table means no events', () => {
    const head = ['### Supply events', '| Supply event | Key | When | FC % | Part % |', '|---|---|---|---|---|'];
    const read = loadPool(
      [...head, '| Fine | fine | Saturday | 110 | 100 |', '| Bad day | bad-day | Funday | 110 | 100 |', '| Huge | huge | Monday | 5000 | 100 |', '| Again | fine | Monday | 100 | 100 |'].join('\n'),
    );
    expect(read.supplyEvents.map((e) => e.key)).toEqual(['fine']);
    expect(read.errors.some((e) => e.startsWith('line 5') && e.includes('Funday'))).toBe(true);
    expect(read.errors.some((e) => e.startsWith('line 6') && e.includes('FC %'))).toBe(true);
    expect(read.errors.some((e) => e.startsWith('line 7') && e.includes('used twice'))).toBe(true);
    expect(loadPool('### Caches').supplyEvents).toEqual([]);
  });
});

describe('when a supply event is on (M49)', () => {
  it('runs a weekly span from the first day’s start to the last day’s end, across the week’s end', () => {
    const weekend = { weekly: { from: 5, to: 0 } };
    expect(isOn(weekend, at(2026, 10, 8, 23))).toBe(false); // Thursday night
    expect(isOn(weekend, at(2026, 10, 9, 0))).toBe(true); // Friday's first hour
    expect(isOn(weekend, at(2026, 10, 10))).toBe(true); // Saturday
    expect(isOn(weekend, at(2026, 10, 11, 23))).toBe(true); // Sunday's last hour
    expect(isOn(weekend, at(2026, 10, 12, 0))).toBe(false); // Monday
    const midweek = { weekly: { from: 2, to: 4 } };
    expect([at(2026, 10, 12), at(2026, 10, 13), at(2026, 10, 15), at(2026, 10, 16)].map((d) => isOn(midweek, d))).toEqual([false, true, true, false]);
  });

  it('runs a dated span over both its days, by the local date', () => {
    const halloween = { dated: { from: '2026-10-30', to: '2026-11-01' } };
    expect(isOn(halloween, at(2026, 10, 29, 23))).toBe(false);
    expect(isOn(halloween, at(2026, 10, 30, 0))).toBe(true);
    expect(isOn(halloween, at(2026, 11, 1, 23))).toBe(true);
    expect(isOn(halloween, at(2026, 11, 2, 0))).toBe(false);
    expect(isOn(halloween, at(2027, 10, 31))).toBe(false); // that year only
  });

  it('applies the first event on in the table’s order, so the Halloween run takes over its weekend', () => {
    expect(activeSupplyEvent(pool.supplyEvents, at(2026, 10, 7))).toBeNull(); // a Wednesday
    expect(activeSupplyEvent(pool.supplyEvents, at(2026, 10, 10))?.key).toBe('supply-weekend');
    expect(activeSupplyEvent(pool.supplyEvents, at(2026, 10, 31))?.key).toBe('halloween-2026'); // a Saturday
    expect(activeSupplyEvent(pool.supplyEvents, at(2026, 11, 7))?.key).toBe('supply-weekend');
  });
});

describe('what a supply event changes (M49)', () => {
  it('scales every case’s Field Credits and part chance, the chance never past certain, and nothing else', () => {
    const kinds = kindsUnder(pool.caseKinds, event({ fc: 1.25, parts: 1.5 }));
    const by = (key: string) => kinds.find((k) => k.key === key)!;
    expect(by('ammo-can').fc).toEqual({ min: 19, max: 50 });
    expect(by('field-case').fc).toEqual({ min: 50, max: 100 });
    expect(by('field-case').partChance).toBeCloseTo(0.45);
    expect(by('locker').partChance).toBe(1);
    expect(by('ammo-can').partChance).toBe(0);
    for (const k of kinds) {
      const was = pool.caseKinds.find((o) => o.key === k.key)!;
      expect({ ...k, fc: was.fc, partChance: was.partChance }).toEqual(was);
    }
    expect(kindsUnder(pool.caseKinds, null)).toBe(pool.caseKinds);
  });

  it('puts the same cases in the same places on the same seed, holding more Field Credits under an event', () => {
    const weekend = pool.supplyEvents.find((e) => e.key === 'supply-weekend')!;
    const fc = (cases: ReturnType<typeof rollRunCases>): number => cases.reduce((sum, c) => sum + c.find.fc, 0);
    let plainFc = 0;
    let richFc = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const plain = rollRunCases(pool, SPOTS, {}, seed);
      const rich = rollRunCases(pool, SPOTS, {}, seed, weekend);
      expect(rich.map((c) => [c.kind, c.position])).toEqual(plain.map((c) => [c.kind, c.position]));
      plainFc += fc(plain);
      richFc += fc(rich);
      // No event: the run as before M49.
      expect(rollRunCases(pool, SPOTS, {}, seed, null)).toEqual(plain);
    }
    expect(richFc / plainFc).toBeGreaterThan(1.15);
    expect(richFc / plainFc).toBeLessThan(1.35);
  });

  it('turns up parts more often under an event', () => {
    const halloween = pool.supplyEvents.find((e) => e.key === 'halloween-2026')!;
    const parts = (e: SupplyEvent | null): number => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) n += rollRunCases(pool, SPOTS, {}, seed, e).filter((c) => c.kind === 'field-case' && c.find.item).length;
      return n;
    };
    expect(parts(halloween)).toBeGreaterThan(parts(null) * 1.6);
  });
});

describe('the Mode pop-up’s supply line (M49)', () => {
  it('names the event, when it ends and what the cases hold', () => {
    const [halloween, weekend] = pool.supplyEvents;
    expect(supplyLine(weekend!)).toBe('Supply weekend, until Sunday: cases hold +25 % Field Credits and +50 % parts.');
    expect(supplyLine(halloween!)).toBe('Halloween night run, until 1 Nov: cases hold +50 % Field Credits and +100 % parts.');
    expect(supplyLine(event({ name: 'Lean week', fc: 0.8 }))).toBe('Lean week, until Sunday: cases hold −20 % Field Credits.');
    expect(supplyLine(event({ name: 'Quiet', fc: 1, parts: 1 }))).toBe('Quiet, until Sunday: cases as usual.');
  });
});

describe('Supply events, the plausibility floor and the header (M56, audit POOL-03, POOL-07)', () => {
  const head = ['### Supply events', '| Supply event | Key | When | FC % | Part % |', '|---|---|---|---|---|'];
  const table = (...rows: string[]) => loadPool([...head, ...rows].join('\n'));

  it('reads a ratio where a percentage belongs as an error, leaving the row out: 1.25 is not 125 %', () => {
    const p = table('| Typo weekend | typo | Friday to Sunday | 1.25 | 150 |', '| Thin | thin | Monday | 100 | 9.9 |', '| Floor | floor | Tuesday | 10 | 0 |');
    expect(p.supplyEvents.map((e) => [e.key, e.fc, e.parts])).toEqual([['floor', 0.1, 0]]);
    expect(p.errors).toContain('line 4: FC % is a percentage (125 for a quarter more, not 1.25): "1.25" is under the least, 10 (or 0 for none)');
    expect(p.errors.some((e) => e.startsWith('line 5: Part %') && e.includes('"9.9" is under the least, 10'))).toBe(true);
  });

  it('reports a missing or mis-cased column once, at the header, instead of on every row', () => {
    const p = loadPool(['### Supply events', '| Supply event | Key | when | FC % |', '|---|---|---|---|', '| A | a | Friday | 125 |', '| B | b | Monday | 125 |'].join('\n'));
    expect(p.supplyEvents).toEqual([]);
    const own = p.errors.filter((e) => !/^no "/.test(e));
    expect(own).toEqual(['line 2: the Supply events table needs the columns Supply event, Key, When, FC %, Part %; missing: When (not "when": headers are read exactly), Part %']);
  });

  it('finds the table by its heading too, so a mis-cased first column is reported rather than read as no events', () => {
    const p = loadPool(['### Supply events', '| supply event | Key | When | FC % | Part % |', '|---|---|---|---|---|', '| A | a | Friday | 125 | 150 |'].join('\n'));
    expect(p.supplyEvents).toEqual([]);
    expect(p.errors.some((e) => e.startsWith('line 2: the Supply events table needs the columns') && e.includes('Supply event (not "supply event"'))).toBe(true);
  });
});

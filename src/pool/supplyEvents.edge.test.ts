import { describe, expect, it } from 'vitest';
import poolText from '../../pool.md?raw';
import { vec3 } from '../sim/vec';
import { type CaseSpotLike, rollRunCases } from './caches';
import { loadPool } from './pool';
import { activeSupplyEvent, isOn, kindsUnder, readWhen, type SupplyEvent, supplyLine } from './supplyEvents';

/** QA edge cases for M49 (the worker's own tests are in supplyEvents.test.ts). */
const pool = loadPool(poolText);
const at = (y: number, m: number, d: number, h = 12, min = 0, s = 0, ms = 0): Date => new Date(y, m - 1, d, h, min, s, ms);
const event = (over: Partial<SupplyEvent>): SupplyEvent => ({ name: 'Test', key: 'test', when: { weekly: { from: 5, to: 0 } }, fc: 1, parts: 1, ...over });

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

const TABLE_HEAD = ['### Supply events', '| Supply event | Key | When | FC % | Part % |', '|---|---|---|---|---|'];
/** A pool.md of just this table; the errors left are the table's own (the other tables are missing, which is not under test). */
const own = (p: ReturnType<typeof loadPool>): ReturnType<typeof loadPool> => ({ ...p, errors: p.errors.filter((e) => !/^no "/.test(e)) });
const withRows = (...rows: string[]) => own(loadPool([...TABLE_HEAD, ...rows].join('\n')));
/** The seven days of the week of 2026-10-11 (a Sunday) to 2026-10-17, as isOn answers them, Sunday first. */
const WEEK = [at(2026, 10, 11), at(2026, 10, 12), at(2026, 10, 13), at(2026, 10, 14), at(2026, 10, 15), at(2026, 10, 16), at(2026, 10, 17)];
const days = (when: Parameters<typeof isOn>[0]): number[] => WEEK.map((d, i) => (isOn(when, d) ? i : -1)).filter((i) => i >= 0);

describe('When text (M49 edge cases)', () => {
  it('ignores odd spacing and letter case, and accepts a hyphen or an en dash with spaces as the "to"', () => {
    const friToSun = { weekly: { from: 5, to: 0 } };
    expect(readWhen('  FRIDAY   TO   SUNDAY  ')).toEqual(friToSun);
    expect(readWhen('friday\tto\tsunday')).toEqual(friToSun);
    expect(readWhen('Friday - Sunday')).toEqual(friToSun);
    expect(readWhen('Friday – Sunday')).toEqual(friToSun);
    expect(readWhen('Fridays To Sundays')).toEqual(friToSun);
    expect(readWhen(' 2026-10-30   to   2026-11-01 ')).toEqual({ dated: { from: '2026-10-30', to: '2026-11-01' } });
  });

  it('rejects impossible dates, a reversed span, a mixed span and stray words', () => {
    for (const bad of ['2026-13-01', '2026-00-10', '2026-04-31', '2027-02-29', '2026-1-5', 'Friday to', 'to Sunday', 'Friday to Funday', 'Friday and Sunday', 'every Friday', '2026-10-30 to Sunday']) {
      expect(readWhen(bad), bad).toBeUndefined();
    }
    expect(readWhen('2028-02-29')).toEqual({ dated: { from: '2028-02-29', to: '2028-02-29' } }); // a real leap day
  });

  it('reads the odd spellings through pool.md too, with the Key lower-cased and the percents with or without a % sign', () => {
    const p = withRows('| Odd | Odd-Key | SATURDAY  to  MONDAY | 125% | 150 % |');
    expect(p.errors).toEqual([]);
    expect(p.supplyEvents).toEqual([{ name: 'Odd', key: 'odd-key', when: { weekly: { from: 6, to: 1 } }, fc: 1.25, parts: 1.5 }]);
  });
});

describe('weekly spans (M49 edge cases)', () => {
  it('runs a Sunday-to-Saturday span, and any span that wraps the whole week, every day', () => {
    expect(days({ weekly: { from: 0, to: 6 } })).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days(readWhen('Monday to Sunday')!)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days(readWhen('Friday to Thursday')!)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('runs one weekday alone (a name alone is one day), and a span that wraps the week’s end', () => {
    expect(days(readWhen('Wednesday')!)).toEqual([3]);
    expect(days(readWhen('Saturday to Tuesday')!)).toEqual([0, 1, 2, 6]);
    expect(days(readWhen('Sunday to Sunday')!)).toEqual([0]);
    expect(days(readWhen('Monday to Wednesday')!)).toEqual([1, 2, 3]);
  });

  it('switches at local midnight, to the millisecond', () => {
    const weekend = { weekly: { from: 5, to: 0 } };
    expect(isOn(weekend, at(2026, 10, 8, 23, 59, 59, 999))).toBe(false); // Thursday, last millisecond
    expect(isOn(weekend, at(2026, 10, 9, 0, 0, 0, 0))).toBe(true); // Friday, first
    expect(isOn(weekend, at(2026, 10, 11, 23, 59, 59, 999))).toBe(true); // Sunday, last
    expect(isOn(weekend, at(2026, 10, 12, 0, 0, 0, 0))).toBe(false); // Monday, first
  });
});

describe('dated spans (M49 edge cases)', () => {
  it('runs one day alone, a span over a month and a year end, and a leap day', () => {
    const one = readWhen('2026-12-25')!;
    expect([at(2026, 12, 24, 23, 59, 59, 999), at(2026, 12, 25, 0), at(2026, 12, 25, 23, 59, 59, 999), at(2026, 12, 26, 0)].map((d) => isOn(one, d))).toEqual([false, true, true, false]);
    const yearEnd = readWhen('2026-12-30 to 2027-01-02')!;
    expect([at(2026, 12, 29), at(2026, 12, 31), at(2027, 1, 1), at(2027, 1, 2, 23), at(2027, 1, 3)].map((d) => isOn(yearEnd, d))).toEqual([false, true, true, true, false]);
    const leap = readWhen('2028-02-28 to 2028-03-01')!;
    expect(isOn(leap, at(2028, 2, 29))).toBe(true);
    expect(isOn(leap, at(2028, 3, 2))).toBe(false);
  });

  it('is not tied to the weekday: a dated event runs on a Wednesday as on a Sunday', () => {
    const d = readWhen('2026-10-07 to 2026-10-11')!;
    expect(days(d).length).toBe(1); // only the Sunday of WEEK falls inside
    expect(isOn(d, at(2026, 10, 7))).toBe(true);
  });
});

describe('which event applies (M49 edge cases)', () => {
  it('takes the first row on, so putting the weekend above a dated event lets the weekend win', () => {
    const weekend = pool.supplyEvents.find((e) => e.key === 'supply-weekend')!;
    const halloween = pool.supplyEvents.find((e) => e.key === 'halloween-2026')!;
    expect(activeSupplyEvent([weekend, halloween], at(2026, 10, 31))?.key).toBe('supply-weekend');
    expect(activeSupplyEvent([halloween, weekend], at(2026, 10, 31))?.key).toBe('halloween-2026');
    expect(activeSupplyEvent([], at(2026, 10, 31))).toBeNull();
  });

  it('applies the next row when the first one on a day is one that could not be read', () => {
    const p = withRows('| Broken | broken | Funday | 200 | 200 |', '| Weekend | weekend | Friday to Sunday | 120 | 100 |');
    expect(activeSupplyEvent(p.supplyEvents, at(2026, 10, 10))?.key).toBe('weekend');
  });

  it('is off all week when no row is on, however many rows there are', () => {
    const p = withRows('| Mid | mid | Tuesday to Wednesday | 120 | 100 |', '| Dated | dated | 2026-01-01 | 120 | 100 |');
    expect(WEEK.map((d) => activeSupplyEvent(p.supplyEvents, d)?.key ?? null)).toEqual([null, null, 'mid', 'mid', null, null, null]);
  });
});

describe('no Supply events table, or a table with nothing readable (M49 edge cases)', () => {
  it('loads the shipped pool.md without the table: no events, no error, the cases unchanged', () => {
    const stripped = poolText.replace(/### Supply events[\s\S]*?\n---\n/, '\n---\n');
    expect(stripped).not.toContain('Supply event |');
    const p = loadPool(stripped);
    expect(p.supplyEvents).toEqual([]);
    expect(p.errors).toEqual([]);
    expect(p.caseKinds).toEqual(pool.caseKinds);
    expect(activeSupplyEvent(p.supplyEvents, at(2026, 10, 10))).toBeNull();
  });

  it('keeps an empty table as no events without an error', () => {
    const p = withRows();
    expect(p.supplyEvents).toEqual([]);
    expect(p.errors).toEqual([]);
  });

  it('reads an event whose other columns are in another order, and drops one whose columns are missing', () => {
    const swapped = own(loadPool(['### Supply events', '| Supply event | Part % | FC % | When | Key |', '|---|---|---|---|---|', '| Swapped | 150 | 125 | Friday | swap |'].join('\n')));
    expect(swapped.supplyEvents.map((e) => [e.name, e.fc, e.parts])).toEqual([['Swapped', 1.25, 1.5]]);
    const short = own(loadPool(['### Supply events', '| Supply event | Key | When |', '|---|---|---|', '| Short | short | Friday |'].join('\n')));
    expect(short.supplyEvents).toEqual([]);
    expect(short.errors.some((e) => e.includes('FC %'))).toBe(true);
  });
});

describe('percent columns (M49 edge cases)', () => {
  it('rejects an empty, negative, text or oversized percent, naming the column', () => {
    const p = withRows(
      '| A | a | Monday | | 100 |',
      '| B | b | Monday | 100 | -5 |',
      '| C | c | Monday | lots | 100 |',
      '| D | d | Monday | 100 | 1001 |',
      '| E | e | Monday | 1000 | 0 |',
    );
    expect(p.supplyEvents.map((e) => e.key)).toEqual(['e']);
    expect(p.errors.filter((e) => e.includes('FC %')).length).toBe(2);
    expect(p.errors.filter((e) => e.includes('Part %')).length).toBe(2);
  });

  it('reads 0 % as an event that empties the cases, and says so on the pop-up', () => {
    const p = withRows('| Drought | drought | Monday | 0 | 0 |');
    expect(p.errors).toEqual([]);
    const [drought] = p.supplyEvents;
    expect(drought).toMatchObject({ fc: 0, parts: 0 });
    expect(supplyLine(drought!)).toBe('Drought, until Monday: cases hold −100 % Field Credits and −100 % parts.');
  });
});

describe('what an event does to the cases (M49 edge cases)', () => {
  it('with 0 % FC and 0 % parts, every case holds no credits and no part, a resupply stays a resupply', () => {
    const drought = event({ fc: 0, parts: 0 });
    const kinds = kindsUnder(pool.caseKinds, drought);
    for (const k of kinds) {
      expect(k.fc).toEqual({ min: 0, max: 0 });
      expect(k.partChance).toBe(0);
    }
    let resupplies = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const cases = rollRunCases(pool, SPOTS, {}, seed, drought);
      expect(cases.length).toBeGreaterThan(0);
      for (const c of cases) {
        expect(c.find.fc).toBe(0);
        expect(c.find.item).toBeNull();
        if (c.find.resupply) resupplies++;
      }
    }
    expect(resupplies).toBeGreaterThan(0); // ammo cans' BB resupply chance is untouched
  });

  it('never lifts a part chance past certain, however big the multiplier, and never lifts a 0 chance', () => {
    const huge = event({ parts: 10 });
    const kinds = kindsUnder(pool.caseKinds, huge);
    for (const k of kinds) {
      const was = pool.caseKinds.find((o) => o.key === k.key)!;
      expect(k.partChance).toBe(was.partChance === 0 ? 0 : 1);
      expect(k.partChance).toBeLessThanOrEqual(1);
    }
    // Certain means every field case holds a part, over many seeds.
    for (let seed = 1; seed <= 100; seed++) {
      for (const c of rollRunCases(pool, SPOTS, {}, seed, huge)) {
        if (c.kind === 'field-case' || c.kind === 'locker') expect(c.find.item, `${c.kind} seed ${seed}`).not.toBeNull();
        else expect(c.find.item).toBeNull();
      }
    }
  });

  it('keeps the BB resupply chance and the case count, spots, open time and heard range under any event', () => {
    const kinds = kindsUnder(pool.caseKinds, event({ fc: 3, parts: 3 }));
    expect(kinds.map(({ fc, partChance, ...rest }) => rest)).toEqual(pool.caseKinds.map(({ fc, partChance, ...rest }) => rest));
  });

  it('places the same cases on the same spots on one seed under any event, even a 0 % or a huge one', () => {
    const events = [event({ fc: 0, parts: 0 }), event({ fc: 10, parts: 10 }), ...pool.supplyEvents];
    for (let seed = 1; seed <= 100; seed++) {
      const plain = rollRunCases(pool, SPOTS, {}, seed);
      for (const e of events) {
        const rich = rollRunCases(pool, SPOTS, {}, seed, e);
        expect(rich.map((c) => [c.kind, c.position, c.yaw])).toEqual(plain.map((c) => [c.kind, c.position, c.yaw]));
      }
    }
  });

  it('rolls the same run twice from one seed and event', () => {
    const weekend = pool.supplyEvents.find((e) => e.key === 'supply-weekend')!;
    expect(rollRunCases(pool, SPOTS, {}, 77, weekend)).toEqual(rollRunCases(pool, SPOTS, {}, 77, weekend));
  });

  it('rolls an event’s credits inside the scaled range, whole numbers, never below the plain minimum when it is richer', () => {
    const weekend = pool.supplyEvents.find((e) => e.key === 'supply-weekend')!;
    const kinds = kindsUnder(pool.caseKinds, weekend);
    for (let seed = 1; seed <= 200; seed++) {
      for (const c of rollRunCases(pool, SPOTS, {}, seed, weekend)) {
        if (c.find.resupply) continue;
        const k = kinds.find((x) => x.key === c.kind)!;
        expect(Number.isInteger(c.find.fc)).toBe(true);
        expect(c.find.fc).toBeGreaterThanOrEqual(k.fc.min);
        expect(c.find.fc).toBeLessThanOrEqual(k.fc.max);
      }
    }
  });

  it('keeps min at or under max for any multiplier, including fractions', () => {
    for (const fc of [0, 0.01, 0.333, 0.5, 0.999, 1.005, 1.5, 2.5, 3.14159, 10]) {
      for (const k of kindsUnder(pool.caseKinds, event({ fc }))) expect(k.fc.min, `${fc}`).toBeLessThanOrEqual(k.fc.max);
    }
  });

  it('does not change the pool it was given', () => {
    const before = JSON.stringify(pool.caseKinds);
    kindsUnder(pool.caseKinds, event({ fc: 2, parts: 2 }));
    expect(JSON.stringify(pool.caseKinds)).toBe(before);
  });
});

describe('the pop-up line (M49 edge cases)', () => {
  it('names a one-day dated event and a one-day weekly event by when they end', () => {
    expect(supplyLine({ ...event({}), when: readWhen('2026-12-25')!, name: 'Xmas' })).toBe('Xmas, until 25 Dec: cases as usual.');
    expect(supplyLine({ ...event({}), when: readWhen('Wednesday')!, name: 'Midweek', fc: 1.5 })).toBe('Midweek, until Wednesday: cases hold +50 % Field Credits.');
  });

  it('says only the part that changes', () => {
    expect(supplyLine(event({ parts: 2 }))).toBe('Test, until Sunday: cases hold +100 % parts.');
    expect(supplyLine(event({ fc: 0.5, parts: 1.5 }))).toBe('Test, until Sunday: cases hold −50 % Field Credits and +50 % parts.');
  });

  it('rounds a scale that is not a whole percent and calls a rounding-to-zero change "as usual"', () => {
    expect(supplyLine(event({ fc: 1.004, parts: 1.0001 }))).toBe('Test, until Sunday: cases as usual.');
    expect(supplyLine(event({ fc: 1.126 }))).toContain('+13 % Field Credits');
  });
});

describe('the device’s own clock, not UTC (M49 edge cases)', () => {
  /** Runs `body` with the process in another time zone (Node re-reads TZ when it changes), then puts the zone back. */
  function inZone(zone: string, body: () => void): void {
    const was = process.env.TZ;
    process.env.TZ = zone;
    try {
      body();
    } finally {
      if (was === undefined) delete process.env.TZ;
      else process.env.TZ = was;
    }
  }

  it('reads the weekday and the date as the clock on the wall says, in a zone far from UTC', () => {
    const weekend = { weekly: { from: 5, to: 0 } };
    const halloween = { dated: { from: '2026-10-30', to: '2026-11-01' } };
    // Auckland (UTC+13 in October): 00:30 on Friday there is still Thursday in UTC. Honolulu (UTC-10): 23:30 Sunday there is Monday in UTC.
    inZone('Pacific/Auckland', () => {
      expect(new Date(2026, 9, 9, 0, 30).getDate()).toBe(9); // the zone took effect
      expect(isOn(weekend, new Date(2026, 9, 9, 0, 30))).toBe(true);
      expect(isOn(weekend, new Date(2026, 9, 8, 23, 30))).toBe(false);
      expect(isOn(halloween, new Date(2026, 9, 30, 0, 30))).toBe(true);
      expect(isOn(halloween, new Date(2026, 9, 29, 23, 30))).toBe(false);
    });
    inZone('Pacific/Honolulu', () => {
      expect(isOn(weekend, new Date(2026, 9, 11, 23, 30))).toBe(true);
      expect(isOn(weekend, new Date(2026, 9, 12, 0, 30))).toBe(false);
      expect(isOn(halloween, new Date(2026, 10, 1, 23, 30))).toBe(true);
      expect(isOn(halloween, new Date(2026, 10, 2, 0, 30))).toBe(false);
    });
  });
});

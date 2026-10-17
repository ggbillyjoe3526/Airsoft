import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { balancedShare, readTimes, timesFromReport } from './shards.mjs';

const shares = (files, weights, count) => Array.from({ length: count }, (_, i) => balancedShare(files, weights, i + 1, count));
const load = (share, weights) => share.reduce((sum, f) => sum + weights[f], 0);

describe('balancedShare', () => {
  it('puts every file in exactly one share', () => {
    const weights = { a: 9, b: 7, c: 5, d: 4, e: 3, f: 1 };
    const all = shares(Object.keys(weights), weights, 3).flat();
    expect(all.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('evens out the shares by weight, not by count', () => {
    // vitest --shard would give each share two files whatever they weigh; longest first evens the seconds.
    const weights = { a: 100, b: 10, c: 10, d: 10, e: 10, f: 10 };
    const [one, two] = shares(Object.keys(weights), weights, 2);
    expect(one).toEqual(['a']);
    expect(load(two, weights)).toBe(50);
  });

  it('agrees whatever order the files are listed in', () => {
    const weights = { a: 5, b: 5, c: 5, d: 2 };
    const forward = shares(['a', 'b', 'c', 'd'], weights, 2);
    const backward = shares(['d', 'c', 'b', 'a'], weights, 2);
    expect(backward).toEqual(forward);
  });

  it('weighs a file the table does not know at the median', () => {
    const weights = { a: 10, b: 2, c: 4 };
    // new weighs 4: a | b, c, new would be 10 against 10.
    const [one, two] = shares(['a', 'b', 'c', 'new'], weights, 2);
    expect(one).toEqual(['a']);
    expect(two).toEqual(['b', 'c', 'new']);
  });

  it('leaves a share empty when there are fewer files than shares', () => {
    expect(shares(['a'], { a: 1 }, 3)).toEqual([['a'], [], []]);
  });

  it('refuses a share that is not one', () => {
    expect(() => balancedShare(['a'], {}, 0, 3)).toThrow(/not a share/);
    expect(() => balancedShare(['a'], {}, 4, 3)).toThrow(/not a share/);
  });

  it('splits the committed table into shares within a minute of each other', () => {
    const times = readTimes();
    const files = Object.keys(times);
    expect(files.length).toBeGreaterThan(0);
    const loads = shares(files, times, 3).map((s) => load(s, times));
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(60);
  });
});

describe('timesFromReport', () => {
  it('keys each file by its repository path, in whole seconds of at least one', () => {
    const root = join('/repo');
    const report = {
      testResults: [
        { name: join(root, 'src/ai/b.test.ts'), startTime: 0, endTime: 12_400 },
        { name: join(root, 'src/ai/a.test.ts'), startTime: 1000, endTime: 1200 },
      ],
    };
    expect(timesFromReport(report, root)).toEqual({ 'src/ai/a.test.ts': 1, 'src/ai/b.test.ts': 12 });
  });
});

describe('readTimes', () => {
  it('reads as an empty table when the file is missing', () => {
    expect(readTimes(join('/nowhere', 'slow-times.json'))).toEqual({});
  });
});

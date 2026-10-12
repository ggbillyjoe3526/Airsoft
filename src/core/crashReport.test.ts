import { describe, expect, it } from 'vitest';
import { CRASH_REPORT } from '../config/crash';
import { crashReport, errorLine, stackLines, withoutAddresses } from './crashReport';

function thrownWithStack(lines: number): Error {
  const e = new TypeError("Cannot read properties of undefined (reading 'x')");
  e.stack = [`${e.name}: ${e.message}`, ...Array.from({ length: lines }, (_, i) => `    at frame${i} (index-abc.js:1:${100 + i})`)].join('\n');
  return e;
}

describe('crash report (audit CORE-04)', () => {
  it('holds the build, the browser, every field in order, the error and its stack', () => {
    const text = crashReport({
      title: 'Airsoft crash report',
      build: '0.1 Dev 3+4 · abc1234',
      userAgent: 'Mozilla/5.0 Test',
      fields: [
        ['Seed', 42],
        ['Map', 'depot'],
        ['Mode', 'elimination'],
        ['Tick', 1234],
        ['Quality', 'low'],
        ['GPU', undefined],
      ],
      error: thrownWithStack(3),
    });
    expect(text.split('\n')).toEqual([
      'Airsoft crash report',
      'Build: 0.1 Dev 3+4 · abc1234',
      'Browser: Mozilla/5.0 Test',
      'Seed: 42',
      'Map: depot',
      'Mode: elimination',
      'Tick: 1234',
      'Quality: low',
      'GPU: -',
      "Error: TypeError: Cannot read properties of undefined (reading 'x')",
      'Stack:',
      'at frame0 (index-abc.js:1:100)',
      'at frame1 (index-abc.js:1:101)',
      'at frame2 (index-abc.js:1:102)',
    ]);
  });

  it('keeps only the first stack lines and says how many it left out', () => {
    const stack = stackLines(thrownWithStack(40)).split('\n');
    expect(stack).toHaveLength(CRASH_REPORT.stackLines + 1);
    expect(stack.at(-1)).toBe(`… ${40 - CRASH_REPORT.stackLines} more`);
  });

  it('copes with anything thrown, and with no error at all (the diagnostics report)', () => {
    expect(errorLine('plain string')).toBe('plain string');
    expect(errorLine({ code: 7 })).toBe('{"code":7}');
    expect(errorLine(undefined)).toBe('undefined');
    expect(stackLines('no stack')).toBe('');
    const diagnostics = crashReport({ title: 'Airsoft diagnostics', build: 'dev build', userAgent: 'UA', fields: [['FPS', 60]] });
    expect(diagnostics).toBe('Airsoft diagnostics\nBuild: dev build\nBrowser: UA\nFPS: 60');
    // A firefox-style stack (no "Name: message" first line) keeps every frame.
    const e = new Error('boom');
    e.stack = 'frameA@index.js:1:1\nframeB@index.js:1:2\n';
    expect(stackLines(e)).toBe('frameA@index.js:1:1\nframeB@index.js:1:2');
  });
});

describe('crash report lists, cuts and addresses (IM7)', () => {
  const info = {
    title: 'Airsoft diagnostics',
    build: 'b',
    userAgent: 'UA',
    fields: [['Seed', 1], ['Settings', '{}']] as const,
    lists: [
      { label: 'Recent errors', entries: ['1.0 s error: boom\n  at a (index.js:1:1)'] },
      { label: 'Recent events', entries: ['e1', 'e2', 'e3'] },
      { label: 'Nothing', entries: [] },
    ],
  };

  it('gives each list after the fields, entries indented, oldest first, and says when one is empty', () => {
    expect(crashReport(info).split('\n').slice(5)).toEqual([
      'Recent errors (1, oldest first):',
      '  1.0 s error: boom',
      '    at a (index.js:1:1)',
      'Recent events (3, oldest first):',
      '  e1',
      '  e2',
      '  e3',
      'Nothing: none',
    ]);
  });

  it('keeps the newest entries and leaves fields out when cut, saying so', () => {
    const text = crashReport(info, { keep: 1, drop: ['Settings'] });
    expect(text).toContain('Settings: (left out to fit)');
    expect(text).toContain('Recent events (newest 1 of 3):\n  e3');
    expect(text).not.toContain('e2');
  });

  it('cuts web addresses down to their file names, in stacks and messages (a folder path can hold a name)', () => {
    expect(withoutAddresses('at f (file:///C:/Users/Someone/Downloads/airsoft/assets/index-abc.js:1:2)')).toBe('at f (index-abc.js:1:2)');
    expect(withoutAddresses('g@https://host.test/Airsoft/assets/index-abc.js:3:4')).toBe('g@index-abc.js:3:4');
    expect(errorLine(new Error('Failed to fetch https://host.test/a/b/aeg.glb'))).toBe('Error: Failed to fetch aeg.glb');
    const e = new Error('x');
    e.stack = 'Error: x\n    at h (blob:https://host.test/1234-5678:9:9)';
    expect(stackLines(e)).toBe('at h (1234-5678:9:9)');
  });
});

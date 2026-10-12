import { describe, expect, it, vi } from 'vitest';
import { REPORT_LOG } from '../config/crash';
import { ErrorLog, tapConsole } from './errorLog';

function thrown(message: string): Error {
  const e = new Error(message);
  e.stack = [`Error: ${message}`, '    at a (https://example.org/game/assets/index-abc.js:1:10)', '    at b (index-abc.js:1:20)', '    at c (index-abc.js:1:30)', '    at d (index-abc.js:1:40)'].join('\n');
  return e;
}

describe('the error log (IM7)', () => {
  it('keeps each entry with when, its level, the message and the first stack lines, addresses cut to file names', () => {
    let now = 1500;
    const log = new ErrorLog(5, () => now);
    log.add('error', ['Load failed:', thrown('boom')]);
    now = 2500;
    log.add('warn', ['THREE.Material: no such parameter'], () => 'at caller (index-abc.js:9:9)');
    expect(log.lines()).toEqual([
      `1.5 s error: Load failed: Error: boom\n  at a (index-abc.js:1:10)\n  at b (index-abc.js:1:20)\n  at c (index-abc.js:1:30)`,
      '2.5 s warn: THREE.Material: no such parameter\n  at caller (index-abc.js:9:9)',
    ]);
  });

  it('counts a repeat of the newest message up instead of filling the ring, and asks no stack for it', () => {
    const log = new ErrorLog(3, () => 0);
    const site = vi.fn(() => '');
    for (let i = 0; i < 100; i++) log.add('warn', ['same thing'], site);
    expect(site).toHaveBeenCalledTimes(1);
    expect(log.lines()).toEqual(['0.0 s warn: same thing (×100)']);
  });

  it('keeps the newest entries, oldest first, once the ring is full', () => {
    const log = new ErrorLog(3, () => 0);
    for (let i = 0; i < 7; i++) log.add('error', [`error ${i}`]);
    expect(log.lines().map((l) => l.split(': ')[1])).toEqual(['error 4', 'error 5', 'error 6']);
  });

  it('names objects by kind (never stringifies a scene graph), drops %c and cuts a long message', () => {
    class Mesh {}
    const log = new ErrorLog(5, () => 0);
    log.add('warn', ['%cstyled', 'color: red', new Mesh(), 42, null]);
    log.add('error', ['x'.repeat(REPORT_LOG.messageChars + 50)]);
    const [styled, long] = log.lines();
    expect(styled).toBe('0.0 s warn: styled color: red [Mesh] 42 null');
    expect(long!.length).toBeLessThan(REPORT_LOG.messageChars + 30);
    expect(long!.endsWith('…')).toBe(true);
  });
});

describe('the console tap (IM7)', () => {
  it('copies console.error and console.warn into the log, still calls the console, and undoes', () => {
    const error = vi.fn();
    const warn = vi.fn();
    const target = { error, warn } as unknown as Console;
    const log = new ErrorLog(5, () => 0);
    const undo = tapConsole(log, target);
    target.error('bad', 1);
    target.warn('careful');
    expect(error).toHaveBeenCalledWith('bad', 1);
    expect(warn).toHaveBeenCalledWith('careful');
    expect(log.lines().map((l) => l.split('\n')[0])).toEqual(['0.0 s error: bad 1', '0.0 s warn: careful']);
    undo();
    expect(target.error).toBe(error);
    expect(target.warn).toBe(warn);
  });

  it('gives a call with no Error the caller\'s stack, starting at the caller', () => {
    const target = { error: () => undefined, warn: () => undefined } as unknown as Console;
    const log = new ErrorLog(5, () => 0);
    tapConsole(log, target);
    function callerOfTheWarning(): void {
      target.warn('from here');
    }
    callerOfTheWarning();
    const [entry] = log.lines();
    expect(entry!.split('\n')[1]).toContain('callerOfTheWarning');
  });
});

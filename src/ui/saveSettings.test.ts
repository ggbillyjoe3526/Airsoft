import { describe, expect, it } from 'vitest';
import { timeAgo } from './saveSettings';

const now = new Date(2026, 9, 4, 12, 0, 0);
const ago = (seconds: number) => timeAgo(new Date(now.getTime() - seconds * 1000), now);

describe('Save tab: how long ago (M31)', () => {
  it('says just now under a minute, and for a clock that ran ahead', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59)).toBe('just now');
    expect(ago(-300)).toBe('just now');
  });

  it('counts minutes up to the hour', () => {
    expect(ago(60)).toBe('1 min ago');
    expect(ago(5 * 60 + 30)).toBe('5 min ago');
    expect(ago(3599)).toBe('59 min ago');
  });

  it('counts hours, singular for one, up to a day', () => {
    expect(ago(3600)).toBe('1 hour ago');
    expect(ago(2 * 3600)).toBe('2 hours ago');
    expect(ago(86399)).toBe('23 hours ago');
  });

  it('says yesterday for the next day, then days, then a date from a month', () => {
    expect(ago(86400)).toBe('yesterday');
    expect(ago(86400 * 2 - 1)).toBe('yesterday');
    expect(ago(86400 * 2)).toBe('2 days ago');
    expect(ago(86400 * 29)).toBe('29 days ago');
    const old = ago(86400 * 30);
    expect(old).toMatch(/^on /);
    expect(old).toMatch(/2026/);
  });
});

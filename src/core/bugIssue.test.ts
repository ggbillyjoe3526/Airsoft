import { describe, expect, it } from 'vitest';
import { BUG_REPORT, BUG_REPORT_TEXT } from '../config/crash';
import { bugIssue, withNote } from './bugIssue';
import type { ReportInfo } from './crashReport';

const BASE = 'https://github.com/owner/game/issues/new';

function info(events = 3, settings = 'x'): ReportInfo {
  return {
    title: 'Airsoft diagnostics',
    build: '0.1 Dev 5 · abc1234',
    userAgent: 'UA',
    fields: [['Seed', 7], ['Map', 'Depot'], ['Settings', settings]],
    lists: [{ label: 'Recent events', entries: Array.from({ length: events }, (_, i) => `tick ${i}: Beta 3 hit you #${i}`) }],
  };
}

function parts(url: string): { title: string; body: string } {
  const q = new URL(url).searchParams;
  return { title: q.get('title') ?? '', body: q.get('body') ?? '' };
}

describe('Report a Bug (IM7)', () => {
  it("opens a new issue titled from the note's first line, the note then the report in a code block", () => {
    const issue = bugIssue(info(), 'The BB went through the wall\nnear the depot doors', BASE);
    expect(issue.cut).toBe(false);
    expect(issue.url.startsWith(`${BASE}?`)).toBe(true);
    const { title, body } = parts(issue.url);
    expect(title).toBe('Bug: The BB went through the wall');
    expect(body.startsWith('The BB went through the wall\nnear the depot doors\n\n```text\nAirsoft diagnostics\n')).toBe(true);
    expect(body).toContain('  tick 2: Beta 3 hit you #2');
    expect(body.endsWith('\n```')).toBe(true);
  });

  it('without a note, names the build and asks what happened', () => {
    const { title, body } = parts(bugIssue(info(), '  ', BASE).url);
    expect(title).toBe(BUG_REPORT_TEXT.title('0.1 Dev 5 · abc1234'));
    expect(body.startsWith(BUG_REPORT_TEXT.askWhat)).toBe(true);
  });

  it('cuts a long first line of the note for the title', () => {
    const { title } = parts(bugIssue(info(), 'a'.repeat(200), BASE).url);
    expect(title.length).toBe('Bug: '.length + BUG_REPORT.titleChars);
    expect(title.endsWith('…')).toBe(true);
  });

  it('cuts the report to fit the address: the oldest events first, then the settings, and says to paste the whole', () => {
    const long = info(30);
    const whole = bugIssue(long, '', BASE, 100_000);
    expect(whole.cut).toBe(false);
    const max = whole.url.length - 200;
    const fewer = bugIssue(long, '', BASE, max);
    expect(fewer.cut).toBe(true);
    expect(fewer.url.length).toBeLessThanOrEqual(max);
    const body = parts(fewer.url).body;
    expect(body).toContain(BUG_REPORT_TEXT.cutNote);
    expect(body).toContain('Recent events (newest 10 of 30):');
    expect(body).toContain('#29');
    expect(body).not.toContain('#19');

    const settings = info(30, 's'.repeat(3000));
    const noSettings = parts(bugIssue(settings, '', BASE, 2000).url).body;
    expect(noSettings).toContain('Settings: (left out to fit)');
    expect(noSettings).toContain('Recent events (newest 0 of 30):');
  });

  it('keeps as many first lines as fit when nothing else is left to cut, and never goes over', () => {
    const huge: ReportInfo = { ...info(0), fields: Array.from({ length: 400 }, (_, i) => [`Field ${i}`, 'v'.repeat(40)] as const) };
    const issue = bugIssue(huge, 'note', BASE, 3000);
    expect(issue.cut).toBe(true);
    expect(issue.url.length).toBeLessThanOrEqual(3000);
    const body = parts(issue.url).body;
    expect(body).toContain('Field 0: ');
    expect(body).not.toContain('Field 399');
  });

  it('fences the report with more backticks than any run in it, so it stays one code block', () => {
    const odd: ReportInfo = { ...info(0), fields: [['Settings', '{"note":"```js"}']] };
    const body = parts(bugIssue(odd, '', BASE).url).body;
    expect(body).toContain('````text\n');
    expect(body.endsWith('\n````')).toBe(true);
  });

  it('puts the note first among the fields of the copied report, on one line', () => {
    expect(withNote(info(), '  two\nlines  ').fields[0]).toEqual(['Note', 'two lines']);
    expect(withNote(info(), ' ').fields[0]).toEqual(['Seed', 7]);
  });
});

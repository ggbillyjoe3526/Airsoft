import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUG_REPORT, BUG_REPORT_TEXT } from '../config/crash';
import type { ReportInfo } from '../core/crashReport';
import { FakeElement } from './testSupport';

const copyText = vi.fn<(text: string) => Promise<boolean>>();
vi.mock('./clipboard', () => ({ copyText: (text: string) => copyText(text) }));

const { noteBox, reportBugLink } = await import('./bugReport');

function info(extra: string[] = []): ReportInfo {
  return { title: 'Airsoft crash report', build: '0.1 Dev 6', userAgent: 'UA', fields: [['Seed', '7']], error: new Error('boom'), lists: [{ label: 'Recent events', entries: extra }] };
}

type Link = FakeElement & { href: string; target: string; rel: string };

/** Time for the message while the bot-match guards load every core (vi.waitFor's own 1 s ran out), inside the test's 5 s. */
const SAID = { timeout: 4_000 };

describe('Report a Bug link (IM7)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeElement(tag) });
    copyText.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts at the issue page, opening in a new tab', () => {
    const link = reportBugLink(() => info(), () => '', () => {}) as unknown as Link;
    expect(link.href).toBe(BUG_REPORT.issueUrl);
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
    expect(link.textContent).toBe(BUG_REPORT_TEXT.button);
  });

  it('makes the address as it is clicked, from the report and the note as they are then', () => {
    let note = '';
    const say = vi.fn();
    const link = reportBugLink(() => info(), () => note, say) as unknown as Link;
    note = 'the door stuck';
    link.click();
    const url = new URL(link.href);
    expect(url.origin + url.pathname).toBe(BUG_REPORT.issueUrl);
    expect(url.searchParams.get('title')).toBe('Bug: the door stuck');
    expect(url.searchParams.get('body')).toContain('the door stuck');
    expect(url.searchParams.get('body')).toContain('Seed: 7');
    expect(say).toHaveBeenCalledWith(BUG_REPORT_TEXT.opened);
    expect(copyText).not.toHaveBeenCalled();
    note = 'second try';
    link.click();
    expect(new URL(link.href).searchParams.get('title')).toBe('Bug: second try');
  });

  it('copies the whole report and says so when the address had to cut it', async () => {
    const long = Array.from({ length: 400 }, (_, i) => `tick ${i}: Beta 3 hit Alpha 1 with a long line to fill the address`);
    copyText.mockResolvedValue(true);
    const said: string[] = [];
    const link = reportBugLink(() => info(long), () => 'note', (t) => said.push(t)) as unknown as Link;
    link.click();
    await vi.waitFor(() => expect(said).toEqual([BUG_REPORT_TEXT.openedCopied]), SAID);
    expect(copyText).toHaveBeenCalledTimes(1);
    const whole = copyText.mock.calls[0]![0];
    expect(whole).toContain('Note: note');
    expect(whole).toContain(long[0]!);
    expect(link.href.length).toBeLessThanOrEqual(BUG_REPORT.maxUrlChars);
    expect(new URL(link.href).searchParams.get('body')).toContain(BUG_REPORT_TEXT.cutNote);
  });

  it('says to copy by hand when the clipboard refuses', async () => {
    copyText.mockResolvedValue(false);
    const said: string[] = [];
    const long = Array.from({ length: 400 }, (_, i) => `tick ${i}: a long line to fill the address up quite a lot`);
    const link = reportBugLink(() => info(long), () => '', (t) => said.push(t)) as unknown as Link;
    link.click();
    await vi.waitFor(() => expect(said).toEqual([BUG_REPORT_TEXT.openedNotCopied]), SAID);
  });

  it('gives a note box labelled and limited in length', () => {
    const box = noteBox();
    expect(box.getAttribute('aria-label')).toBe(BUG_REPORT_TEXT.noteLabel);
    expect(box.maxLength).toBe(BUG_REPORT.noteChars);
  });
});

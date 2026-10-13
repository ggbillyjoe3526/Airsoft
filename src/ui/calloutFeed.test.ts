import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALLOUTS } from '../config/callouts';
import { CalloutFeed } from './calloutFeed';
import { FakeElement, fakeDocument, findAll } from './testSupport';

/** CL1 criterion 2: the feed's rows, order, cap, timing and clearing (on the fake DOM). */
let parent: FakeElement;
let feed: CalloutFeed;
const root = () => parent.children[0]!;
const rows = () => findAll(root(), 'callout-line');
const textOf = (row: FakeElement) => row.text.replace(/\s+/g, ' ');

beforeEach(() => {
  vi.stubGlobal('document', fakeDocument());
  parent = new FakeElement('div');
  feed = new CalloutFeed(parent as unknown as HTMLElement);
});
afterEach(() => vi.unstubAllGlobals());

describe('the callout feed', () => {
  it('starts hidden and empty, is a polite live region, and setVisible shows and hides it', () => {
    expect(root().hidden).toBe(true);
    expect(root().getAttribute('aria-live')).toBe('polite');
    expect(rows()).toHaveLength(0);
    feed.setVisible(true);
    expect(root().hidden).toBe(false);
    feed.setVisible(false);
    expect(root().hidden).toBe(true);
  });

  it('shows the name in the team colour, then the line; a screen reader hears a colon between', () => {
    feed.add('Rook', 1, 'Contact, Dock!', 0);
    const row = rows()[0]!;
    expect(row.style['--team']).toBe('var(--team-1)');
    const name = findAll(row, 'callout-name')[0]!;
    expect(name.text).toBe('Rook');
    expect(findAll(row, 'sr-only')[0]!.text).toBe(':');
    expect(textOf(row)).toBe('Rook: Contact, Dock!');
  });

  it('is the design’s numbers: 4 lines, 6 s', () => {
    expect(CALLOUTS.feedLines).toBe(4);
    expect(CALLOUTS.lineTime).toBe(6);
  });

  it('puts the newest at the bottom and keeps at most feedLines, the oldest going first', () => {
    for (let i = 0; i < CALLOUTS.feedLines + 2; i++) feed.add(`Bot${i}`, 0, `line ${i}`, 0);
    const names = rows().map((r) => findAll(r, 'callout-name')[0]!.text);
    expect(names).toHaveLength(CALLOUTS.feedLines);
    expect(names).toEqual(Array.from({ length: CALLOUTS.feedLines }, (_, k) => `Bot${k + 2}`));
  });

  it('fades a line near the end of its time and drops it at lineTime of the time passed to update', () => {
    feed.add('Rook', 0, 'Contact!', 10);
    feed.update(10 + CALLOUTS.lineTime - CALLOUTS.fadeTime - 0.01);
    expect(rows()[0]!.classList.contains('fading')).toBe(false);
    feed.update(10 + CALLOUTS.lineTime - CALLOUTS.fadeTime);
    expect(rows()[0]!.classList.contains('fading')).toBe(true);
    feed.update(10 + CALLOUTS.lineTime - 0.01);
    expect(rows()).toHaveLength(1);
    feed.update(10 + CALLOUTS.lineTime);
    expect(rows()).toHaveLength(0);
  });

  it('ages each line on its own, and a time that does not advance (a pause) holds them', () => {
    feed.add('Rook', 0, 'one', 0);
    feed.add('Vex', 0, 'two', 4);
    feed.update(3);
    feed.update(3);
    expect(rows()).toHaveLength(2);
    feed.update(CALLOUTS.lineTime);
    expect(rows().map(textOf)).toEqual(['Vex: two']);
  });

  it('clear empties it at once, and it takes new lines afterwards', () => {
    feed.add('Rook', 0, 'one', 0);
    feed.add('Vex', 0, 'two', 0);
    feed.clear();
    expect(rows()).toHaveLength(0);
    feed.add('Ash', 0, 'three', 0);
    expect(rows().map(textOf)).toEqual(['Ash: three']);
  });
});

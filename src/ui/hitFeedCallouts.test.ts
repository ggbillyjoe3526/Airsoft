import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALLOUTS } from '../config/callouts';
import { HIT_FEED } from '../config/matchInfo';
import { HitFeed } from './hitFeed';
import { FakeElement, fakeDocument, findAll } from './testSupport';

/** Dev 6 playtest item 32: the hit feed and the callout feed are one feed, top right or bottom left (on the fake DOM). */
let parent: FakeElement;
let feed: HitFeed;
const root = () => parent.children[0]!;
const rows = () => findAll(root(), 'hit-feed-line');
const callouts = () => rows().filter((r) => r.classList.contains('callout'));
const textOf = (row: FakeElement) => row.text.replace(/\s+/g, ' ');
const hit = (time: number) => feed.add({ name: 'Beta 2', team: 1 }, { name: 'Alpha 1', team: 0 }, false, false, time);

beforeEach(() => {
  vi.stubGlobal('document', fakeDocument());
  parent = new FakeElement('div');
  feed = new HitFeed(parent as unknown as HTMLElement);
});
afterEach(() => vi.unstubAllGlobals());

describe('one feed of hits and callouts', () => {
  it('is one polite live region, top right unless moved', () => {
    expect(parent.children).toHaveLength(1);
    expect(root().getAttribute('aria-live')).toBe('polite');
    expect(root().classList.contains('bottom-left')).toBe(false);
    feed.setCorner('bottomLeft');
    expect(root().classList.contains('bottom-left')).toBe(true);
    feed.setCorner('topRight');
    expect(root().classList.contains('bottom-left')).toBe(false);
  });

  it('shows a callout as the caller in their team colour, then the line; a screen reader hears a colon between', () => {
    feed.addCallout('Rook', 1, 'Contact, Dock!', 0);
    const row = callouts()[0]!;
    expect(row.style['--hitter']).toBe('var(--team-1)');
    const name = findAll(row, 'hit-feed-name')[0]!;
    expect(name.text).toBe('Rook');
    expect(name.style['--team']).toBe('var(--team-1)');
    expect(findAll(row, 'sr-only')[0]!.text).toBe(':');
    expect(textOf(row)).toBe('Rook: Contact, Dock!');
  });

  it('puts hits and callouts in one list, newest first in the DOM, and keeps at most HIT_FEED.maxLines', () => {
    for (let i = 0; i < HIT_FEED.maxLines + 2; i++) {
      if (i % 2) feed.addCallout(`Bot${i}`, 0, `line ${i}`, 0);
      else hit(0);
    }
    expect(rows()).toHaveLength(HIT_FEED.maxLines);
    expect(textOf(rows()[0]!)).toBe(`Bot${HIT_FEED.maxLines + 1}: line ${HIT_FEED.maxLines + 1}`);
  });

  it('gives a callout its own time (CALLOUTS.lineTime) and a hit its own (HIT_FEED.lineTime)', () => {
    feed.addCallout('Rook', 0, 'Contact!', 10);
    hit(10);
    feed.update(10 + CALLOUTS.lineTime - CALLOUTS.fadeTime);
    expect(callouts()[0]!.classList.contains('fading')).toBe(true);
    feed.update(10 + Math.min(CALLOUTS.lineTime, HIT_FEED.lineTime));
    expect(rows().length).toBeLessThan(2);
    feed.update(10 + Math.max(CALLOUTS.lineTime, HIT_FEED.lineTime));
    expect(rows()).toHaveLength(0);
  });

  it('keeps the hits on Keep, but callouts still come and go, at most CALLOUTS.feedLines', () => {
    feed.setMode('keep');
    hit(0);
    for (let i = 0; i < CALLOUTS.feedLines + 2; i++) feed.addCallout(`Bot${i}`, 0, 'Two left', 0);
    expect(callouts()).toHaveLength(CALLOUTS.feedLines);
    feed.update(CALLOUTS.lineTime + HIT_FEED.lineTime);
    expect(rows()).toHaveLength(1);
    expect(callouts()).toHaveLength(0);
  });

  it('starts a round without the last round\'s callouts, and without its hits unless they are kept', () => {
    hit(0);
    feed.addCallout('Rook', 0, 'Contact!', 0);
    feed.roundStarted(2);
    expect(rows()).toHaveLength(0);
    feed.setMode('keep');
    hit(1);
    feed.addCallout('Rook', 0, 'Contact!', 1);
    feed.roundStarted(3);
    expect(rows()).toHaveLength(1);
    expect(callouts()).toHaveLength(0);
  });

  it('clears only the callouts when they are turned off', () => {
    hit(0);
    feed.addCallout('Rook', 0, 'Contact!', 0);
    feed.clearCallouts();
    expect(rows()).toHaveLength(1);
    expect(callouts()).toHaveLength(0);
  });

  it('steps out of sight under the scoreboard bottom left only, its lines still timed (BP5)', () => {
    feed.setVisible(true);
    feed.addCallout('Rook', 1, 'Contact, Dock!', 0);
    feed.setCovered(true);
    expect(root().classList.contains('covered')).toBe(false);
    feed.setCorner('bottomLeft');
    expect(root().classList.contains('covered')).toBe(true);
    expect(root().hidden).toBe(false);
    feed.update(CALLOUTS.lineTime + 0.1);
    expect(rows()).toHaveLength(0);
    feed.setCovered(false);
    expect(root().classList.contains('covered')).toBe(false);
  });
});

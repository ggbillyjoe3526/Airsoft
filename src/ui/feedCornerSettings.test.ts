import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FEED_CORNER, DEFAULT_HIT_FEED_MODE, DEFAULT_WHAT_GOT_YOU_MODE, type FeedCorner } from '../config/matchInfo';
import { MemoryStorage } from '../pool/testStorage';
import { flushSettings, SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { hudSettings, loadFeedCorner } from './hudSettings';
import { type FakeElement, fakeDocument, findAll } from './testSupport';

/** Dev 6 playtest item 32 (QA): Settings › HUD › Feed position saves and loads. */
beforeEach(() => vi.stubGlobal('document', fakeDocument()));
afterEach(() => vi.unstubAllGlobals());

const noop = () => {};
const rows = (feedCorner?: { initial: FeedCorner; onChange: (c: FeedCorner) => void }) =>
  hudSettings({
    hudSize: { initial: 1, onChange: noop },
    scoreboardSize: { initial: 1, onChange: noop },
    hudOpacity: { initial: 0.9, onChange: noop },
    hitFeed: { initial: DEFAULT_HIT_FEED_MODE, onChange: noop },
    whatGotYou: { initial: DEFAULT_WHAT_GOT_YOU_MODE, onChange: noop },
    ...(feedCorner ? { feedCorner } : {}),
  }) as unknown as FakeElement[];

describe('Settings › HUD › Feed position', () => {
  it('is top right by default, and an unreadable saved value is top right', () => {
    expect(DEFAULT_FEED_CORNER).toBe('topRight');
    const s = new MemoryStorage();
    expect(loadFeedCorner(s)).toBe('topRight');
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, feedCorner: 'middle' }));
    expect(loadFeedCorner(s)).toBe('topRight');
  });

  it('has a row only when given, and a click tells the match and saves under "feedCorner"', () => {
    const labels = (all: FakeElement[]) => all.map((r) => findAll(r, 'menu-row-label')[0]?.textContent);
    expect(labels(rows())).not.toContain('Feed position');
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const seen: string[] = [];
    const row = rows({ initial: 'topRight', onChange: (c) => seen.push(c) }).find((r) => findAll(r, 'menu-row-label')[0]?.textContent === 'Feed position')!;
    const buttons = findAll(row, 'picker-button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Top right', 'Bottom left']);
    buttons[1]!.click();
    flushSettings(storage);
    expect(seen).toEqual(['bottomLeft']);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).feedCorner).toBe('bottomLeft');
    expect(loadFeedCorner(storage)).toBe('bottomLeft');
  });
});

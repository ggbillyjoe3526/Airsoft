import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALLOUT_CHOICES, DEFAULT_CALLOUTS } from '../config/callouts';
import { DEFAULT_HIT_FEED_MODE, DEFAULT_WHAT_GOT_YOU_MODE } from '../config/matchInfo';
import { MemoryStorage } from '../pool/testStorage';
import { flushSettings, SETTINGS_KEY, SETTINGS_VERSION } from '../settings/storage';
import { hudSettings, loadCallouts } from './hudSettings';
import { Minimap } from './minimap';
import { FakeElement, fakeDocument, findAll } from './testSupport';

/** CL1 criteria 1 (the minimap's area caption) and 7 (Settings › HUD › Callouts). */
beforeEach(() => vi.stubGlobal('document', fakeDocument()));
afterEach(() => vi.unstubAllGlobals());

describe('Settings › HUD › Callouts', () => {
  const noop = () => {};
  const rows = (callouts?: { initial: 'on' | 'off'; onChange: (m: 'on' | 'off') => void }) =>
    hudSettings({
      hudSize: { initial: 1, onChange: noop },
      scoreboardSize: { initial: 1, onChange: noop },
      hudOpacity: { initial: 0.9, onChange: noop },
      hitFeed: { initial: DEFAULT_HIT_FEED_MODE, onChange: noop },
      whatGotYou: { initial: DEFAULT_WHAT_GOT_YOU_MODE, onChange: noop },
      ...(callouts ? { callouts } : {}),
    }) as unknown as FakeElement[];
  const labels = (all: FakeElement[]) => all.map((r) => findAll(r, 'menu-row-label')[0]?.textContent);

  it('is On by default and offers Off first, then On', () => {
    expect(DEFAULT_CALLOUTS).toBe('on');
    expect(CALLOUT_CHOICES.map((c) => c.label)).toEqual(['Off', 'On']);
    expect(loadCallouts(new MemoryStorage())).toBe('on');
  });

  it('has a Callouts row only when the option is given', () => {
    expect(labels(rows())).not.toContain('Callouts');
    expect(labels(rows({ initial: 'on', onChange: noop }))).toContain('Callouts');
  });

  it('shows Off then On buttons, and a click tells the match and saves under "callouts"', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const seen: string[] = [];
    const row = rows({ initial: 'on', onChange: (m) => seen.push(m) }).find((r) => findAll(r, 'menu-row-label')[0]?.textContent === 'Callouts')!;
    const buttons = findAll(row, 'picker-button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Off', 'On']);
    buttons[0]!.click();
    flushSettings(storage);
    expect(seen).toEqual(['off']);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).callouts).toBe('off');
    expect(loadCallouts(storage)).toBe('off');
  });

  it('reads a saved choice, and an unreadable one as On', () => {
    const s = new MemoryStorage();
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, callouts: 'off' }));
    expect(loadCallouts(s)).toBe('off');
    s.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, callouts: 'loud' }));
    expect(loadCallouts(s)).toBe('on');
  });
});

describe('the minimap’s area caption', () => {
  function minimap() {
    const parent = new FakeElement('div');
    (parent.style as Record<string, unknown>).getPropertyValue = () => '';
    const canvasCtx = new Proxy({} as Record<string, unknown>, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', {
      createElement: (tag: string) => {
        const el = new FakeElement(tag) as FakeElement & { getContext?: () => unknown; width: number; height: number };
        el.width = 0;
        el.height = 0;
        el.getContext = () => canvasCtx;
        return el;
      },
    });
    const m = new Minimap(parent as unknown as HTMLElement, [], '#00f', '#f80');
    const caption = () => findAll(parent, 'minimap-area')[0]!;
    return { m, caption };
  }

  it('shows the area name given, and nothing when there is none', () => {
    const { m, caption } = minimap();
    expect(caption().textContent).toBe('');
    m.setArea('Main Gate');
    expect(caption().textContent).toBe('Main Gate');
    m.setArea('');
    expect(caption().textContent).toBe('');
  });
});

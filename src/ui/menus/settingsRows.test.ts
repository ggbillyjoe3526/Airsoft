import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CROSSHAIR, DEFAULT_HIT_FEED_MODE, DEFAULT_WHAT_GOT_YOU_MODE } from '../../config/matchInfo';
import { DEFAULT_LOOK } from '../../config/look';
import { DEFAULT_SOUND_CUE_COLOUR } from '../../config/accessibility';
import { MemoryStorage } from '../../pool/testStorage';
import { flushSettings, SETTINGS_KEY } from '../../settings/storage';
import { accessibilitySettings } from '../accessibilitySettings';
import { audioSettings } from '../audioSettings';
import { crosshairSettings } from '../crosshairSettings';
import { hudSettings } from '../hudSettings';
import { lookSettings } from '../lookSettings';
import { FakeElement, findAll } from '../testSupport';
import { matchesSearch } from './settingsScreen';

/** Every element under `root`, itself included, depth first. */
function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(walk)];
}

/** Fires an element's handlers for `type` (the fake DOM keeps them private). */
function fire(node: FakeElement, type: string): void {
  const listeners = (node as unknown as { listeners: Map<string, ((e: unknown) => void)[]> }).listeners.get(type) ?? [];
  for (const fn of listeners) fn({ target: node });
}

/** The fake element with the simple lookups the rows read their controls back with (a tag or a class). */
class Node extends FakeElement {
  dataset: Record<string, string> = {};
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }
  private is(sel: string): boolean {
    return sel.startsWith('.') ? this.classList.contains(sel.slice(1)) : this.tag === sel;
  }
  querySelectorAll(sel: string): Node[] {
    return (this.children as Node[]).flatMap((c) => [...(c.is(sel) ? [c] : []), ...c.querySelectorAll(sel)]);
  }
  querySelector(sel: string): Node | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  vi.stubGlobal('document', { createElement: (tag: string) => new Node(tag) });
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

/** Uses every control in `rows` (clicks each button, nudges each slider) and returns the keys the save then holds. */
function savedKeys(rows: readonly FakeElement[]): string[] {
  for (const node of rows.flatMap(walk)) {
    if (node.tag === 'button') node.click();
    if (node.tag === 'input' && node.type === 'range') {
      const range = node as FakeElement & { value: string; min: string; max: string; step: string };
      range.value = String((Number(range.min) + Number(range.max)) / 2 + Number(range.step));
      fire(node, 'input');
    }
  }
  flushSettings(storage);
  const raw = storage.getItem(SETTINGS_KEY);
  return raw ? Object.keys(JSON.parse(raw) as object).filter((k) => k !== 'version').sort() : [];
}

describe('every settings row keeps its saved key (G3, criterion 8)', () => {
  it('saves the HUD rows as hudSize, scoreboardSize, hitFeed and whatGotYou, as before the redesign', () => {
    const noop = () => {};
    const rows = hudSettings({
      hudSize: { initial: 1, onChange: noop },
      scoreboardSize: { initial: 1, onChange: noop },
      hitFeed: { initial: DEFAULT_HIT_FEED_MODE, onChange: noop },
      whatGotYou: { initial: DEFAULT_WHAT_GOT_YOU_MODE, onChange: noop },
    }) as unknown as FakeElement[];
    expect(savedKeys(rows)).toEqual(['hitFeed', 'hudSize', 'scoreboardSize', 'whatGotYou']);
  });

  it('saves the Accessibility rows as reducedMotion, teamColours, soundCues, soundCueSize and soundCueColour', () => {
    const noop = () => {};
    const rows = accessibilitySettings({
      reducedMotion: { initial: false, onChange: noop },
      teamColours: { initial: 'standard', onChange: noop },
      soundCues: { initial: false, onChange: noop },
      soundCueSize: { initial: 1, onChange: noop },
      soundCueColour: { initial: DEFAULT_SOUND_CUE_COLOUR, onChange: noop },
    }) as unknown as FakeElement[];
    expect(savedKeys(rows)).toEqual(expect.arrayContaining(['reducedMotion', 'soundCueColour', 'soundCueSize', 'soundCues', 'teamColours']));
  });

  it('saves the Audio sliders as volume.master, volume.effects and volume.interface', () => {
    const rows = audioSettings({ initial: { master: 1, effects: 1, interface: 1 } as never, onChange: () => {} }) as unknown as FakeElement[];
    expect(savedKeys(rows)).toEqual(['volume.effects', 'volume.interface', 'volume.master']);
  });

  it('saves the Look rows as robots and realisticColours', () => {
    const rows = lookSettings({ initial: DEFAULT_LOOK, onChange: () => {} }) as unknown as FakeElement[];
    expect(savedKeys(rows)).toEqual(['realisticColours', 'robots']);
  });

  it('saves the crosshair rows each under crosshair.<part>, so the saved crosshair survives the move to Gameplay', () => {
    const rows = crosshairSettings({ initial: { ...DEFAULT_CROSSHAIR }, onChange: () => {} }) as unknown as FakeElement[];
    const keys = savedKeys(rows);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const k of keys) expect(k).toMatch(/^crosshair\./);
  });
});

describe('a note on every settings row (G3, criterion 8)', () => {
  const label = (row: FakeElement) => findAll(row, 'menu-row-label')[0]?.textContent ?? '';
  const note = (row: FakeElement) => findAll(row, 'menu-row-help').map((h) => h.textContent).join(' ');

  it('gives the HUD, Accessibility, Audio and Look rows each a note', () => {
    const noop = () => {};
    const rows = [
      ...hudSettings({
        hudSize: { initial: 1, onChange: noop },
        scoreboardSize: { initial: 1, onChange: noop },
        hitFeed: { initial: DEFAULT_HIT_FEED_MODE, onChange: noop },
        whatGotYou: { initial: DEFAULT_WHAT_GOT_YOU_MODE, onChange: noop },
      }),
      ...accessibilitySettings({
        reducedMotion: { initial: false, onChange: noop },
        teamColours: { initial: 'standard', onChange: noop },
        soundCues: { initial: false, onChange: noop },
        soundCueSize: { initial: 1, onChange: noop },
        soundCueColour: { initial: DEFAULT_SOUND_CUE_COLOUR, onChange: noop },
      }),
      ...lookSettings({ initial: DEFAULT_LOOK, onChange: noop }),
    ] as unknown as FakeElement[];
    for (const r of rows) expect(note(r), label(r)).not.toBe('');
  });

  // BUG (criterion 8: "a note on every row"): audioSettings.ts SLIDERS.master.help is '', so Master volume has no note.
  it('gives every Audio slider a note, Master volume included', () => {
    const rows = audioSettings({ initial: { master: 1, effects: 1, interface: 1 } as never, onChange: () => {} }) as unknown as FakeElement[];
    for (const r of rows) expect(note(r), label(r)).not.toBe('');
  });
});

describe('the settings search (G3, criterion 8)', () => {
  it('matches a setting holding every word typed, in any order and case, and an empty search matches all', () => {
    const row = 'Hit feed Who hit whom, in the top-right corner.';
    expect(matchesSearch(row, 'HIT feed')).toBe(true);
    expect(matchesSearch(row, 'corner whom')).toBe(true);
    expect(matchesSearch(row, '   ')).toBe(true);
    expect(matchesSearch(row, 'hit volume')).toBe(false);
  });
});

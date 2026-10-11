import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, DEFAULT_RETRO, type LookSettings, type RetroSettings } from '../config/look';
import { SETTINGS_TABS } from '../config/menus';
import { SETTINGS_KEY } from '../settings/storage';
import { MemoryStorage } from '../pool/testStorage';
import { lookSettings } from './lookSettings';
import { loadLook } from './menus/savedChoices';
import { fakeDocument, type FakeElement } from './testSupport';

/** Every element under `node` with the tag, depth first. */
function all(node: FakeElement, tag: string): FakeElement[] {
  return node.children.flatMap((c) => [...(c.tag === tag ? [c] : []), ...all(c, tag)]);
}
const rows = (initial: LookSettings, onChange: (l: LookSettings) => void, retro: RetroSettings = DEFAULT_RETRO, onRetro: (r: RetroSettings) => void = () => {}): FakeElement[] =>
  lookSettings({ initial, onChange, retro: { initial: retro, onChange: onRetro } }) as unknown as FakeElement[];
const button = (row: FakeElement, label: string): FakeElement => all(row, 'button').find((b) => b.textContent === label)!;
const pressed = (row: FakeElement): string[] => all(row, 'button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const saved = (): Record<string, unknown> => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;

describe('Settings › Look (G1 acceptance 3)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is a tab of the Settings screen, built (not a placeholder), between Accessibility and Save', () => {
    const ids = SETTINGS_TABS.map((t) => t.id);
    expect(ids.indexOf('look')).toBe(ids.indexOf('accessibility') + 1);
    // G3 dropped the placeholder tabs (and their `later` flag): every listed tab is built.
    const look = SETTINGS_TABS.find((t) => t.id === 'look');
    expect(look).toMatchObject({ label: 'Look' });
    expect(look).not.toHaveProperty('later', true);
  });

  it('has Robots and Realistic colours first, showing the defaults: Mixed (robots on) and Bold (realistic off)', () => {
    const r = rows(DEFAULT_LOOK, () => {});
    expect(r).toHaveLength(5);
    expect(all(r[0]!, 'span').some((s) => s.textContent === 'Robots')).toBe(true);
    expect(all(r[1]!, 'span').some((s) => s.textContent === 'Realistic colours')).toBe(true);
    expect(pressed(r[0]!)).toEqual(['Mixed']);
    expect(pressed(r[1]!)).toEqual(['Bold']);
  });

  it('saves Robots as `robots` and calls back with both values, keeping the other row as it was', () => {
    const seen: LookSettings[] = [];
    const r = rows({ robots: true, realisticColours: true }, (l) => seen.push(l));
    expect(pressed(r[1]!)).toEqual(['Realistic']);
    button(r[0]!, 'Humans only').click();
    expect(saved().robots).toBe('off');
    expect(seen).toEqual([{ robots: false, realisticColours: true }]);
    expect(pressed(r[0]!)).toEqual(['Humans only']);
    button(r[0]!, 'Mixed').click();
    expect(saved().robots).toBe('on');
    expect(seen.at(-1)).toEqual({ robots: true, realisticColours: true });
  });

  it('saves Realistic colours as `realisticColours` and calls back, keeping Robots as it was', () => {
    const seen: LookSettings[] = [];
    const r = rows({ robots: false, realisticColours: false }, (l) => seen.push(l));
    button(r[1]!, 'Realistic').click();
    expect(saved().realisticColours).toBe('on');
    expect(seen).toEqual([{ robots: false, realisticColours: true }]);
    button(r[1]!, 'Bold').click();
    expect(saved().realisticColours).toBe('off');
    expect(seen.at(-1)).toEqual({ robots: false, realisticColours: false });
  });

  it('round-trips: what the rows save is what loadLook reads on the next visit', () => {
    const r = rows(DEFAULT_LOOK, () => {});
    button(r[0]!, 'Humans only').click();
    button(r[1]!, 'Realistic').click();
    expect(loadLook()).toEqual({ robots: false, realisticColours: true });
  });
});

describe('Settings › Look › Retro look (M96)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  const label = (row: FakeElement): string => all(row, 'span').find((s) => s.classList.contains('menu-row-label'))?.textContent ?? '';

  it('follows Realistic colours: Retro look (Off by default), then its Pixel size and Colours sliders', () => {
    const r = rows(DEFAULT_LOOK, () => {});
    expect(r.slice(2).map(label)).toEqual(['Retro look', 'Pixel size', 'Colours']);
    expect(pressed(r[2]!)).toEqual(['Off']);
    type Slider = FakeElement & { value: string; min: string; max: string };
    const [size, colours] = [all(r[3]!, 'input')[0] as Slider, all(r[4]!, 'input')[0] as Slider];
    expect([size.value, size.min, size.max]).toEqual(['4', '2', '8']);
    expect([colours.value, colours.min, colours.max]).toEqual(['6', '3', '8']);
    expect(all(r[3]!, 'output')[0]!.textContent).toBe('4 px');
    expect(all(r[4]!, 'output')[0]!.textContent).toBe('216');
  });

  it('saves the switch as retroLook and calls back at once with the sliders as they are', () => {
    const seen: RetroSettings[] = [];
    const r = rows(DEFAULT_LOOK, () => {}, { on: false, pixelSize: 6, colours: 4 }, (x) => seen.push(x));
    button(r[2]!, 'On').click();
    expect(saved().retroLook).toBe('on');
    expect(seen).toEqual([{ on: true, pixelSize: 6, colours: 4 }]);
    button(r[2]!, 'Off').click();
    expect(seen.at(-1)).toEqual({ on: false, pixelSize: 6, colours: 4 });
  });
});

describe('loadLook (G1 acceptance 3)', () => {
  beforeEach(() => vi.stubGlobal('localStorage', new MemoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('reads the defaults, Robots on and Realistic colours off, from an empty store', () => {
    expect(loadLook()).toEqual({ robots: true, realisticColours: false });
    expect(loadLook()).toEqual(DEFAULT_LOOK);
  });

  it('reads the defaults from an older save with other settings but neither key', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, difficulty: 'hard', 'hopUp.000001': 0.5 }));
    expect(loadLook()).toEqual({ robots: true, realisticColours: false });
  });

  it('reads the saved values, each on its own, and ignores a value it does not know', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, robots: 'off', realisticColours: 'on' }));
    expect(loadLook()).toEqual({ robots: false, realisticColours: true });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, robots: 'off' }));
    expect(loadLook()).toEqual({ robots: false, realisticColours: false });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, robots: 'maybe', realisticColours: 7 }));
    expect(loadLook()).toEqual(DEFAULT_LOOK);
  });
});

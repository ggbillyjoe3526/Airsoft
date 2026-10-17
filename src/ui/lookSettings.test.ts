import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOOK, DEFAULT_RETRO, type LookSettings, type RetroSettings } from '../config/look';
import { SETTINGS_TABS } from '../config/menus';
import { SETTINGS_KEY } from '../settings/storage';
import { MemoryStorage } from '../pool/testStorage';
import { lookSettings } from './lookSettings';
import { retroSettings } from './retroSettings';
import { loadLook } from '../settings/savedChoices';
import { fakeDocument, type FakeElement } from './testSupport';

/** Every element under `node` with the tag, depth first. */
function all(node: FakeElement, tag: string): FakeElement[] {
  return node.children.flatMap((c) => [...(c.tag === tag ? [c] : []), ...all(c, tag)]);
}
const rows = (initial: LookSettings, onChange: (l: LookSettings) => void): FakeElement[] =>
  lookSettings({ initial, onChange }) as unknown as FakeElement[];
const retroRows = (initial: RetroSettings = DEFAULT_RETRO, onChange: (r: RetroSettings) => void = () => {}): FakeElement[] =>
  retroSettings({ initial, onChange }) as unknown as FakeElement[];
const button = (row: FakeElement, label: string): FakeElement => all(row, 'button').find((b) => b.textContent === label)!;
const pressed = (row: FakeElement): string[] => all(row, 'button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const saved = (): Record<string, unknown> => JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
const label = (row: FakeElement): string => all(row, 'span').find((s) => s.classList.contains('menu-row-label'))?.textContent ?? '';

describe('Settings › Looks (G1; Dev 6 playtest)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is a tab of the Settings screen, built (not a placeholder), named Looks, after Gameplay in William's order", () => {
    const ids = SETTINGS_TABS.map((t) => t.id);
    expect(ids.indexOf('look')).toBe(ids.indexOf('gameplay') + 1);
    const look = SETTINGS_TABS.find((t) => t.id === 'look');
    expect(look).toMatchObject({ label: 'Looks' });
    expect(look).not.toHaveProperty('later', true);
  });

  it('holds only Robots, showing its default (Mixed): Realistic colours and the Retro look have left it', () => {
    const r = rows(DEFAULT_LOOK, () => {});
    expect(r.map(label)).toEqual(['Robots']);
    expect(pressed(r[0]!)).toEqual(['Mixed']);
  });

  it('saves Robots as `robots` and calls back, passing a saved Realistic colours on as it was', () => {
    const seen: LookSettings[] = [];
    const r = rows({ robots: true, realisticColours: true }, (l) => seen.push(l));
    button(r[0]!, 'Humans only').click();
    expect(saved().robots).toBe('off');
    expect(seen).toEqual([{ robots: false, realisticColours: true }]);
    expect(pressed(r[0]!)).toEqual(['Humans only']);
    button(r[0]!, 'Mixed').click();
    expect(saved().robots).toBe('on');
    expect(seen.at(-1)).toEqual({ robots: true, realisticColours: true });
  });

  it('round-trips: what the row saves is what loadLook reads on the next visit', () => {
    const r = rows(DEFAULT_LOOK, () => {});
    button(r[0]!, 'Humans only').click();
    expect(loadLook()).toEqual({ robots: false, realisticColours: false });
  });
});

describe('Settings › Dev › Retro look (M96; moved to Dev in the Dev 6 playtest)', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument());
    vi.stubGlobal('localStorage', new MemoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is the Retro look (Off by default), then its Pixel size and Colours sliders', () => {
    const r = retroRows();
    expect(r.map(label)).toEqual(['Retro look', 'Pixel size', 'Colours']);
    expect(pressed(r[0]!)).toEqual(['Off']);
    type Slider = FakeElement & { value: string; min: string; max: string };
    const [size, colours] = [all(r[1]!, 'input')[0] as Slider, all(r[2]!, 'input')[0] as Slider];
    expect([size.value, size.min, size.max]).toEqual(['4', '2', '8']);
    expect([colours.value, colours.min, colours.max]).toEqual(['6', '3', '8']);
    expect(all(r[1]!, 'output')[0]!.textContent).toBe('4 px');
    expect(all(r[2]!, 'output')[0]!.textContent).toBe('216');
  });

  it('saves the switch as retroLook and calls back at once with the sliders as they are', () => {
    const seen: RetroSettings[] = [];
    const r = retroRows({ on: false, pixelSize: 6, colours: 4 }, (x) => seen.push(x));
    button(r[0]!, 'On').click();
    expect(saved().retroLook).toBe('on');
    expect(seen).toEqual([{ on: true, pixelSize: 6, colours: 4 }]);
    button(r[0]!, 'Off').click();
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

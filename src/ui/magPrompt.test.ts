import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAG_PROMPTS, MAG_SHARE, MAG_WHEEL_LABELS } from '../config/magShare';
import { loadSetting, oneOf, saveSetting, SETTINGS_KEY } from '../settings/storage';
import { loadMagPrompts } from '../settings/hudPrefs';
import { ORDER_WHEEL } from '../config/squad';
import { MagPrompt, magLine } from './magPrompt';
import { ORDER_KEYS, OrderWheel } from './orderWheel';
import { TeammateMarkers } from './teammateMarkers';
import { FakeElement, fakeDocument } from './testSupport';

/** MG1: the magazine hand-off on the HUD. The lines, the prompt under the crosshair, the wheel's item and the name tag. */

describe('the hand-off lines (MG1)', () => {
  it('fill in the name, the key, the distance and the BBs', () => {
    expect(magLine('toss', { key: 'H', name: 'Kit' })).toBe('H · Toss Kit a mag');
    expect(magLine('needs', { name: 'Kit', m: 12.4 })).toBe('Kit needs a mag · 12 m');
    expect(magLine('caught', { name: 'Kit', bbs: 60 })).toBe('+1 mag from Kit · 60 BBs');
    expect(magLine('ask', { key: 'H' })).toBe('Low on BBs · H to ask for a mag');
  });

  it('name the order wheel instead of the key when the Mag key is unbound', () => {
    expect(magLine('toss', { key: '', name: 'Kit' })).toBe('Toss Kit a mag on the order wheel');
    expect(magLine('ask', { key: '' })).toBe(MAG_SHARE.words.askWheel);
  });

  it('are all short and filled, with nothing left in braces', () => {
    for (const words of Object.keys(MAG_SHARE.words) as (keyof typeof MAG_SHARE.words)[]) {
      const line = magLine(words, { key: 'H', name: 'Rook', m: 30, bbs: 60 });
      expect(line, words).not.toMatch(/[{}]/);
      expect(line.length, words).toBeLessThanOrEqual(48);
    }
  });
});

describe('the hand-off on the HUD (MG1)', () => {
  beforeEach(() => vi.stubGlobal('document', fakeDocument()));
  afterEach(() => vi.unstubAllGlobals());

  it('shows the line it is given, a toss in the team colour, and nothing with Mag hand-off off', () => {
    const parent = new FakeElement('div');
    const prompt = new MagPrompt(parent as unknown as HTMLElement, '#4af');
    const root = parent.children[0]!;
    expect(root.hidden).toBe(true);
    prompt.show('H · Toss Kit a mag', true);
    expect([root.hidden, root.textContent, root.classList.contains('toss')]).toEqual([false, 'H · Toss Kit a mag', true]);
    prompt.show('Kit needs a mag · 12 m', false);
    expect(root.classList.contains('toss')).toBe(false);
    prompt.setShown(false);
    expect([root.hidden, prompt.enabled]).toEqual([true, false]);
    prompt.show('Kit needs a mag · 11 m', false);
    expect(root.hidden).toBe(true);
    prompt.setShown(true);
    prompt.show('', false);
    expect(root.hidden).toBe(true);
  });

  it("gives the wheel a fifth order, Need a Mag on the Mag key, that reads Toss a Mag when a toss is in reach", () => {
    const item = ORDER_WHEEL.items.find((i) => i.command === 'mag')!;
    expect(item.label).toBe(MAG_WHEEL_LABELS.ask);
    expect(ORDER_KEYS.mag).toBe('askMag');
    const parent = new FakeElement('div');
    const wheel = new OrderWheel(parent as unknown as HTMLElement, '#4af', () => 'H');
    const labels = parent.children[0]!.children.filter((c) => c.className === 'order-wheel-item').map((el) => el.children[0]!);
    const mag = labels[ORDER_WHEEL.items.indexOf(item)]!;
    wheel.update(true, -1, 0, 0, 'none', '');
    expect(mag.textContent).toBe(MAG_WHEEL_LABELS.ask);
    wheel.update(true, -1, 0, 0, 'none', '', MAG_WHEEL_LABELS.toss);
    expect(mag.textContent).toBe(MAG_WHEEL_LABELS.toss);
    expect(labels.map((l) => l.textContent)).toEqual(ORDER_WHEEL.items.map((i) => (i === item ? MAG_WHEEL_LABELS.toss : i.label)));
  });

  it('tags a teammate asking you or bringing you one', () => {
    const parent = new FakeElement('div');
    const tags = new TeammateMarkers(parent as unknown as HTMLElement, ['Kit', 'Rook'], '#4af');
    tags.setMag(1, true);
    expect(parent.children.map((c) => c.classList.contains('mag'))).toEqual([false, true]);
    tags.setMag(1, false);
    expect(parent.children[1]!.classList.contains('mag')).toBe(false);
  });
});

describe('Settings › HUD › Mag hand-off (MG1)', () => {
  /** A Storage backed by a Map. */
  function memory(): Storage {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
  }

  it('is on unless saved off, under the key magPrompts, and junk reads as the default', () => {
    const s = memory();
    expect(DEFAULT_MAG_PROMPTS).toBe('on');
    expect(loadMagPrompts(s)).toBe('on');
    saveSetting('magPrompts', 'off', s);
    expect(loadMagPrompts(s)).toBe('off');
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!).magPrompts).toBe('off');
    saveSetting('magPrompts', 'on', s);
    expect(loadMagPrompts(s)).toBe('on');
    saveSetting('magPrompts', 'sideways', s);
    expect(loadMagPrompts(s)).toBe('on');
    expect(loadSetting('magPrompts', oneOf(['on', 'off']), 'on', s)).toBe('on');
  });
});
